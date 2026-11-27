import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/billing/entitlements';

export const RESUMES_RAW_BUCKET = 'resumes-raw';
export const MAX_RESUME_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB (Blueprint §10)
export const SIGNED_UPLOAD_EXPIRY_SECONDS = 120; // starting value, tuned on corpus
export const UPLOAD_RATE_LIMIT_MAX_REQUESTS = 5; // starting value, tuned on corpus
export const UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000; // starting value, tuned on corpus
export const UPLOAD_RATE_LIMIT_RPC_TIMEOUT_MS = 2_000; // starting value, tuned for Vercel-to-Supabase HTTPS round-trip
export const EXPIRED_UPLOAD_AGE_MS = 60 * 60 * 1000; // 1 hour
export const MAX_CLEANUP_OBJECTS_PER_RUN = 500; // B-02: bounded single-worker cleanup cap
export const STORAGE_PAGE_SIZE = 100; // Supabase Storage list page limit

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] as const; // %PDF
const SAFE_PDF_FILENAME_REGEX = /^[A-Za-z0-9._-]+\.pdf$/i;

export class ResumeUploadError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ResumeUploadError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface SignedResumeUploadResult {
  signedUrl: string;
  token: string;
  storagePath: string;
  expiresIn: number;
}

export interface VerifiedUploadedResume {
  storagePath: string;
  sizeBytes: number;
  bytes: Uint8Array;
}

export interface CleanupExpiredResult {
  deletedJobIds: string[];
  purgedPaths: string[];
}

export interface UploadRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  currentCount?: number;
  resetEpochSeconds?: number;
  isAmbiguousFailure?: boolean;
}

export function isOwnedPdfStoragePath(
  storagePath: string,
  userId: string,
): boolean {
  if (
    !userId ||
    userId.includes('/') ||
    userId.includes('\\') ||
    userId.includes('..')
  ) {
    return false;
  }
  if (storagePath.includes('\\') || storagePath.includes('..')) {
    return false;
  }
  const segments = storagePath.split('/');
  if (segments.length !== 2) {
    return false;
  }
  const [ownerSegment, fileName] = segments;
  return ownerSegment === userId && SAFE_PDF_FILENAME_REGEX.test(fileName);
}

export function hasPdfMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC_BYTES.length) {
    return false;
  }
  for (let i = 0; i < PDF_MAGIC_BYTES.length; i++) {
    if (bytes[i] !== PDF_MAGIC_BYTES[i]) {
      return false;
    }
  }
  return true;
}

/**
 * PostgreSQL-backed anchor-resetting fixed-window rate limiter via RPC.
 * Fail-closed: returns isAmbiguousFailure = true on network/timeout/DB errors.
 * No in-memory rate-limit fallback.
 */
