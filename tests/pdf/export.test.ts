import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST as exportPdfRoute } from '@/app/api/pdf/export/route';
import { lintExtractedText, findHeadingIndex } from '@/lib/pdf/lint';
import { setServiceRoleClientForTesting } from '@/lib/billing/entitlements';
import * as supabaseServer from '@/lib/db/supabase-server';
import { useResumeStore } from '@/lib/stores/resume-store';
import type { Resume } from '@/types/resume';

const cleanResume: Resume = {
  basics: {
    fullName: 'Alex Morgan',
    headline: 'Senior Infrastructure Architect',
    email: 'alex.morgan@example.com',
    phone: '+1 555-0199',
    location: 'San Francisco, CA',
    links: [{ label: 'GitHub', url: 'https://github.com/alexmorgan' }],
  },
  summary: 'Experienced systems architect specializing in high-throughput data pipelines.',
  experience: [
    {
      id: 'exp-1',
      company: 'Apex Dynamics Corp',
      title: 'Principal Architect',
      location: 'San Francisco, CA',
      start: '2022-01',
      end: null,
      current: true,
      bullets: [
        'Architected distributed event pipeline processing 250M daily events with 99.99% uptime.',
        'Streamlined cloud operations reducing cloud infrastructure overhead.',
      ],
    },
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'FlowStream Engine',
      url: 'https://flowstream.io',
      bullets: ['Open-source high throughput workflow engine.'],
    },
  ],
  education: [
    {
      id: 'edu-1',
      school: 'University of California, Berkeley',
      degree: 'B.S. in Electrical Engineering and Computer Science',
      start: '2016-08',
      end: '2020-05',
    },
  ],
  skills: [
    {
      group: 'Languages',
      items: ['Go', 'TypeScript', 'Rust'],
    },
  ],
};

const placeholderResume: Resume = {
  ...cleanResume,
  experience: [
    {
      ...cleanResume.experience[0],
      bullets: [
        'Increased pipeline throughput by [X%] across all nodes.',
        'Scaled platform to [N users] concurrently with zero downtime.',
      ],
    },
  ],
};

describe('lib/pdf/lint.ts Unit Tests', () => {
  const cleanExtractedText = `
Alex Morgan
Senior Infrastructure Architect
alex.morgan@example.com • +1 555-0199 • San Francisco, CA
Summary
Experienced systems architect specializing in high-throughput data pipelines.
Experience
Principal Architect
Apex Dynamics Corp
Jan 2022 - Present
• Architected distributed event pipeline processing 250M daily events with 99.99% uptime.
• Streamlined cloud operations reducing cloud infrastructure overhead.
Projects
FlowStream Engine
• Open-source high throughput workflow engine.
Education
University of California, Berkeley
B.S. in Electrical Engineering and Computer Science
Aug 2016 - May 2020
Skills
Languages: Go, TypeScript, Rust
`.trim();

  it('passes clean resumes with proper contact placement, headings, and character integrity', () => {
    const result = lintExtractedText(cleanExtractedText, cleanResume);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  describe('Placeholder Blocker', () => {
    it('fails when regex detects unresolved [X%] placeholder', () => {
      const textWithPlaceholder = cleanExtractedText.replace(
        '99.99% uptime',
        '[X%] uptime'
      );
      const result = lintExtractedText(textWithPlaceholder, cleanResume);
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('[X%]')])
      );
    });

    it('fails when regex detects unresolved [N users] placeholder', () => {
      const textWithPlaceholder = `${cleanExtractedText}\nScaled to [N users]`;
      const result = lintExtractedText(textWithPlaceholder, cleanResume);
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('[N users]')])
      );
    });

    it('identifies and reports multiple distinct placeholders in extracted text', () => {
      const multiTokenText = `${cleanExtractedText}\nSaved [target_amount] and improved by [Y%]`;
      const result = lintExtractedText(multiTokenText, cleanResume);
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('[target_amount]'),
          expect.stringContaining('[Y%]'),
        ])
      );
    });
  });

  describe('Character Integrity', () => {
    it('fails when text contains U+FFFD replacement characters', () => {
      const corruptedText = cleanExtractedText.replace('Berkeley', 'Berke\uFFFDey');
      const result = lintExtractedText(corruptedText, cleanResume);
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('U+FFFD replacement characters'),
        ])
      );
    });
  });

  describe('Contact Header Placement', () => {
    it('fails when candidate full name is missing from the first 15 lines', () => {
      // Push 16 filler lines to top so name appears past line 15
      const filler = Array.from({ length: 16 }, (_, i) => `Filler Line ${i + 1}`).join('\n');
      const delayedNameText = `${filler}\n${cleanExtractedText}`;
      const result = lintExtractedText(delayedNameText, cleanResume);
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('was not found within the first 15 lines'),
        ])
      );
    });

    it('fails if candidate full name is completely omitted', () => {
      const textWithoutName = cleanExtractedText.replace('Alex Morgan', 'Anonymous Candidate');
      const result = lintExtractedText(textWithoutName, cleanResume);
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Candidate name "Alex Morgan" was not found'),
        ])
      );
    });
  });

  describe('Section Order & Missing Heading Check', () => {
    it('detects missing section heading when resume content exists', () => {
      // Remove "Education" heading from text while resume has education entries
      const textWithoutEducation = cleanExtractedText.replace('\nEducation\n', '\n');
      const result = lintExtractedText(textWithoutEducation, cleanResume);
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Missing section heading: "Education"'),
        ])
      );
    });

    it('detects out-of-order section headings', () => {
      // Move Skills heading before Experience heading
      const textOutOfOrder = `
Alex Morgan
Summary
Experienced systems architect
Skills
Languages: Go
Experience
Principal Architect
Education
UC Berkeley
`.trim();

      const result = lintExtractedText(textOutOfOrder, cleanResume);
      expect(result.passed).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('appears out of order'),
        ])
      );
    });

    it('correctly matches standalone heading indices via findHeadingIndex', () => {
      expect(findHeadingIndex('Summary\nHello', 'Summary')).toBeGreaterThanOrEqual(0);
      expect(findHeadingIndex('Experience:\nJob', 'Experience')).toBeGreaterThanOrEqual(0);
      expect(findHeadingIndex('This is not a heading', 'Education')).toBe(-1);
    });
  });
});

