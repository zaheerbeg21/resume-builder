import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getResumes, POST as createResume } from '@/app/api/resumes/route';
import {
  GET as getResumeById,
  PUT as updateResumeById,
  DELETE as deleteResumeById,
} from '@/app/api/resumes/[id]/route';
import * as supabaseServer from '@/lib/db/supabase-server';
import type { Resume } from '@/types/resume';

interface ResumeRow {
  id: string;
  user_id: string;
  title: string;
  template: string;
  content: Resume;
  schema_version: number;
  updated_at: string;
}

interface QueryFilter {
  col: keyof ResumeRow;
  val: unknown;
}

interface ValidationIssue {
  path: (string | number)[];
  message: string;
  code: string;
}

const validResumeContent: Resume = {
  basics: {
    fullName: 'Jane Doe',
    headline: 'Senior Systems Engineer',
    email: 'jane.doe@example.com',
    phone: '+1 555-0199',
    location: 'New York, NY',
    links: [
      { label: 'GitHub', url: 'https://github.com/janedoe' },
      { label: 'Portfolio', url: 'https://janedoe.dev' },
    ],
  },
  summary: 'Experienced software engineer with 8 years in distributed systems.',
  experience: [
    {
      id: 'exp-1',
      company: 'Tech Corp',
      title: 'Senior Engineer',
      location: 'Remote',
      start: '2021-01',
      end: null,
      current: true,
      bullets: ['Built scalable microservices.', 'Reduced latency by 35%.'],
    },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'CloudSync',
      url: 'https://github.com/janedoe/cloudsync',
      bullets: ['High-throughput synchronization engine.'],
    },
  ],
  education: [
    {
      id: 'edu-1',
      school: 'MIT',
      degree: 'B.S. in Computer Science',
      start: '2015',
      end: '2019',
    },
  ],
  skills: [
    {
      group: 'Languages',
      items: ['TypeScript', 'Go', 'Rust'],
    },
  ],
};