export async function checkAndConsumeUploadRateLimit(
  userId: string,
  options?: {
    adminClient?: SupabaseClient;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<UploadRateLimitResult> {
  if (!userId || userId.includes('/') || userId.includes('\\')) {
    return { allowed: false, isAmbiguousFailure: false, retryAfterSeconds: 60 };
  }

  const admin = options?.adminClient ?? getServiceRoleClient();
  const timeoutMs = options?.timeoutMs ?? UPLOAD_RATE_LIMIT_RPC_TIMEOUT_MS;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  const onCallerAbort = () => abortController.abort();

  if (options?.signal) {
    if (options.signal.aborted) {
      abortController.abort();
    } else {
      options.signal.addEventListener('abort', onCallerAbort, {
        once: true,
      });
    }
  }

  try {
    const rpcCall = admin.rpc('consume_upload_rate_limit', {
      p_user_id: userId,
    });
    const rpcBuilder =
      typeof (rpcCall as { abortSignal?: unknown })?.abortSignal === 'function'
        ? (
            rpcCall as {
              abortSignal: (signal: AbortSignal) => typeof rpcCall;
            }
          ).abortSignal(abortController.signal)
        : rpcCall;
    const rpcPromise = Promise.resolve(rpcBuilder);
    void rpcPromise.catch(() => {});

    const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) => {
      if (abortController.signal.aborted) {
        reject(new Error('Rate limit RPC aborted or timed out'));
        return;
      }
      abortController.signal.addEventListener(
        'abort',
        () => {
          reject(new Error('Rate limit RPC aborted or timed out'));
        },
        { once: true },
      );
    });

    const { data, error } = (await Promise.race([
      rpcPromise,
      timeoutPromise,
    ])) as {
      data: unknown;
      error: unknown;
    };

    if (error || !data) {
      // Fail-closed on database error or missing data
      return { allowed: false, isAmbiguousFailure: true, retryAfterSeconds: 5 };
    }

    const row = (Array.isArray(data) ? data[0] : data) as {
      allowed?: boolean;
      current_count?: number;
      reset_epoch_seconds?: number | string;
    } | null;

    if (!row || typeof row.allowed !== 'boolean') {
      // Fail-closed on malformed payload
      return { allowed: false, isAmbiguousFailure: true, retryAfterSeconds: 5 };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const resetEpoch = Number(row.reset_epoch_seconds);
    const retryAfterSeconds =
      Number.isFinite(resetEpoch) && resetEpoch > nowSeconds
        ? Math.max(1, resetEpoch - nowSeconds)
        : 60;

    return {
      allowed: row.allowed,
      currentCount:
        typeof row.current_count === 'number' ? row.current_count : undefined,
      resetEpochSeconds: Number.isFinite(resetEpoch) ? resetEpoch : undefined,
      retryAfterSeconds: row.allowed ? undefined : retryAfterSeconds,
      isAmbiguousFailure: false,
    };
  } catch {
    // Fail-closed on timeout or uncaught network exception
    return { allowed: false, isAmbiguousFailure: true, retryAfterSeconds: 5 };
  } finally {
    clearTimeout(timeoutId);
    options?.signal?.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * No-op test hook retained for backward test compatibility.
 * In-memory fallback removed: rate-limiting is purely PostgreSQL-backed.
 */
export function resetUploadRateLimitForTesting(): void {
  // Purely database-backed via RPC; in-memory state removed.
}

export async function createSignedResumeUploadUrl(
  userId: string,
  options?: { adminClient?: SupabaseClient; uploadId?: string },
): Promise<SignedResumeUploadResult> {
  if (!userId || userId.includes('/') || userId.includes('\\')) {
    throw new ResumeUploadError(400, 'invalid_user', 'Invalid user identifier.');
  }

  const uploadId = options?.uploadId ?? crypto.randomUUID();
  const storagePath = `${userId}/${uploadId}.pdf`;
  const admin = options?.adminClient ?? getServiceRoleClient();

  const { data, error } = await admin.storage
    .from(RESUMES_RAW_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error || !data) {
    throw new ResumeUploadError(
      500,
      'signed_url_failed',
      'Failed to issue signed upload URL.',
    );
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath: data.path || storagePath,
    expiresIn: SIGNED_UPLOAD_EXPIRY_SECONDS,
  };
}

export async function verifyUploadedResume(
  storagePath: string,
  userId: string,
  options?: { adminClient?: SupabaseClient },
): Promise<VerifiedUploadedResume> {
  if (!isOwnedPdfStoragePath(storagePath, userId)) {
    throw new ResumeUploadError(
      403,
      'forbidden_path',
      'Access to this upload path is forbidden.',
    );
  }

  const admin = options?.adminClient ?? getServiceRoleClient();
  const { data, error } = await admin.storage
    .from(RESUMES_RAW_BUCKET)
    .download(storagePath);

  if (error || !data) {
    const errObj = error as { statusCode?: string | number; message?: string } | null;
    const isNotFound =
      String(errObj?.statusCode ?? '') === '404' ||
      /not found/i.test(errObj?.message ?? '');
    throw new ResumeUploadError(
      isNotFound ? 404 : 500,
      isNotFound ? 'object_not_found' : 'storage_read_failed',
      isNotFound
        ? 'Uploaded resume object not found.'
        : 'Failed to read uploaded resume object.',
    );
  }

  if (data.size > MAX_RESUME_UPLOAD_BYTES) {
    throw new ResumeUploadError(
      422,
      'file_too_large',
      'Uploaded resume exceeds maximum allowed size of 5 MB.',
    );
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength > MAX_RESUME_UPLOAD_BYTES) {
    throw new ResumeUploadError(
      422,
      'file_too_large',
      'Uploaded resume exceeds maximum allowed size of 5 MB.',
    );
  }

  if (!hasPdfMagicBytes(bytes)) {
    throw new ResumeUploadError(
      422,
      'invalid_pdf_magic_bytes',
      'Uploaded file is not a valid PDF document.',
    );
  }

  return {
    storagePath,
    sizeBytes: bytes.byteLength,
    bytes,
  };
}

export async function purgeUploadedResume(
  storagePath: string,
  options?: { adminClient?: SupabaseClient },
): Promise<void> {
  if (!storagePath.trim()) {
    return;
  }
  const admin = options?.adminClient ?? getServiceRoleClient();
  const { error } = await admin.storage
    .from(RESUMES_RAW_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new ResumeUploadError(
      500,
      'storage_purge_failed',
      'Failed to remove raw uploaded resume.',
    );
  }
}

/**
 * B-02 Bounded Cleanup Worker:
 * - Single-worker collect-then-delete up to MAX_CLEANUP_OBJECTS_PER_RUN (500).
 * - Paginated storage listings (STORAGE_PAGE_SIZE = 100).
 * - Limitations: best-effort, no snapshot consistency or guaranteed eventual completion
 *   under concurrent storage changes. Distributed lease state machine deferred to T-028.
 */
export async function cleanupExpiredResumeUploads(options?: {
  adminClient?: SupabaseClient;
  now?: Date;
  maxObjectsPerRun?: number;
}): Promise<CleanupExpiredResult> {
  const maxObjects = options?.maxObjectsPerRun ?? MAX_CLEANUP_OBJECTS_PER_RUN;
  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();
  const cutoffMs = now.getTime() - EXPIRED_UPLOAD_AGE_MS;
  const admin = options?.adminClient ?? getServiceRoleClient();

  // 1. Purge expired parse_jobs
  const { data: deletedJobs, error: jobsError } = await admin
    .from('parse_jobs')
    .delete()
    .lt('expires_at', nowIso)
    .select();

  if (jobsError) {
    throw new ResumeUploadError(
      500,
      'cleanup_jobs_failed',
      'Failed to purge expired parse jobs.',
    );
  }

  const deletedJobRows = (deletedJobs ?? []) as Array<{
    id: string;
    storage_path?: string;
  }>;
  const deletedJobIds = deletedJobRows.map((row) => row.id);
  const pathsToPurge = new Set<string>();

  for (const row of deletedJobRows) {
    if (row.storage_path) {
      pathsToPurge.add(row.storage_path);
      if (pathsToPurge.size >= maxObjects) {
        break;
      }
    }
  }

  // 2. Paginated folder scanning with collect-then-delete
  let folderOffset = 0;
  let hasMoreFolders = pathsToPurge.size < maxObjects;

  while (hasMoreFolders) {
    const { data: folders, error: listError } = await admin.storage
      .from(RESUMES_RAW_BUCKET)
      .list('', { limit: STORAGE_PAGE_SIZE, offset: folderOffset });

    if (listError) {
      throw new ResumeUploadError(
        500,
        'cleanup_list_failed',
        'Failed to list raw resume folders for cleanup.',
      );
    }

    const folderBatch = folders ?? [];
    if (folderBatch.length === 0) {
      break;
    }

    for (const folder of folderBatch) {
      if (!folder.name) continue;
      if (pathsToPurge.size >= maxObjects) {
        hasMoreFolders = false;
        break;
      }

      // Paginate files inside this folder
      let fileOffset = 0;
      let hasMoreFiles = true;

      while (hasMoreFiles && pathsToPurge.size < maxObjects) {
        const { data: files, error: filesError } = await admin.storage
          .from(RESUMES_RAW_BUCKET)
          .list(folder.name, { limit: STORAGE_PAGE_SIZE, offset: fileOffset });

        if (filesError) {
          throw new ResumeUploadError(
            500,
            'cleanup_list_failed',
            'Failed to list raw resume objects for cleanup.',
          );
        }

        const fileBatch = files ?? [];
        if (fileBatch.length === 0) {
          break;
        }

        for (const file of fileBatch) {
          if (!file.name || !file.created_at) continue;
          const createdAtMs = Date.parse(file.created_at);
          if (Number.isFinite(createdAtMs) && createdAtMs < cutoffMs) {
            pathsToPurge.add(`${folder.name}/${file.name}`);
            if (pathsToPurge.size >= maxObjects) {
              hasMoreFiles = false;
              break;
            }
          }
        }

        if (fileBatch.length < STORAGE_PAGE_SIZE) {
          hasMoreFiles = false;
        } else {
          fileOffset += STORAGE_PAGE_SIZE;
        }
      }
    }

    if (folderBatch.length < STORAGE_PAGE_SIZE || pathsToPurge.size >= maxObjects) {
      hasMoreFolders = false;
    } else {
      folderOffset += STORAGE_PAGE_SIZE;
    }
  }

  // 3. Delete collected paths in a single bounded batch
  const purgedPaths = Array.from(pathsToPurge);
  if (purgedPaths.length > 0) {
    const { error: removeError } = await admin.storage
      .from(RESUMES_RAW_BUCKET)
      .remove(purgedPaths);

    if (removeError) {
      throw new ResumeUploadError(
        500,
        'storage_purge_failed',
        'Failed to remove expired raw uploads.',
      );
    }
  }

  return { deletedJobIds, purgedPaths };
}
