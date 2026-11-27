import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ResumeImportDraft } from '@/lib/ai/schemas';
import { ResumeSchema } from '@/types/resume';
import {
  IMPORT_STAGE_LABELS,
  ImportResumeDialog,
  type ImportProgressStage,
  uploadAndParseResumePdf,
} from '@/components/import/ImportResumeDialog';
import {
  ImportReviewModal,
  normalizeParsedResumeForReview,
  sanitizeResumeForSave,
} from '@/components/import/ImportReviewModal';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('T-033: Stage-1 Import UI Wiring & Draft Review', () => {
  it('1. executes signed-URL -> Storage PUT -> 202 enqueue -> polling pending/processing -> completed happy path', async () => {
    const draftPayload: ResumeImportDraft = {
      basics: {
        fullName: 'Taylor Reed',
        headline: 'Backend Engineer',
        email: 'taylor.reed@example.com',
        phone: null,
        location: undefined,
        links: [{ label: 'GitHub', url: 'https://github.com/taylorreed' }],
      },
      summary: 'Distributed systems engineer.',
      experience: [
        {
          id: 'exp-1',
          company: 'Northstar Systems',
          title: 'Senior Engineer',
          start: '2022-01',
          end: null,
          current: true,
          bullets: ['Built resilient ingestion pipelines.'],
        },
      ],
      projects: [],
      education: [],
      skills: [{ group: 'Backend', items: ['TypeScript', 'PostgreSQL'] }],
      warnings: [],
      low_confidence_paths: [],
      review_flags: [],
    };

    const stages: ImportProgressStage[] = [];
    let pollAttempt = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/resumes/upload-url' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            signedUrl: 'https://storage.local/signed-put',
            storagePath: 'user-1/upload-1.pdf',
            expiresIn: 120,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === 'https://storage.local/signed-put' && init?.method === 'PUT') {
        return new Response(null, { status: 200 });
      }
      if (url === '/api/ai/parse-resume' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            jobId: 'job-uuid-1',
            status: 'pending',
            pollUrl: '/api/ai/parse-resume/status/job-uuid-1',
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === '/api/ai/parse-resume/status/job-uuid-1' && init?.method === 'GET') {
        pollAttempt += 1;
        if (pollAttempt === 1) {
          return new Response(JSON.stringify({ jobId: 'job-uuid-1', status: 'pending' }), {
            status: 200,
          });
        }
        if (pollAttempt === 2) {
          return new Response(JSON.stringify({ jobId: 'job-uuid-1', status: 'processing' }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            jobId: 'job-uuid-1',
            status: 'completed',
            result: draftPayload,
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    }) as unknown as typeof fetch;

    const fakePdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
      type: 'application/pdf',
    });

    const result = await uploadAndParseResumePdf(fakePdf, {
      fetchFn: fetchMock,
      pollIntervalMs: 0,
      onStageChange: (stage) => stages.push(stage),
    });

    expect(result).toEqual({ ok: true, draft: draftPayload });
    expect(stages).toEqual(['uploading', 'queued', 'queued', 'extracting']);
    expect(IMPORT_STAGE_LABELS.uploading).toBe('Uploading PDF...');
    expect(IMPORT_STAGE_LABELS.queued).toBe('Queued for extraction...');
    expect(IMPORT_STAGE_LABELS.extracting).toBe('Extracting resume details...');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://storage.local/signed-put',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf',
          'x-upsert': 'false',
        },
        body: fakePdf,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/parse-resume',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ storagePath: 'user-1/upload-1.pdf' }),
      }),
    );
  });

  it('2. triggers scan fallback on isScan failure and surfaces clean recovery error on terminal parse_failed', async () => {
    const createSequentialFetch = (pollErrorBody: Record<string, unknown>) =>
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/resumes/upload-url') {
          return new Response(
            JSON.stringify({
              signedUrl: 'https://storage.local/signed-put',
              storagePath: 'user-1/doc.pdf',
            }),
            { status: 200 },
          );
        }
        if (url === 'https://storage.local/signed-put') {
          return new Response(null, { status: 200 });
        }
        if (url === '/api/ai/parse-resume') {
          return new Response(
            JSON.stringify({
              jobId: 'job-2',
              status: 'pending',
              pollUrl: '/api/ai/parse-resume/status/job-2',
            }),
            { status: 202 },
          );
        }
        return new Response(
          JSON.stringify({
            jobId: 'job-2',
            status: 'failed',
            error: pollErrorBody,
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;

    const fakePdf = new Blob(['%PDF'], { type: 'application/pdf' });

    const scanResult = await uploadAndParseResumePdf(fakePdf, {
      fetchFn: createSequentialFetch({
        isScan: true,
        error: 'Extracted text is too short. Please paste your resume text.',
      }),
      pollIntervalMs: 0,
    });
    expect(scanResult).toEqual({
      ok: false,
      isScan: true,
      message: 'Extracted text is too short. Please paste your resume text.',
    });

    const terminalResult = await uploadAndParseResumePdf(fakePdf, {
      fetchFn: createSequentialFetch({
        parse_failed: true,
        is_scan: false,
        manual_fallback: true,
      }),
      pollIntervalMs: 0,
    });
    expect(terminalResult.ok).toBe(false);
    if (terminalResult.ok) throw new Error('Expected terminal failure result');
    expect(terminalResult.isScan).toBe(false);
    expect(terminalResult.message).toContain('Switch to Paste Text');
    expect(terminalResult.message).not.toContain('Error:');
  });

  it('3. handles 429 and 503 from /api/resumes/upload-url cleanly without attempting Storage PUT', async () => {
    const fakePdf = new Blob(['%PDF'], { type: 'application/pdf' });

    const rateLimitFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Retry-After': '42' },
      });
    }) as unknown as typeof fetch;

    const res429 = await uploadAndParseResumePdf(fakePdf, { fetchFn: rateLimitFetch });
    expect(res429.ok).toBe(false);
    if (res429.ok) throw new Error('Expected 429 failure result');
    expect(res429.isScan).toBe(false);
    expect(res429.message).toContain('42 seconds');
    expect(rateLimitFetch).toHaveBeenCalledTimes(1);

    const unavailableFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 503,
        headers: { 'Retry-After': '5' },
      });
    }) as unknown as typeof fetch;

    const res503 = await uploadAndParseResumePdf(fakePdf, { fetchFn: unavailableFetch });
    expect(res503.ok).toBe(false);
    if (res503.ok) throw new Error('Expected 503 failure result');
    expect(res503.isScan).toBe(false);
    expect(res503.message).toContain('5 seconds');
    expect(unavailableFetch).toHaveBeenCalledTimes(1);

    // Dialog markup renders accessible paste-text tab and polite dialog structure
    const dialogMarkup = renderToStaticMarkup(
      React.createElement(ImportResumeDialog, {
        isOpen: true,
        onClose: () => {},
      }),
    );
    expect(dialogMarkup).toContain('role="dialog"');
    expect(dialogMarkup).toContain('aria-label="Upload PDF resume"');
  });

  it('4. ImportReviewModal renders nullable ResumeImportDraft fields without placeholders, shows EXCEEDS_LENGTH_LIMIT, and renders UNSLOTTED_CONTENT', () => {
    const draftWithNullsAndFlags: ResumeImportDraft = {
      basics: {
        fullName: null,
        headline: '',
        email: null,
        phone: null,
        location: undefined,
        links: [{ label: 'Portfolio', url: null }],
      },
      summary: 'A'.repeat(620),
      experience: [
        {
          id: 'exp-1',
          company: null,
          title: null,
          start: null,
          end: null,
          current: false,
          bullets: ['Delivered backend migration.'],
        },
      ],
      projects: [{ id: 'proj-1', name: null, url: null, bullets: [] }],
      education: [
        {
          id: 'edu-1',
          school: null,
          degree: null,
          start: null,
          end: null,
        },
      ],
      skills: [],
      warnings: [],
      low_confidence_paths: ['experience.0.company'],
      review_flags: [
        {
          path: 'summary',
          reason: 'EXCEEDS_LENGTH_LIMIT',
        },
        {
          path: 'unslotted',
          reason: 'UNSLOTTED_CONTENT',
          message: 'Unplaced section content preserved for review.',
          excerpt: 'AWS Certified Solutions Architect - Associate (2025)',
        },
      ],
    };

    const normalized = normalizeParsedResumeForReview(draftWithNullsAndFlags);
    expect(normalized.basics.fullName).toBe('');
    expect(normalized.basics.email).toBe('');
    expect(normalized.experience[0].company).toBe('');
    expect(normalized.experience[0].title).toBe('');
    expect(normalized.education[0].school).toBe('');
    expect(normalized.education[0].degree).toBe('');
    expect(normalized.basics.links[0].url).toBe('');

    // Client-side ResumeSchema validation rejects missing required fields and over-limit summary
    const schemaCheck = ResumeSchema.safeParse(sanitizeResumeForSave(normalized));
    expect(schemaCheck.success).toBe(false);

    const html = renderToStaticMarkup(
      React.createElement(ImportReviewModal, {
        isOpen: true,
        onClose: () => {},
        parsedResume: draftWithNullsAndFlags,
      }),
    );

    // Zero synthetic placeholders invented
    expect(html).not.toContain('candidate@example.com');
    expect(html).not.toContain('value="Company"');
    expect(html).not.toContain('value="Degree"');

    // Missing required basics fields flagged with Needs confirmation
    expect(html).toContain('data-testid="badge-low-conf-basics-fullName"');
    expect(html).toContain('data-testid="badge-low-conf-basics-email"');
    expect(html).toContain('Needs confirmation');

    // EXCEEDS_LENGTH_LIMIT notice and UNSLOTTED_CONTENT excerpt rendered
    expect(html).toContain('data-testid="review-length-limit-notice"');
    expect(html).toContain('Summary exceeds 600 characters');
    expect(html).toContain('data-testid="review-unslotted-content-section"');
    expect(html).toContain('Additional Unslotted Content');
    expect(html).toContain('AWS Certified Solutions Architect - Associate (2025)');
  });
});