describe('Resume CRUD API Routes (T-008)', () => {
  let db: ResumeRow[];
  let currentUser: { id: string; email: string } | null;
  let simulateTriggerQuotaError: boolean;

  function createMockSupabaseClient() {
    return {
      auth: {
        getUser: vi.fn(async () => {
          if (!currentUser) {
            return { data: { user: null }, error: new Error('No active session') };
          }
          return { data: { user: currentUser }, error: null };
        }),
      },
      from: vi.fn((table: string) => {
        if (table !== 'resumes') {
          throw new Error(`Unexpected table: ${table}`);
        }

        const filters: QueryFilter[] = [];
        let orderConfig: { col: keyof ResumeRow; ascending: boolean } | null = null;
        let isCountQuery = false;

        const queryBuilder = {
          select: vi.fn((_columns?: string, options?: { count?: string; head?: boolean }) => {
            if (options?.count === 'exact') {
              isCountQuery = true;
            }
            return queryBuilder;
          }),
          eq: vi.fn((col: keyof ResumeRow, val: unknown) => {
            filters.push({ col, val });
            return queryBuilder;
          }),
          order: vi.fn((col: keyof ResumeRow, options?: { ascending: boolean }) => {
            orderConfig = { col, ascending: options?.ascending ?? true };
            return queryBuilder;
          }),
          insert: vi.fn((row: Partial<ResumeRow>) => {
            if (simulateTriggerQuotaError) {
              const error = {
                code: 'P0001',
                message: 'Quota exceeded: Users may not create more than 5 resumes.',
              };
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error })),
                })),
              };
            }

            const newRow: ResumeRow = {
              id: (row.id as string) ?? `res-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              user_id: row.user_id!,
              title: row.title ?? 'Untitled Resume',
              template: row.template ?? 'standard',
              content: row.content as Resume,
              schema_version: row.schema_version ?? 1,
              updated_at: new Date().toISOString(),
            };
            db.push(newRow);

            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: newRow, error: null })),
              })),
            };
          }),
          update: vi.fn((updates: Partial<ResumeRow>) => {
            return {
              eq: vi.fn((col1: keyof ResumeRow, val1: unknown) => {
                filters.push({ col: col1, val: val1 });
                return {
                  eq: vi.fn((col2: keyof ResumeRow, val2: unknown) => {
                    filters.push({ col: col2, val: val2 });
                    return {
                      select: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => {
                          const target = db.find((r) =>
                            filters.every((f) => r[f.col] === f.val)
                          );
                          if (!target) {
                            return { data: null, error: null };
                          }
                          Object.assign(target, updates);
                          return { data: target, error: null };
                        }),
                      })),
                    };
                  }),
                };
              }),
            };
          }),
          delete: vi.fn(() => {
            return {
              eq: vi.fn((col1: keyof ResumeRow, val1: unknown) => {
                filters.push({ col: col1, val: val1 });
                return {
                  eq: vi.fn((col2: keyof ResumeRow, val2: unknown) => {
                    filters.push({ col: col2, val: val2 });
                    const index = db.findIndex((r) =>
                      filters.every((f) => r[f.col] === f.val)
                    );
                    if (index !== -1) {
                      db.splice(index, 1);
                    }
                    return Promise.resolve({ error: null });
                  }),
                };
              }),
            };
          }),
          single: vi.fn(async () => {
            const matches = db.filter((r) =>
              filters.every((f) => r[f.col] === f.val)
            );
            if (matches.length === 0) {
              return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
            }
            return { data: matches[0], error: null };
          }),
          maybeSingle: vi.fn(async () => {
            const matches = db.filter((r) =>
              filters.every((f) => r[f.col] === f.val)
            );
            if (matches.length === 0) {
              return { data: null, error: null };
            }
            return { data: matches[0], error: null };
          }),
          then: <TResult1 = unknown, TResult2 = never>(
            onfulfilled?: ((value: { data: ResumeRow[] | null; error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
          ) => {
            let matches = db.filter((r) =>
              filters.every((f) => r[f.col] === f.val)
            );

            if (isCountQuery) {
              const res = { data: null, count: matches.length, error: null };
              return Promise.resolve(onfulfilled ? onfulfilled(res) : (res as unknown as TResult1)).catch(onrejected);
            }

            if (orderConfig) {
              const { col, ascending } = orderConfig;
              matches = [...matches].sort((a, b) => {
                if (a[col] < b[col]) return ascending ? -1 : 1;
                if (a[col] > b[col]) return ascending ? 1 : -1;
                return 0;
              });
            }

            const res = { data: matches, error: null };
            return Promise.resolve(onfulfilled ? onfulfilled(res) : (res as unknown as TResult1)).catch(onrejected);
          },
        };

        return queryBuilder;
      }),
    } as unknown as ReturnType<typeof supabaseServer.createClient>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db = [];
    currentUser = { id: 'user-uuid-1', email: 'user1@example.com' };
    simulateTriggerQuotaError = false;

    vi.spyOn(supabaseServer, 'createClient').mockImplementation(async () =>
      createMockSupabaseClient()
    );
  });

  describe('Authentication Enforcement (401)', () => {
    beforeEach(() => {
      currentUser = null;
    });

    it('returns 401 when GET /api/resumes is called without authentication', async () => {
      const response = await getResumes();
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 401 when POST /api/resumes is called without authentication', async () => {
      const request = new Request('http://localhost:3000/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validResumeContent),
      });
      const response = await createResume(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 401 when GET /api/resumes/[id] is called without authentication', async () => {
      const request = new Request('http://localhost:3000/api/resumes/res-1');
      const response = await getResumeById(request, {
        params: Promise.resolve({ id: 'res-1' }),
      });
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 401 when PUT /api/resumes/[id] is called without authentication', async () => {
      const request = new Request('http://localhost:3000/api/resumes/res-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validResumeContent),
      });
      const response = await updateResumeById(request, {
        params: Promise.resolve({ id: 'res-1' }),
      });
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 401 when DELETE /api/resumes/[id] is called without authentication', async () => {
      const request = new Request('http://localhost:3000/api/resumes/res-1', {
        method: 'DELETE',
      });
      const response = await deleteResumeById(request, {
        params: Promise.resolve({ id: 'res-1' }),
      });
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Payload Validation (400 Bad Request)', () => {
    it('returns 400 when POST /api/resumes receives malformed JSON', async () => {
      const request = new Request('http://localhost:3000/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json{{{',
      });
      const response = await createResume(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid JSON payload');
    });

    it('returns 400 with Zod issue details when basics is missing', async () => {
      const request = new Request('http://localhost:3000/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await createResume(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Validation failed');
      expect(Array.isArray(data.details)).toBe(true);
      expect(data.details.some((i: ValidationIssue) => i.path.includes('basics'))).toBe(true);
    });

    it('returns 400 when email is invalid in ResumeSchema', async () => {
      const invalidContent = {
        ...validResumeContent,
        basics: {
          ...validResumeContent.basics,
          email: 'not-an-email',
        },
      };
      const request = new Request('http://localhost:3000/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidContent),
      });
      const response = await createResume(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Validation failed');
      expect(data.details.some((i: ValidationIssue) => i.path.includes('email'))).toBe(true);
    });

    it('returns 400 when PUT /api/resumes/[id] receives invalid schema', async () => {
      const request = new Request('http://localhost:3000/api/resumes/res-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ basics: { fullName: '' } }),
      });
      const response = await updateResumeById(request, {
        params: Promise.resolve({ id: 'res-1' }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Validation failed');
      expect(Array.isArray(data.details)).toBe(true);
    });
  });

  describe('5-Resume Quota Enforcement (403 Forbidden)', () => {
    it('allows creating up to 5 resumes, then forbids the 6th with 403', async () => {
      // Create 5 resumes
      for (let i = 1; i <= 5; i++) {
        const req = new Request('http://localhost:3000/api/resumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Resume ${i}`,
            template: 'standard',
            ...validResumeContent,
          }),
        });
        const res = await createResume(req);
        expect(res.status).toBe(201);
      }

      expect(db.length).toBe(5);

      // Attempt 6th resume
      const sixthReq = new Request('http://localhost:3000/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Resume 6',
          ...validResumeContent,
        }),
      });
      const sixthRes = await createResume(sixthReq);
      expect(sixthRes.status).toBe(403);
      const data = await sixthRes.json();
      expect(data.error).toBe('Resume limit reached. Maximum 5 resumes allowed.');
      expect(db.length).toBe(5);
    });

    it('maps database trigger quota exception (P0001) to HTTP 403', async () => {
      simulateTriggerQuotaError = true;

      const req = new Request('http://localhost:3000/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validResumeContent),
      });
      const res = await createResume(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Resume limit reached. Maximum 5 resumes allowed.');
    });
  });

  describe('CRUD Lifecycle & Multi-Tenant Scoping', () => {
    it('executes full CRUD lifecycle successfully for authenticated user', async () => {
      // 1. Initial list should be empty
      const listRes1 = await getResumes();
      expect(listRes1.status).toBe(200);
      const initialList = await listRes1.json();
      expect(initialList).toEqual([]);

      // 2. Create resume via POST
      const createReq = new Request('http://localhost:3000/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Full Stack Engineer',
          template: 'classic',
          ...validResumeContent,
        }),
      });
      const createRes = await createResume(createReq);
      expect(createRes.status).toBe(201);
      const created = await createRes.json();

      expect(created.id).toBeDefined();
      expect(created.user_id).toBe('user-uuid-1');
      expect(created.title).toBe('Full Stack Engineer');
      expect(created.template).toBe('classic');
      expect(created.content.basics.fullName).toBe('Jane Doe');

      const resumeId = created.id;

      // 3. List resumes - should contain 1 item
      const listRes2 = await getResumes();
      expect(listRes2.status).toBe(200);
      const listAfterCreate = await listRes2.json();
      expect(listAfterCreate).toHaveLength(1);
      expect(listAfterCreate[0].id).toBe(resumeId);

      // 4. Get by ID
      const getReq = new Request(`http://localhost:3000/api/resumes/${resumeId}`);
      const getRes = await getResumeById(getReq, {
        params: Promise.resolve({ id: resumeId }),
      });
      expect(getRes.status).toBe(200);
      const fetched = await getRes.json();
      expect(fetched.id).toBe(resumeId);
      expect(fetched.title).toBe('Full Stack Engineer');

      // 5. Update resume via PUT
      const updatedContent = {
        ...validResumeContent,
        summary: 'Updated summary with advanced technical leadership experience.',
      };
      const updateReq = new Request(`http://localhost:3000/api/resumes/${resumeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Lead Systems Architect',
          template: 'standard',
          ...updatedContent,
        }),
      });
      const updateRes = await updateResumeById(updateReq, {
        params: Promise.resolve({ id: resumeId }),
      });
      expect(updateRes.status).toBe(200);
      const updated = await updateRes.json();
      expect(updated.title).toBe('Lead Systems Architect');
      expect(updated.template).toBe('standard');
      expect(updated.content.summary).toBe(
        'Updated summary with advanced technical leadership experience.'
      );

      // 6. Delete resume via DELETE
      const deleteReq = new Request(`http://localhost:3000/api/resumes/${resumeId}`, {
        method: 'DELETE',
      });
      const deleteRes = await deleteResumeById(deleteReq, {
        params: Promise.resolve({ id: resumeId }),
      });
      expect(deleteRes.status).toBe(204);

      // 7. Verify resume is deleted (404)
      const getDeletedRes = await getResumeById(getReq, {
        params: Promise.resolve({ id: resumeId }),
      });
      expect(getDeletedRes.status).toBe(404);
      const notFoundData = await getDeletedRes.json();
      expect(notFoundData.error).toBe('Resume not found');
    });

    it('enforces multi-tenant isolation: cannot view, update, or delete other users resumes', async () => {
      // User 1 creates a resume
      db.push({
        id: 'user1-resume',
        user_id: 'user-uuid-1',
        title: 'User 1 Resume',
        template: 'standard',
        content: validResumeContent,
        schema_version: 1,
        updated_at: new Date().toISOString(),
      });

      // Switch to User 2
      currentUser = { id: 'user-uuid-2', email: 'user2@example.com' };

      // User 2 lists resumes -> empty
      const listRes = await getResumes();
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData).toEqual([]);

      // User 2 attempts to GET User 1's resume -> 404 (prevents tenancy leakage)
      const getReq = new Request('http://localhost:3000/api/resumes/user1-resume');
      const getRes = await getResumeById(getReq, {
        params: Promise.resolve({ id: 'user1-resume' }),
      });
      expect(getRes.status).toBe(404);
      const getData = await getRes.json();
      expect(getData.error).toBe('Resume not found');

      // User 2 attempts to PUT User 1's resume -> 404
      const putReq = new Request('http://localhost:3000/api/resumes/user1-resume', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validResumeContent),
      });
      const putRes = await updateResumeById(putReq, {
        params: Promise.resolve({ id: 'user1-resume' }),
      });
      expect(putRes.status).toBe(404);

      // Verify User 1's resume was not modified
      expect(db.find((r) => r.id === 'user1-resume')?.title).toBe('User 1 Resume');
    });

    it('accepts content wrapped in content key or at top-level', async () => {
      const wrappedReq = new Request('http://localhost:3000/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Wrapped Content Resume',
          template: 'standard',
          content: validResumeContent,
        }),
      });
      const res = await createResume(wrappedReq);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.title).toBe('Wrapped Content Resume');
      expect(data.content.basics.fullName).toBe('Jane Doe');
    });
  });
});
