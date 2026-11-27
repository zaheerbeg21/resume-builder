import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createUploadUrlRoute } from '@/app/api/resumes/upload-url/route';
import * as entitlements from '@/lib/billing/entitlements';
import * as supabaseServer from '@/lib/db/supabase-server';
import {
  EXPIRED_UPLOAD_AGE_MS,
  MAX_CLEANUP_OBJECTS_PER_RUN,
  MAX_RESUME_UPLOAD_BYTES,
  RESUMES_RAW_BUCKET,
  ResumeUploadError,
  SIGNED_UPLOAD_EXPIRY_SECONDS,
  STORAGE_PAGE_SIZE,
  UPLOAD_RATE_LIMIT_MAX_REQUESTS,
  UPLOAD_RATE_LIMIT_RPC_TIMEOUT_MS,
  UPLOAD_RATE_LIMIT_WINDOW_MS,
  checkAndConsumeUploadRateLimit,
  cleanupExpiredResumeUploads,
  hasPdfMagicBytes,
  isOwnedPdfStoragePath,
  purgeUploadedResume,
  resetUploadRateLimitForTesting,
  verifyUploadedResume,
} from '@/lib/storage/resume-upload';

interface MockStorageObject {
  path: string;
  bytes: Uint8Array;
  createdAt: string;
}

interface MockParseJobRow {
  id: string;
  user_id: string;
  storage_path: string;
  status: string;
  expires_at: string;
}

interface MockAdminOptions {
  objects?: MockStorageObject[];
  jobs?: MockParseJobRow[];
  rpcError?: Error | { message: string; code?: string } | null;
  rpcDataOverride?: unknown;
}

function createMockAdminSupabase(options?: MockAdminOptions) {
  const objects = new Map<string, MockStorageObject>();
  for (const obj of options?.objects ?? []) {
    objects.set(obj.path, obj);
  }
  const jobs: MockParseJobRow[] = [...(options?.jobs ?? [])];
  const removedPaths: string[] = [];
  const signedCalls: string[] = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];

  // In-memory simulation of the PostgreSQL rate limit table
  const rateLimitStore = new Map<
    string,
    { count: number; windowStartSeconds: number }
  >();

  const client = {
    rpc: vi.fn(async (fnName: string, args: { p_user_id?: string }) => {
      rpcCalls.push({ fn: fnName, args });

      if (options?.rpcError) {
        return { data: null, error: options.rpcError };
      }

      if (options?.rpcDataOverride !== undefined) {
        return { data: options.rpcDataOverride, error: null };
      }

      if (fnName === 'consume_upload_rate_limit') {
        const userId = args.p_user_id;
        if (!userId) {
          return {
            data: [{ allowed: false, current_count: 0, reset_epoch_seconds: 0 }],
            error: null,
          };
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        let entry = rateLimitStore.get(userId);

        if (!entry) {
          entry = { count: 1, windowStartSeconds: nowSeconds };
          rateLimitStore.set(userId, entry);
          return {
            data: [
              {
                allowed: true,
                current_count: 1,
                reset_epoch_seconds: nowSeconds + 60,
              },
            ],
            error: null,
          };
        }

        if (nowSeconds >= entry.windowStartSeconds + 60) {
          entry.windowStartSeconds = nowSeconds;
          entry.count = 1;
        } else {
          entry.count = Math.min(entry.count + 1, 6);
        }

        const allowed = entry.count <= 5;
        return {
          data: [
            {
              allowed,
              current_count: entry.count,
              reset_epoch_seconds: entry.windowStartSeconds + 60,
            },
          ],
          error: null,
        };
      }

      throw new Error(`Unexpected RPC call: ${fnName}`);
    }),

    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe(RESUMES_RAW_BUCKET);
        return {
          createSignedUploadUrl: vi.fn(async (storagePath: string) => {
            signedCalls.push(storagePath);
            return {
              data: {
                signedUrl: `https://storage.local/upload/${storagePath}?token=tok-123`,
                token: 'tok-123',
                path: storagePath,
              },
              error: null,
            };
          }),
          download: vi.fn(async (storagePath: string) => {
            const found = objects.get(storagePath);
            if (!found) {
              return {
                data: null,
                error: { message: 'Object not found', statusCode: '404' },
              };
            }
            const copy = new Uint8Array(found.bytes.byteLength);
            copy.set(found.bytes);
            const blob = new Blob([copy], { type: 'application/pdf' });
            return { data: blob, error: null };
          }),
          remove: vi.fn(async (paths: string[]) => {
            for (const p of paths) {
              removedPaths.push(p);
              objects.delete(p);
            }
            return { data: [], error: null };
          }),
          list: vi.fn(
            async (
              prefix = '',
              listOptions?: { limit?: number; offset?: number },
            ) => {
              const limit = listOptions?.limit ?? STORAGE_PAGE_SIZE;
              const offset = listOptions?.offset ?? 0;

              if (!prefix) {
                // Top-level folder listing
                const folders = new Set<string>();
                for (const key of objects.keys()) {
                  const seg = key.split('/')[0];
                  if (seg) folders.add(seg);
                }
                const allFolders = Array.from(folders)
                  .sort()
                  .map((name) => ({
                    name,
                    id: null,
                    created_at: null,
                  }));
                return {
                  data: allFolders.slice(offset, offset + limit),
                  error: null,
                };
              }

              const normalizedPrefix = prefix.endsWith('/')
                ? prefix
                : `${prefix}/`;
              const items = Array.from(objects.values())
                .filter((obj) => obj.path.startsWith(normalizedPrefix))
                .sort((a, b) => a.path.localeCompare(b.path))
                .map((obj) => ({
                  name: obj.path.slice(normalizedPrefix.length),
                  id: obj.path,
                  created_at: obj.createdAt,
                  metadata: { size: obj.bytes.byteLength },
                }));

              return {
                data: items.slice(offset, offset + limit),
                error: null,
              };
            },
          ),
        };
      },
    },

    from: (table: string) => {
      if (table !== 'parse_jobs') {
        throw new Error(`Unexpected table query: ${table}`);
      }
      return {
        delete: () => ({
          lt: (col: string, cutoffIso: string) => ({
            select: async () => {
              expect(col).toBe('expires_at');
              const cutoffMs = Date.parse(cutoffIso);
              const deleted: MockParseJobRow[] = [];
              for (let i = jobs.length - 1; i >= 0; i--) {
                if (Date.parse(jobs[i].expires_at) < cutoffMs) {
                  deleted.push(jobs[i]);
                  jobs.splice(i, 1);
                }
              }
              return { data: deleted, error: null };
            },
          }),
        }),
      };
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    objects,
    jobs,
    removedPaths,
    signedCalls,
    rpcCalls,
  };
}

