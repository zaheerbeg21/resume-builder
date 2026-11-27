import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Document, renderToBuffer } from '@react-pdf/renderer';
import {
  POST as parseResumeRoute,
  processParseJob,
  resolveDefaultProvider,
  setProviderForTesting,
} from '@/app/api/ai/parse-resume/route';
import { GET as getParseJobStatusRoute } from '@/app/api/ai/parse-resume/status/[id]/route';
import * as entitlements from '@/lib/billing/entitlements';
import * as supabaseServer from '@/lib/db/supabase-server';
import { RESUMES_RAW_BUCKET } from '@/lib/storage/resume-upload';
import { ResumeDocument } from '@/lib/pdf/templates/standard';
import { registerFonts } from '@/lib/pdf/fonts';
import { FakeProvider } from '@/lib/ai/providers/fake';
import type { LlmProvider } from '@/lib/ai/provider';
import type { Resume } from '@/types/resume';
import { ResumeImportDraftSchema } from '@/lib/ai/schemas';

interface MockJobRow {
  id: string;
  user_id: string;
  storage_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  created_at: string;
  updated_at: string;
}

interface MockUsageEventRow {
  user_id: string | null;
  route: string;
  provider: string;
  model: string;
  failed_over_from: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  est_cost_usd: number | null;
  created_at?: string;
}

interface MockEntitlementRow {
  id: string;
  user_id: string;
  status: string;
  expires_at: string;
}