describe('POST /api/pdf/export Route Handler', () => {
  interface MockResumeRow {
    id: string;
    user_id: string;
    title: string;
    template: string;
    content: Resume;
  }

  let db: MockResumeRow[];
  let currentUser: { id: string; email: string } | null;
  let activePassUsers: Set<string>;
  let usageEvents: Array<{ user_id: string | null; route: string; model: string }>;

  function createMockAdminClient() {
    return {
      from: vi.fn((table: string) => {
        if (table === 'entitlements') {
          let eqUserId: string | null = null;
          const builder = {
            select: vi.fn(() => builder),
            eq: vi.fn((col: string, val: unknown) => {
              if (col === 'user_id') eqUserId = String(val);
              return builder;
            }),
            gt: vi.fn(() => builder),
            limit: vi.fn(async () => ({
              data: eqUserId && activePassUsers.has(eqUserId)
                ? [{ id: 'ent-1', status: 'active', expires_at: new Date(Date.now() + 86_400_000).toISOString() }]
                : [],
              error: null,
            })),
          };
          return builder;
        }

        if (table === 'usage_events') {
          let filterUserId: string | null = null;
          let filterRoute: string | null = null;
          return {
            select: vi.fn(() => {
              const countBuilder = {
                eq: vi.fn((col: string, val: unknown) => {
                  if (col === 'user_id') filterUserId = String(val);
                  if (col === 'route') filterRoute = String(val);
                  return countBuilder;
                }),
                then: (resolve: (val: { count: number; error: null }) => void) => {
                  const count = usageEvents.filter(
                    (e) =>
                      (!filterUserId || e.user_id === filterUserId) &&
                      (!filterRoute || e.route === filterRoute)
                  ).length;
                  resolve({ count, error: null });
                },
              };
              return countBuilder;
            }),
            insert: vi.fn(async (row: { user_id: string | null; route: string; model: string }) => {
              usageEvents.push({
                user_id: row.user_id,
                route: row.route,
                model: row.model,
              });
              return { error: null };
            }),
          };
        }

        throw new Error(`Unexpected admin table: ${table}`);
      }),
    } as unknown as SupabaseClient;
  }

  function createMockSupabaseClient() {
    return {
      auth: {
        getUser: vi.fn(async () => {
          if (!currentUser) {
            return { data: { user: null }, error: new Error('No session') };
          }
          return { data: { user: currentUser }, error: null };
        }),
      },
      from: vi.fn((table: string) => {
        if (table !== 'resumes') {
          throw new Error(`Unexpected table: ${table}`);
        }

        const filters: Array<{ col: keyof MockResumeRow; val: unknown }> = [];

        const queryBuilder = {
          select: vi.fn(() => queryBuilder),
          eq: vi.fn((col: keyof MockResumeRow, val: unknown) => {
            filters.push({ col, val });
            return queryBuilder;
          }),
          maybeSingle: vi.fn(async () => {
            const match = db.find((r) =>
              filters.every((f) => r[f.col] === f.val)
            );
            return { data: match || null, error: null };
          }),
        };

        return queryBuilder;
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: 'user-uuid-1', email: 'test@example.com' };
    activePassUsers = new Set();
    usageEvents = [];
    db = [
      {
        id: '11111111-1111-4111-a111-111111111111',
        user_id: 'user-uuid-1',
        title: 'Clean Resume',
        template: 'standard',
        content: cleanResume,
      },
      {
        id: '22222222-2222-4222-a222-222222222222',
        user_id: 'user-uuid-1',
        title: 'Placeholder Resume',
        template: 'standard',
        content: placeholderResume,
      },
    ];

    setServiceRoleClientForTesting(createMockAdminClient());
    vi.spyOn(supabaseServer, 'createClient').mockImplementation(async () =>
      createMockSupabaseClient() as unknown as ReturnType<typeof supabaseServer.createClient>
    );
  });

  afterEach(() => {
    setServiceRoleClientForTesting(null);
    vi.restoreAllMocks();
  });

  it('returns 401 Unauthorized when session user is not authenticated', async () => {
    currentUser = null;

    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 Bad Request when payload is invalid (non-UUID resumeId)', async () => {
    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: 'invalid-not-a-uuid' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid payload');
  });

  it('returns 404 Not Found when resume does not exist or does not belong to user', async () => {
    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: '33333333-3333-4333-a333-333333333333' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Resume not found');
  });

  it('returns 422 Unprocessable Entity when resume contains unresolved placeholders', async () => {
    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: '22222222-2222-4222-a222-222222222222' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('ATS lint failed');
    expect(body.diagnostics).toEqual(
      expect.arrayContaining([
        expect.stringContaining('[X%]'),
        expect.stringContaining('[N users]'),
      ])
    );
  });

  it('returns 200 with clean PDF stream and attachment Content-Disposition header when lint passes', async () => {
    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Alex_Morgan_Resume.pdf"'
    );

    const arrayBuffer = await res.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(100);

    // Verify PDF magic header bytes "%PDF-"
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
    const headerString = String.fromCharCode(...headerBytes);
    expect(headerString).toBe('%PDF-');
  });

  it('allows free user 1st clean export (200) and records 1 /api/pdf/export usage_events row', async () => {
    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(200);
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toEqual({
      user_id: 'user-uuid-1',
      route: '/api/pdf/export',
      model: 'standard',
    });
  });

  it('blocks free user 2nd export with HTTP 402 EXPORT_LIMIT_REACHED', async () => {
    usageEvents.push({
      user_id: 'user-uuid-1',
      route: '/api/pdf/export',
      model: 'standard',
    });

    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('EXPORT_LIMIT_REACHED');
    expect(usageEvents).toHaveLength(1);
  });

  it('allows active 30-day pass holder to export with >= 1 prior exports (200)', async () => {
    activePassUsers.add('user-uuid-1');
    usageEvents.push({
      user_id: 'user-uuid-1',
      route: '/api/pdf/export',
      model: 'standard',
    });

    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: '11111111-1111-4111-a111-111111111111' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(200);
    expect(usageEvents).toHaveLength(2);
  });

  it('does not charge usage_events when free user export fails ATS lint (422)', async () => {
    const req = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeId: '22222222-2222-4222-a222-222222222222' }),
    });

    const res = await exportPdfRoute(req);
    expect(res.status).toBe(422);
    expect(usageEvents).toHaveLength(0);
  });
});

describe('EditorHeader Export UI Component', () => {
  beforeEach(() => {
    useResumeStore.setState({
      resumeId: '11111111-1111-4111-a111-111111111111',
      title: 'Alex Morgan Resume',
      template: 'standard',
      resume: cleanResume,
      isDirty: false,
      isSaving: false,
      lastSavedAt: null,
      saveStatus: 'idle',
      saveError: null,
    });
  });

  it('renders primary Download PDF button with accessible test id and label', async () => {
    const { renderToString } = await import('react-dom/server');
    const { EditorHeader } = await import('@/components/editor/EditorHeader');

    const html = renderToString(React.createElement(EditorHeader));
    expect(html).toContain('data-testid="download-pdf-btn"');
    expect(html).toContain('Download PDF');
  });

  it('disables Download PDF button when resumeId is null', async () => {
    useResumeStore.setState({ resumeId: null });
    const { renderToString } = await import('react-dom/server');
    const { EditorHeader } = await import('@/components/editor/EditorHeader');

    const html = renderToString(React.createElement(EditorHeader));
    expect(html).toContain('disabled');
  });
});