describe('T-020: Signed-URL Private Storage Pipeline & parse_jobs Schema', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetUploadRateLimitForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC 1, 2 & 5: migration 20261025 configures private resumes-raw bucket, Storage RLS, and parse_jobs RLS', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '20261025000000_resumes_raw_storage.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("'resumes-raw'");
    expect(sql).toContain('false');
    expect(sql).toContain('5242880');
    expect(sql).toContain("array['application/pdf']");
    expect(sql).toContain('(storage.foldername(name))[1] = auth.uid()::text');
    expect(sql).toMatch(/for\s+insert/i);
    expect(sql).toMatch(/for\s+select/i);
    expect(sql).not.toMatch(
      /create\s+policy[^\n]*for\s+delete\s+on\s+storage\.objects/i,
    );

    expect(sql).toContain('create table if not exists public.parse_jobs');
    expect(sql).toContain(
      "expires_at timestamptz default (now() + interval '1 hour')",
    );
    expect(sql).toContain('alter table public.parse_jobs enable row level security');
    expect(sql).toContain('create policy own_jobs on public.parse_jobs');
    expect(sql).toContain('user_id = auth.uid()');
  });

  it('Gate 1 & Additive Migration: 20261026000000_upload_rate_limits.sql defines table, check constraint, RPC, and ACLs', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '20261026000000_upload_rate_limits.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Table definition and saturation constraint (1..6)
    expect(sql).toContain('create table public.upload_rate_limits');
    expect(sql).toContain('check (request_count >= 1 and request_count <= 6)');
    expect(sql).toContain(
      'revoke all on table public.upload_rate_limits from public, anon, authenticated',
    );

    // RPC function and security definer properties
    expect(sql).toContain(
      'create function public.consume_upload_rate_limit(p_user_id uuid)',
    );
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("set lock_timeout = '75ms'");
    expect(sql).toContain("set statement_timeout = '75ms'");

    // Post-lock sampling and saturation ceiling
    expect(sql).toContain('for update');
    expect(sql).toContain('pg_catalog.clock_timestamp()');
    expect(sql).toContain('least(v_count + 1, v_saturation_ceiling)');

    // Permissions
    expect(sql).toContain(
      'alter function public.consume_upload_rate_limit(uuid) owner to postgres',
    );
    expect(sql).toContain(
      'revoke all on function public.consume_upload_rate_limit(uuid) from public, anon, authenticated',
    );
    expect(sql).toContain(
      'grant execute on function public.consume_upload_rate_limit(uuid) to service_role',
    );
  });

  it('AC 2: isOwnedPdfStoragePath blocks cross-tenant, traversal, prefix-spoof, and non-PDF paths', () => {
    const userId = 'user-1111';
    expect(isOwnedPdfStoragePath(`${userId}/doc-123.pdf`, userId)).toBe(true);

    expect(isOwnedPdfStoragePath('user-2222/doc-123.pdf', userId)).toBe(false);
    expect(isOwnedPdfStoragePath(`${userId}-evil/doc-123.pdf`, userId)).toBe(
      false,
    );
    expect(
      isOwnedPdfStoragePath(`${userId}/../user-2222/doc-123.pdf`, userId),
    ).toBe(false);
    expect(isOwnedPdfStoragePath(`${userId}/nested/doc-123.pdf`, userId)).toBe(
      false,
    );
    expect(isOwnedPdfStoragePath(`${userId}/doc-123.docx`, userId)).toBe(false);
    expect(isOwnedPdfStoragePath(`/${userId}/doc-123.pdf`, userId)).toBe(false);
  });

  it('AC 3: POST /api/resumes/upload-url rejects unauthenticated requests with 401', async () => {
    vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: null,
        })),
      },
    } as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);

    const res = await createUploadUrlRoute(
      new Request('http://localhost/api/resumes/upload-url', { method: 'POST' }),
    );
    expect(res.status).toBe(401);
  });

  it('AC 3: POST /api/resumes/upload-url issues scoped signed URL and enforces 5/min per-user rate limit via RPC', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let activeUserId = 'user-alpha';
    vi.spyOn(supabaseServer, 'createClient').mockImplementation(
      (async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: {
              user: {
                id: activeUserId,
                email: `${activeUserId}@example.org`,
              },
            },
            error: null,
          })),
        },
      })) as unknown as typeof supabaseServer.createClient,
    );

    const { client: mockAdmin, signedCalls, rpcCalls } = createMockAdminSupabase();
    vi.spyOn(entitlements, 'getServiceRoleClient').mockReturnValue(mockAdmin);

    // 5 allowed requests
    for (let i = 0; i < UPLOAD_RATE_LIMIT_MAX_REQUESTS; i++) {
      const res = await createUploadUrlRoute(
        new Request('http://localhost/api/resumes/upload-url', {
          method: 'POST',
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        signedUrl: string;
        storagePath: string;
        expiresIn: number;
      };
      expect(body.expiresIn).toBe(SIGNED_UPLOAD_EXPIRY_SECONDS);
      expect(body.storagePath).toMatch(/^user-alpha\/[0-9a-f-]+\.pdf$/i);
      expect(body.signedUrl).toContain(body.storagePath);
    }

    expect(signedCalls).toHaveLength(UPLOAD_RATE_LIMIT_MAX_REQUESTS);
    expect(rpcCalls).toHaveLength(UPLOAD_RATE_LIMIT_MAX_REQUESTS);

    // 6th request within the same window returns 429 with Retry-After header
    const limitedRes = await createUploadUrlRoute(
      new Request('http://localhost/api/resumes/upload-url', {
        method: 'POST',
      }),
    );
    expect(limitedRes.status).toBe(429);
    expect(Number(limitedRes.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Signed URL must NEVER be generated when rate-limited!
    expect(signedCalls).toHaveLength(UPLOAD_RATE_LIMIT_MAX_REQUESTS);

    // A separate user has an independent quota
    activeUserId = 'user-beta';
    const otherUserRes = await createUploadUrlRoute(
      new Request('http://localhost/api/resumes/upload-url', {
        method: 'POST',
      }),
    );
    expect(otherUserRes.status).toBe(200);
    expect(signedCalls).toHaveLength(UPLOAD_RATE_LIMIT_MAX_REQUESTS + 1);

    // Window constant verification
    expect(UPLOAD_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('Fail-Closed: ambiguous database error or RPC failure returns HTTP 503 with Retry-After: 5 and no signed URL', async () => {
    vi.spyOn(supabaseServer, 'createClient').mockImplementation(
      (async () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: {
              user: {
                id: 'user-db-error',
                email: 'user-db-error@example.org',
              },
            },
            error: null,
          })),
        },
      })) as unknown as typeof supabaseServer.createClient,
    );

    // Case 1: RPC returns database error (e.g. 57014 timeout)
    const { client: mockAdminError, signedCalls: errorSignedCalls } =
      createMockAdminSupabase({
        rpcError: { message: 'canceling statement due to statement timeout', code: '57014' },
      });
    vi.spyOn(entitlements, 'getServiceRoleClient').mockReturnValue(mockAdminError);

    const errorRes = await createUploadUrlRoute(
      new Request('http://localhost/api/resumes/upload-url', { method: 'POST' }),
    );
    expect(errorRes.status).toBe(503);
    expect(errorRes.headers.get('Retry-After')).toBe('5');
    const errorBody = (await errorRes.json()) as { error: string };
    expect(errorBody.error).toContain('unavailable');
    expect(errorSignedCalls).toHaveLength(0);

    // Case 2: RPC returns malformed payload
    const { client: mockAdminMalformed, signedCalls: malformedSignedCalls } =
      createMockAdminSupabase({
        rpcDataOverride: [{ invalid_key: true }],
      });
    vi.spyOn(entitlements, 'getServiceRoleClient').mockReturnValue(mockAdminMalformed);

    const malformedRes = await createUploadUrlRoute(
      new Request('http://localhost/api/resumes/upload-url', { method: 'POST' }),
    );
    expect(malformedRes.status).toBe(503);
    expect(malformedRes.headers.get('Retry-After')).toBe('5');
    expect(malformedSignedCalls).toHaveLength(0);
  });

  it('Fail-Closed: RPC timeout at 150 ms aborts builder signal, fails closed, and avoids unhandled rejection on late failure', async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    let capturedSignal: AbortSignal | undefined;
    let rejectRpc!: (err: Error) => void;
    const hangingRpcPromise = new Promise<{ data: null; error: null }>(
      (_, reject) => {
        rejectRpc = reject;
      },
    );
    const rpcBuilder = Object.assign(hangingRpcPromise, {
      abortSignal: vi.fn((signal: AbortSignal) => {
        capturedSignal = signal;
        return hangingRpcPromise;
      }),
    });

    const mockAdmin = {
      rpc: vi.fn(() => rpcBuilder),
    } as unknown as SupabaseClient;

    try {
      expect(UPLOAD_RATE_LIMIT_RPC_TIMEOUT_MS).toBe(2000);
      const result = await checkAndConsumeUploadRateLimit('user-timeout', {
        adminClient: mockAdmin,
        timeoutMs: 150,
      });

      expect(result).toEqual({
        allowed: false,
        isAmbiguousFailure: true,
        retryAfterSeconds: 5,
      });
      expect(rpcBuilder.abortSignal).toHaveBeenCalledTimes(1);
      expect(capturedSignal?.aborted).toBe(true);

      // Reject strictly after timeoutPromise won Promise.race
      rejectRpc(new Error('late RPC network failure'));
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('AC 4: hasPdfMagicBytes & verifyUploadedResume enforce ownership, 5 MB limit, and %PDF magic bytes', async () => {
    const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
    const docxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // PK..
    const oversizedBytes = new Uint8Array(MAX_RESUME_UPLOAD_BYTES + 1);
    oversizedBytes.set([0x25, 0x50, 0x44, 0x46], 0);

    expect(hasPdfMagicBytes(validPdfBytes)).toBe(true);
    expect(hasPdfMagicBytes(docxBytes)).toBe(false);
    expect(hasPdfMagicBytes(new Uint8Array([0x25, 0x50, 0x44]))).toBe(false);

    const { client: mockAdmin } = createMockAdminSupabase({
      objects: [
        {
          path: 'user-1/valid.pdf',
          bytes: validPdfBytes,
          createdAt: '2026-11-11T10:00:00.000Z',
        },
        {
          path: 'user-1/spoofed.pdf',
          bytes: docxBytes,
          createdAt: '2026-11-11T10:00:00.000Z',
        },
        {
          path: 'user-1/too-big.pdf',
          bytes: oversizedBytes,
          createdAt: '2026-11-11T10:00:00.000Z',
        },
        {
          path: 'user-2/secret.pdf',
          bytes: validPdfBytes,
          createdAt: '2026-11-11T10:00:00.000Z',
        },
      ],
    });

    // Cross-tenant access must fail with 403 before reading storage.
    await expect(
      verifyUploadedResume('user-2/secret.pdf', 'user-1', {
        adminClient: mockAdmin,
      }),
    ).rejects.toMatchObject<Partial<ResumeUploadError>>({
      statusCode: 403,
      code: 'forbidden_path',
    });

    // Missing object must fail with 404.
    await expect(
      verifyUploadedResume('user-1/missing.pdf', 'user-1', {
        adminClient: mockAdmin,
      }),
    ).rejects.toMatchObject<Partial<ResumeUploadError>>({
      statusCode: 404,
      code: 'object_not_found',
    });

    // Non-PDF magic bytes must abort with HTTP 422.
    await expect(
      verifyUploadedResume('user-1/spoofed.pdf', 'user-1', {
        adminClient: mockAdmin,
      }),
    ).rejects.toMatchObject<Partial<ResumeUploadError>>({
      statusCode: 422,
      code: 'invalid_pdf_magic_bytes',
    });

    // Oversized (> 5 MB) must abort with HTTP 422.
    await expect(
      verifyUploadedResume('user-1/too-big.pdf', 'user-1', {
        adminClient: mockAdmin,
      }),
    ).rejects.toMatchObject<Partial<ResumeUploadError>>({
      statusCode: 422,
      code: 'file_too_large',
    });

    const ok = await verifyUploadedResume('user-1/valid.pdf', 'user-1', {
      adminClient: mockAdmin,
    });
    expect(ok.storagePath).toBe('user-1/valid.pdf');
    expect(ok.sizeBytes).toBe(validPdfBytes.byteLength);
    expect(hasPdfMagicBytes(ok.bytes)).toBe(true);
  });

  it('AC 6 & B-02: cleanupExpiredResumeUploads enforces collect-then-delete, pagination, and bounded 500-object cap', async () => {
    const now = new Date('2026-11-11T12:00:00.000Z');
    const expiredIso = new Date(
      now.getTime() - EXPIRED_UPLOAD_AGE_MS - 60_000,
    ).toISOString();
    const freshIso = new Date(now.getTime() - 5 * 60_000).toISOString();

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const { client: mockAdmin, objects, jobs, removedPaths } =
      createMockAdminSupabase({
        objects: [
          {
            path: 'user-1/in-flight.pdf',
            bytes: pdfBytes,
            createdAt: freshIso,
          },
          {
            path: 'user-1/orphan-expired.pdf',
            bytes: pdfBytes,
            createdAt: expiredIso,
          },
          {
            path: 'user-1/job-expired.pdf',
            bytes: pdfBytes,
            createdAt: freshIso,
          },
          {
            path: 'user-2/fresh.pdf',
            bytes: pdfBytes,
            createdAt: freshIso,
          },
        ],
        jobs: [
          {
            id: 'job-old',
            user_id: 'user-1',
            storage_path: 'user-1/job-expired.pdf',
            status: 'pending',
            expires_at: expiredIso,
          },
          {
            id: 'job-active',
            user_id: 'user-2',
            storage_path: 'user-2/fresh.pdf',
            status: 'processing',
            expires_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
          },
        ],
      });

    // Guarantee finally-block deletion when downstream parser throws.
    let downstreamErr: Error | null = null;
    try {
      throw new Error('downstream parse boom');
    } catch (err) {
      downstreamErr = err as Error;
    } finally {
      await purgeUploadedResume('user-1/in-flight.pdf', {
        adminClient: mockAdmin,
      });
    }
    expect(downstreamErr?.message).toBe('downstream parse boom');
    expect(removedPaths).toContain('user-1/in-flight.pdf');
    expect(objects.has('user-1/in-flight.pdf')).toBe(false);

    // Scheduled cleanup purges >1h expired parse_jobs and >1h orphan storage objects while keeping active ones.
    const cleanup = await cleanupExpiredResumeUploads({
      adminClient: mockAdmin,
      now,
    });
    expect(cleanup.deletedJobIds).toEqual(['job-old']);
    expect(cleanup.purgedPaths).toContain('user-1/job-expired.pdf');
    expect(cleanup.purgedPaths).toContain('user-1/orphan-expired.pdf');
    expect(jobs.map((j) => j.id)).toEqual(['job-active']);
    expect(objects.has('user-2/fresh.pdf')).toBe(true);

    // B-02 cap assertion: custom cap stops collection at limit
    const manyObjects: MockStorageObject[] = [];
    for (let i = 0; i < 20; i++) {
      manyObjects.push({
        path: `user-capped/file-${i}.pdf`,
        bytes: pdfBytes,
        createdAt: expiredIso,
      });
    }
    const { client: cappedAdmin, removedPaths: cappedRemoved } =
      createMockAdminSupabase({
        objects: manyObjects,
      });

    const cappedCleanup = await cleanupExpiredResumeUploads({
      adminClient: cappedAdmin,
      now,
      maxObjectsPerRun: 7,
    });
    expect(cappedCleanup.purgedPaths).toHaveLength(7);
    expect(cappedRemoved).toHaveLength(7);
    expect(MAX_CLEANUP_OBJECTS_PER_RUN).toBe(500);
  });
});