function createMockSupabase(initial?: {
  objects?: Map<string, Uint8Array>;
  jobs?: Map<string, MockJobRow>;
  usageEvents?: MockUsageEventRow[];
  entitlements?: MockEntitlementRow[];
}) {
  const objects = initial?.objects ?? new Map<string, Uint8Array>();
  const jobs = initial?.jobs ?? new Map<string, MockJobRow>();
  const usageEvents: MockUsageEventRow[] = [...(initial?.usageEvents ?? [])];
  const activeEntitlements: MockEntitlementRow[] = [...(initial?.entitlements ?? [])];
  const purgedPaths: string[] = [];
  let downloadCount = 0;

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null,
      }),
    },

    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe(RESUMES_RAW_BUCKET);
        return {
          download: vi.fn(async (storagePath: string) => {
            downloadCount += 1;
            const bytes = objects.get(storagePath);
            if (!bytes) {
              return { data: null, error: { message: 'Object not found', statusCode: '404' } };
            }
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            const blob = new Blob([copy], { type: 'application/pdf' });
            return { data: blob, error: null };
          }),
          remove: vi.fn(async (paths: string[]) => {
            for (const p of paths) {
              purgedPaths.push(p);
              objects.delete(p);
            }
            return { data: [], error: null };
          }),
        };
      },
    },

    from: (table: string) => {
      if (table === 'parse_jobs') {
        return {
          insert: vi.fn(async (row: Partial<MockJobRow>) => {
            const fullRow: MockJobRow = {
              id: row.id ?? 'job-default',
              user_id: row.user_id ?? 'user-123',
              storage_path: row.storage_path ?? '',
              status: row.status ?? 'pending',
              result: row.result,
              error: row.error,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            jobs.set(fullRow.id, fullRow);
            return { data: [fullRow], error: null };
          }),

          update: (fields: Partial<MockJobRow>) => ({
            eq: (col: string, val: string) => {
              expect(col).toBe('id');
              const existing = jobs.get(val);
              if (existing) {
                const updated: MockJobRow = {
                  ...existing,
                  ...fields,
                  updated_at: new Date().toISOString(),
                };
                jobs.set(val, updated);
              }
              return Promise.resolve({ data: existing ? [jobs.get(val)] : [], error: null });
            },
          }),

          select: (cols: string, selectOpts?: { count?: string; head?: boolean }) => {
            expect(cols.length).toBeGreaterThan(0);
            if (selectOpts?.count === 'exact' && selectOpts?.head) {
              return {
                eq: (userCol: string, userIdVal: string) => {
                  expect(userCol).toBe('user_id');
                  return {
                    gte: async (dateCol: string, sinceIso: string) => {
                      expect(dateCol).toBe('created_at');
                      const sinceMs = Date.parse(sinceIso);
                      let count = 0;
                      for (const j of jobs.values()) {
                        if (j.user_id === userIdVal && Date.parse(j.created_at) >= sinceMs) {
                          count++;
                        }
                      }
                      return { count, error: null };
                    },
                  };
                },
              };
            }
            return {
              eq: (col: string, val: string) => {
                expect(col).toBe('id');
                return {
                  eq: (userCol: string, userIdVal: string) => ({
                    single: async () => {
                      expect(userCol).toBe('user_id');
                      const job = jobs.get(val);
                      if (!job || job.user_id !== userIdVal) {
                        return { data: null, error: { message: 'Not found' } };
                      }
                      return { data: job, error: null };
                    },
                  }),
                };
              },
            };
          },
        };
      }

      if (table === 'usage_events') {
        return {
          insert: vi.fn(async (row: MockUsageEventRow) => {
            const stored: MockUsageEventRow = {
              ...row,
              created_at: row.created_at ?? new Date().toISOString(),
            };
            usageEvents.push(stored);
            return { data: [stored], error: null };
          }),
          select: (cols: string, selectOpts?: { count?: string; head?: boolean }) => {
            expect(cols.length).toBeGreaterThan(0);
            if (selectOpts?.count === 'exact' && selectOpts?.head) {
              return {
                eq: (userCol: string, userIdVal: string) => {
                  expect(userCol).toBe('user_id');
                  return {
                    gte: async (dateCol: string, sinceIso: string) => {
                      expect(dateCol).toBe('created_at');
                      const sinceMs = Date.parse(sinceIso);
                      const count = usageEvents.filter(
                        (e) =>
                          e.user_id === userIdVal &&
                          Date.parse(e.created_at ?? new Date().toISOString()) >= sinceMs,
                      ).length;
                      return { count, error: null };
                    },
                  };
                },
              };
            }
            throw new Error('Unexpected usage_events select');
          },
        };
      }

      if (table === 'entitlements') {
        return {
          select: (cols: string) => {
            expect(cols.length).toBeGreaterThan(0);
            return {
              eq: (uCol: string, uVal: string) => {
                expect(uCol).toBe('user_id');
                return {
                  eq: (sCol: string, sVal: string) => {
                    expect(sCol).toBe('status');
                    return {
                      gt: (eCol: string, nowIso: string) => {
                        expect(eCol).toBe('expires_at');
                        return {
                          limit: async (n: number) => {
                            const nowMs = Date.parse(nowIso);
                            const matching = activeEntitlements
                              .filter(
                                (e) =>
                                  e.user_id === uVal &&
                                  e.status === sVal &&
                                  Date.parse(e.expires_at) > nowMs,
                              )
                              .slice(0, n);
                            return { data: matching, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return {
    client,
    objects,
    jobs,
    usageEvents,
    purgedPaths,
    getDownloadCount: () => downloadCount,
  };
}

async function createTestPdfBuffer(textLength: 'long' | 'short'): Promise<Uint8Array> {
  registerFonts();
  if (textLength === 'short') {
    const shortResume: Resume = {
      basics: {
        fullName: 'Jane Doe',
        headline: '',
        email: 'j@d.co',
        location: '',
        links: [],
      },
      summary: 'Hello world.',
      experience: [],
      projects: [],
      education: [],
      skills: [],
    };
    const doc = React.createElement(ResumeDocument, {
      resume: shortResume,
    }) as unknown as React.ReactElement<React.ComponentProps<typeof Document>>;

    const buf = await renderToBuffer(doc);
    return new Uint8Array(buf);
  }

  const sampleSummary =
    'Staff Systems Architect with extensive experience designing and deploying distributed cloud applications, microservices, and multi-region Kubernetes clusters. Skilled in high throughput messaging pipelines, performance tuning, and database optimization.';

  const mockResume: Resume = {
    basics: {
      fullName: 'Alex Morgan',
      headline: 'Staff Systems Architect',
      email: 'alex.morgan@example.com',
      phone: '+1 555-0199',
      location: 'San Francisco, CA',
      links: [{ label: 'GitHub', url: 'https://github.com/alexmorgan' }],
    },
    summary: sampleSummary,
    experience: [
      {
        id: 'exp-1',
        company: 'Starlight Tech Inc',
        title: 'Staff Architect',
        start: '2021-01',
        end: null,
        current: true,
        bullets: [
          'Architected high throughput distributed streaming services processing over 10M events daily.',
          'Reduced p99 database query response latency significantly across production workloads.',
        ],
      },
    ],
    projects: [],
    education: [
      {
        id: 'edu-1',
        school: 'University of California, Berkeley',
        degree: 'Bachelor of Science in Computer Science',
        start: '2015-09',
        end: '2019-05',
      },
    ],
    skills: [
      {
        group: 'Languages',
        items: ['TypeScript', 'Go', 'Rust', 'Python', 'SQL'],
      },
    ],
  };

  const doc = React.createElement(ResumeDocument, {
    resume: mockResume,
  }) as unknown as React.ReactElement<React.ComponentProps<typeof Document>>;

  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}

describe('T-025: Format-Agnostic /api/ai/parse-resume & Async Job Polling', () => {
  let mockEnv: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockSupabase();
    vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(
      mockEnv.client as unknown as SupabaseClient,
    );
    entitlements.setServiceRoleClientForTesting(mockEnv.client as unknown as SupabaseClient);
  });

  afterEach(() => {
    entitlements.setServiceRoleClientForTesting(null);
    setProviderForTesting(null);
  });

  describe('1. Scope & Access Guardrails', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({ data: { user: null }, error: new Error('No session') }),
        },
      } as unknown as SupabaseClient);

      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'user-123/valid.pdf' }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('rejects DOCX format with explicit HTTP 400 (AC 1)', async () => {
      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'user-123/resume.docx' }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('DOCX format is not supported for MVP; please upload a PDF');
    });

    it('rejects cross-tenant storage path with HTTP 403', async () => {
      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'other-user/malicious.pdf' }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('forbidden');
    });

    it('rejects upload with invalid PDF magic bytes with HTTP 422', async () => {
      const corruptBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      mockEnv.objects.set('user-123/corrupt.pdf', corruptBytes);

      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'user-123/corrupt.pdf' }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe('invalid_pdf_magic_bytes');
    });

    it('returns 400 when storagePath is omitted from JSON body', async () => {
      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(400);
    });
  });

  describe('2. Asynchronous 202 Job Creation & Polling Pipeline (AC 2 & AC 3)', () => {
    it('creates a parse_jobs row and immediately returns HTTP 202 with jobId and pollUrl', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/resume.pdf', validPdfBytes);

      const start = Date.now();
      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'user-123/resume.pdf' }),
      });

      const res = await parseResumeRoute(req);
      const latencyMs = Date.now() - start;

      expect(res.status).toBe(202);
      expect(latencyMs).toBeLessThan(500); // Dispatches and responds within <500ms

      const json = await res.json();
      expect(json.jobId).toBeDefined();
      expect(json.status).toBe('pending');
      expect(json.pollUrl).toBe(`/api/ai/parse-resume/status/${json.jobId}`);

      // Verify row in parse_jobs
      const queuedJob = mockEnv.jobs.get(json.jobId);
      expect(queuedJob).toBeDefined();
      expect(queuedJob?.user_id).toBe('user-123');
      expect(queuedJob?.storage_path).toBe('user-123/resume.pdf');
    });

    it('status polling endpoint returns 401 when unauthenticated', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValueOnce({
        auth: {
          getUser: vi.fn().mockResolvedValueOnce({ data: { user: null }, error: new Error('No session') }),
        },
      } as unknown as SupabaseClient);

      const req = new Request('http://localhost:3000/api/ai/parse-resume/status/job-123');
      const res = await getParseJobStatusRoute(req, { params: Promise.resolve({ id: 'job-123' }) });
      expect(res.status).toBe(401);
    });

    it('status polling endpoint returns 404 for unknown job ID', async () => {
      const unknownUuid = '00000000-0000-4000-8000-000000000404';
      const req = new Request(`http://localhost:3000/api/ai/parse-resume/status/${unknownUuid}`);
      const res = await getParseJobStatusRoute(req, {
        params: Promise.resolve({ id: unknownUuid }),
      });
      expect(res.status).toBe(404);
    });

    it('status polling endpoint returns job status, result, and parsed error', async () => {
      const completedUuid = '00000000-0000-4000-8000-000000000200';
      const mockResult = { basics: { fullName: 'Alex Morgan' } };
      mockEnv.jobs.set(completedUuid, {
        id: completedUuid,
        user_id: 'user-123',
        storage_path: 'user-123/resume.pdf',
        status: 'completed',
        result: mockResult,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = new Request(`http://localhost:3000/api/ai/parse-resume/status/${completedUuid}`);
      const res = await getParseJobStatusRoute(req, {
        params: Promise.resolve({ id: completedUuid }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.jobId).toBe(completedUuid);
      expect(json.status).toBe('completed');
      expect(json.result).toEqual(mockResult);
    });
  });

  const validModelDraft = {
    basics: {
      fullName: 'Alex Morgan',
      headline: 'Staff Systems Architect',
      email: 'alex.morgan@example.com',
      phone: '+1 555-0199',
      location: 'San Francisco, CA',
      links: [],
    },
    summary:
      'Staff Systems Architect with extensive experience designing and deploying distributed cloud applications, microservices, and multi-region Kubernetes clusters. Skilled in high throughput messaging pipelines, performance tuning, and database optimization.',
    experience: [],
    projects: [],
    education: [],
    skills: [
      {
        group: 'Languages',
        items: ['TypeScript', 'Go', 'Rust', 'Python', 'SQL'],
      },
    ],
    unslotted: [],
  };

  describe('3. Scan Fallback (< 200 Characters) (AC 5)', () => {
    it('marks job failed with isScan: true and error message when extracted text is < 200 characters without calling LLM', async () => {
      const shortBytes = await createTestPdfBuffer('short');
      mockEnv.objects.set('user-123/short.pdf', shortBytes);

      // Create a mock provider to verify it is NOT called
      const mockGenerateStructured = vi.fn();
      const mockProvider: LlmProvider = {
        name: 'fake',
        generateStructured: mockGenerateStructured,
      };

      // We run processParseJob with a short text extractor
      mockEnv.jobs.set('job-short', {
        id: 'job-short',
        user_id: 'user-123',
        storage_path: 'user-123/short.pdf',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Execute background processing
      await processParseJob('job-short', 'user-123', 'user-123/short.pdf', {
        adminClient: mockEnv.client as unknown as SupabaseClient,
        provider: mockProvider,
      });

      expect(mockGenerateStructured).not.toHaveBeenCalled();

      const job = mockEnv.jobs.get('job-short');
      expect(job?.status).toBe('failed');
      expect(job?.error).toBeDefined();

      const errorPayload = JSON.parse(job!.error!);
      expect(errorPayload.isScan).toBe(true);
      expect(errorPayload.error).toContain('Extracted text is too short');

      // AC 4: Verify storage was purged in finally block
      expect(mockEnv.purgedPaths).toContain('user-123/short.pdf');
    });
  });

  describe('4. Guaranteed Raw Document Storage Purge (AC 4)', () => {
    it('guarantees purgeUploadedResume is called in finally block upon successful job execution', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/doc.pdf', validPdfBytes);

      mockEnv.jobs.set('job-purge-success', {
        id: 'job-purge-success',
        user_id: 'user-123',
        storage_path: 'user-123/doc.pdf',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const fakeProvider = new FakeProvider({ response: validModelDraft });

      await processParseJob('job-purge-success', 'user-123', 'user-123/doc.pdf', {
        adminClient: mockEnv.client as unknown as SupabaseClient,
        provider: fakeProvider,
      });

      expect(mockEnv.purgedPaths).toContain('user-123/doc.pdf');
      expect(mockEnv.objects.has('user-123/doc.pdf')).toBe(false);
    });

    it('guarantees purgeUploadedResume is called in finally block even when parser throws terminal error', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/error-doc.pdf', validPdfBytes);

      mockEnv.jobs.set('job-purge-fail', {
        id: 'job-purge-fail',
        user_id: 'user-123',
        storage_path: 'user-123/error-doc.pdf',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const failingProvider: LlmProvider = {
        name: 'fake',
        generateStructured: vi.fn().mockRejectedValue(new Error('Terminal model failure')),
      };

      await processParseJob('job-purge-fail', 'user-123', 'user-123/error-doc.pdf', {
        adminClient: mockEnv.client as unknown as SupabaseClient,
        provider: failingProvider,
      });

      expect(mockEnv.purgedPaths).toContain('user-123/error-doc.pdf');
      const job = mockEnv.jobs.get('job-purge-fail');
      expect(job?.status).toBe('failed');
      const errorObj = JSON.parse(job!.error!);
      expect(errorObj.parse_failed).toBe(true);
      expect(errorObj.manual_fallback).toBe(true);
    });
  });

  describe('5. Telemetry Logging to usage_events (AC 8)', () => {
    it('records telemetry into usage_events upon parse job completion', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/telemetry.pdf', validPdfBytes);

      mockEnv.jobs.set('job-telemetry', {
        id: 'job-telemetry',
        user_id: 'user-123',
        storage_path: 'user-123/telemetry.pdf',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const fakeProvider = new FakeProvider({ response: validModelDraft });

      await processParseJob('job-telemetry', 'user-123', 'user-123/telemetry.pdf', {
        adminClient: mockEnv.client as unknown as SupabaseClient,
        provider: fakeProvider,
      });

      expect(mockEnv.usageEvents.length).toBe(1);
      const event = mockEnv.usageEvents[0];
      expect(event.user_id).toBe('user-123');
      expect(event.route).toBe('/api/ai/parse-resume');
      expect(event.provider).toBe('fake');
      expect(typeof event.latency_ms).toBe('number');
    });
  });

  describe('6. Full End-to-End Async Pipeline Execution with Sync Hook', () => {
    it('executes full pipeline via POST with sync=true hook and confirms completed job', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/e2e.pdf', validPdfBytes);

      const fakeProvider = new FakeProvider({ response: validModelDraft });
      setProviderForTesting(fakeProvider);

      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'user-123/e2e.pdf', sync: true }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(202);
      const json = await res.json();

      const job = mockEnv.jobs.get(json.jobId);
      expect(job?.status).toBe('completed');
      expect(job?.result).toBeDefined();

      // Validate against ResumeImportDraftSchema
      const draftValidation = ResumeImportDraftSchema.safeParse(job?.result);
      expect(draftValidation.success).toBe(true);

      // Verify polling returns completed payload
      const pollReq = new Request(`http://localhost:3000${json.pollUrl}`);
      const pollRes = await getParseJobStatusRoute(pollReq, {
        params: Promise.resolve({ id: json.jobId }),
      });
      expect(pollRes.status).toBe(200);
      const pollJson = await pollRes.json();
      expect(pollJson.status).toBe('completed');
      expect(pollJson.result.basics.fullName).toBeDefined();
    });
  });

  describe('7. Robustness & Failure Corrections (F-02, F-04, F-05)', () => {
    it('F-02: purges storage in finally block even if initial status update to processing fails', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/fail-proc.pdf', validPdfBytes);

      const failingUpdateClient = {
        ...mockEnv.client,
        from: (table: string) => {
          if (table === 'parse_jobs') {
            return {
              update: () => ({
                eq: () => Promise.resolve({ data: null, error: { message: 'DB connection failure' } }),
              }),
            };
          }
          return mockEnv.client.from(table);
        },
      };

      await processParseJob('job-fail-proc', 'user-123', 'user-123/fail-proc.pdf', {
        adminClient: failingUpdateClient as unknown as SupabaseClient,
      });

      // Storage MUST be purged via finally block despite initial update failure
      expect(mockEnv.purgedPaths).toContain('user-123/fail-proc.pdf');
    });

    it('F-02: marks job failed when database update to completed returns an error', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/fail-comp.pdf', validPdfBytes);

      mockEnv.jobs.set('job-fail-comp', {
        id: 'job-fail-comp',
        user_id: 'user-123',
        storage_path: 'user-123/fail-comp.pdf',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const failingCompleteClient = {
        ...mockEnv.client,
        from: (table: string) => {
          if (table === 'parse_jobs') {
            return {
              update: (fields: Partial<MockJobRow>) => ({
                eq: (col: string, val: string) => {
                  // First call: 'processing' succeeds
                  if (fields.status === 'processing') {
                    const existing = mockEnv.jobs.get(val);
                    if (existing) mockEnv.jobs.set(val, { ...existing, status: 'processing' });
                    return Promise.resolve({ data: [], error: null });
                  }
                  // Second call: 'completed' fails with database constraint/timeout error
                  if (fields.status === 'completed') {
                    return Promise.resolve({ data: null, error: { message: 'Database write timeout' } });
                  }
                  // Third call: catch block sets 'failed'
                  if (fields.status === 'failed') {
                    const existing = mockEnv.jobs.get(val);
                    if (existing) mockEnv.jobs.set(val, { ...existing, status: 'failed', error: fields.error });
                    return Promise.resolve({ data: [], error: null });
                  }
                  return Promise.resolve({ data: [], error: null });
                },
              }),
            };
          }
          return mockEnv.client.from(table);
        },
      };

      const fakeProvider = new FakeProvider({ response: validModelDraft });

      await processParseJob('job-fail-comp', 'user-123', 'user-123/fail-comp.pdf', {
        adminClient: failingCompleteClient as unknown as SupabaseClient,
        provider: fakeProvider,
      });

      // Assert job transitioned to 'failed' because 'completed' write threw
      const job = mockEnv.jobs.get('job-fail-comp');
      expect(job?.status).toBe('failed');
      expect(mockEnv.purgedPaths).toContain('user-123/fail-comp.pdf');
    });

    it('F-04: logs critical error without unhandled exception when storage purge fails in finally block', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/purge-err.pdf', validPdfBytes);

      mockEnv.jobs.set('job-purge-err', {
        id: 'job-purge-err',
        user_id: 'user-123',
        storage_path: 'user-123/purge-err.pdf',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const failingStorageClient = {
        ...mockEnv.client,
        storage: {
          from: () => ({
            download: mockEnv.client.storage.from(RESUMES_RAW_BUCKET).download,
            remove: vi.fn().mockResolvedValue({ data: null, error: { message: 'Storage 500 error' } }),
          }),
        },
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const fakeProvider = new FakeProvider({ response: validModelDraft });

      // Should complete without throwing an unhandled rejection
      await expect(
        processParseJob('job-purge-err', 'user-123', 'user-123/purge-err.pdf', {
          adminClient: failingStorageClient as unknown as SupabaseClient,
          provider: fakeProvider,
        }),
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: Failed to purge uploaded resume in finally block'),
        expect.anything(),
      );

      consoleErrorSpy.mockRestore();
    });

    it('F-05: ignores sync: true hook when NODE_ENV is production', async () => {
      try {
        vi.stubEnv('NODE_ENV', 'production');

        const validPdfBytes = await createTestPdfBuffer('long');
        mockEnv.objects.set('user-123/prod-e2e.pdf', validPdfBytes);

        const fakeProvider = new FakeProvider({ response: validModelDraft });
        setProviderForTesting(fakeProvider);

        const req = new Request('http://localhost:3000/api/ai/parse-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: 'user-123/prod-e2e.pdf', sync: true }),
        });

        const res = await parseResumeRoute(req);
        expect(res.status).toBe(202);
        const json = await res.json();

        // In production, sync: true is ignored, so POST returns immediately without waiting for completion
        const job = mockEnv.jobs.get(json.jobId);
        expect(job?.status).not.toBe('completed');
        expect(['pending', 'processing']).toContain(job?.status);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  describe('8. T-025 Hardening & Review Fixes', () => {
    it('throws when GEMINI_API_KEY is missing instead of falling back to FakeProvider', () => {
      try {
        setProviderForTesting(null);
        vi.stubEnv('GEMINI_API_KEY', '');
        expect(() => resolveDefaultProvider()).toThrow('AI provider is not configured');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('enforces per-user 60s rate limit (429) and free-tier 24h AI quota (429)', async () => {
      const nowIso = new Date().toISOString();

      // 1. Seed 5 parse_jobs within last 60s -> triggers rate limit 429
      for (let i = 0; i < 5; i++) {
        mockEnv.jobs.set(`00000000-0000-4000-8000-00000000000${i}`, {
          id: `00000000-0000-4000-8000-00000000000${i}`,
          user_id: 'user-123',
          storage_path: `user-123/doc-${i}.pdf`,
          status: 'completed',
          created_at: nowIso,
          updated_at: nowIso,
        });
      }

      const rateLimitedReq = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'user-123/new.pdf' }),
      });
      const rateLimitedRes = await parseResumeRoute(rateLimitedReq);
      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.headers.get('Retry-After')).toBe('60');
      expect(mockEnv.getDownloadCount()).toBe(0);

      // 2. Clear jobs and seed 5 usage_events in last 24h (no active pass) -> triggers quota 429
      mockEnv.jobs.clear();
      for (let i = 0; i < 5; i++) {
        mockEnv.usageEvents.push({
          user_id: 'user-123',
          route: '/api/ai/parse-resume',
          provider: 'gemini',
          model: 'gemini-test',
          failed_over_from: null,
          latency_ms: 100,
          input_tokens: null,
          output_tokens: null,
          est_cost_usd: null,
          created_at: nowIso,
        });
      }

      const quotaLimitedReq = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'user-123/new.pdf' }),
      });
      const quotaLimitedRes = await parseResumeRoute(quotaLimitedReq);
      expect(quotaLimitedRes.status).toBe(429);
      const quotaJson = await quotaLimitedRes.json();
      expect(quotaJson.error).toBe('AI quota limit reached.');
      expect(mockEnv.getDownloadCount()).toBe(0);
    });

    it('status polling returns 400 on non-UUID id and 404 for cross-tenant user_id', async () => {
      const badReq = new Request('http://localhost:3000/api/ai/parse-resume/status/not-a-uuid');
      const badRes = await getParseJobStatusRoute(badReq, {
        params: Promise.resolve({ id: 'not-a-uuid' }),
      });
      expect(badRes.status).toBe(400);

      const foreignUuid = '00000000-0000-4000-8000-000000000999';
      mockEnv.jobs.set(foreignUuid, {
        id: foreignUuid,
        user_id: 'other-user-999',
        storage_path: 'other-user-999/secret.pdf',
        status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const crossTenantReq = new Request(
        `http://localhost:3000/api/ai/parse-resume/status/${foreignUuid}`,
      );
      const crossTenantRes = await getParseJobStatusRoute(crossTenantReq, {
        params: Promise.resolve({ id: foreignUuid }),
      });
      expect(crossTenantRes.status).toBe(404);
    });

    it('downloads raw PDF from storage only once across POST -> processParseJob', async () => {
      const validPdfBytes = await createTestPdfBuffer('long');
      mockEnv.objects.set('user-123/single-download.pdf', validPdfBytes);

      const fakeProvider = new FakeProvider({ response: validModelDraft });
      setProviderForTesting(fakeProvider);

      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'user-123/single-download.pdf', sync: true }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(mockEnv.jobs.get(json.jobId)?.status).toBe('completed');
      expect(mockEnv.getDownloadCount()).toBe(1);
    });
  });
});
