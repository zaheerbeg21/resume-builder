import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { renderToBuffer, Document } from '@react-pdf/renderer';
import * as supabaseServer from '@/lib/db/supabase-server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ResumeParserOutputSchema, type ResumeParserOutput } from '@/lib/ai/schemas';
import {
  POST as parseResumeRoute,
  parseResumeLocally,
  normalizeDate,
} from '@/app/api/ai/parse-resume/route';
import { ImportReviewModal } from '@/components/import/ImportReviewModal';
import { ImportResumeDialog } from '@/components/import/ImportResumeDialog';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { ResumeDocument } from '@/lib/pdf/templates/standard';
import { registerFonts } from '@/lib/pdf/fonts';
import type { Resume } from '@/types/resume';

// Mock next/navigation for client components
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Sample mock resume text for deterministic parsing tests
const SAMPLE_RESUME_TEXT = `Jane Doe
Senior Full-Stack Engineer
jane.doe@example.com | (555) 987-6543 | Seattle, WA | https://github.com/janedoe | https://linkedin.com/in/janedoe

Summary
Passionate engineer with 8+ years building resilient web services, event-driven pipelines, and high-performance cloud architectures.

Experience
Acme Cloud Systems | Staff Software Architect | 2021-03 - Present
- Architected enterprise multi-tenant Kubernetes platform supporting 15M active users.
- Reduced p99 API latency by 45% through Redis caching and query restructuring.
- Spearheaded team of 8 senior engineers across distributed global clusters.

Pioneer Tech Solutions | Senior Software Developer | 2018-06 - 2021-02
- Built scalable event processing microservices with Node.js, TypeScript, and Kafka.
- Implemented automated CI/CD deployment pipelines cutting release time in half.

Education
University of Washington | Bachelor of Science in Computer Science | 2014 - 2018

Skills
Languages: TypeScript, JavaScript, Python, Go, SQL
Frameworks: React, Next.js, Node.js, Express
Cloud & Tools: AWS, Kubernetes, Docker, PostgreSQL, Redis, Git
`;

describe('Resume Import Parser & Review Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Date Normalization Helper', () => {
    it('normalizes YYYY-MM and YYYY dates verbatim', () => {
      expect(normalizeDate('2021-03')).toEqual({ date: '2021-03' });
      expect(normalizeDate('2018')).toEqual({ date: '2018' });
    });

    it('normalizes Present, Current, and Now to null end date', () => {
      expect(normalizeDate('Present')).toEqual({ date: null });
      expect(normalizeDate('current')).toEqual({ date: null });
      expect(normalizeDate('Now')).toEqual({ date: null });
    });

    it('converts month name + year to YYYY-MM', () => {
      expect(normalizeDate('January 2021')).toEqual({ date: '2021-01' });
      expect(normalizeDate('Oct 2019')).toEqual({ date: '2019-10' });
    });

    it('converts MM/YYYY to YYYY-MM', () => {
      expect(normalizeDate('05/2020')).toEqual({ date: '2020-05' });
    });

    it('falls back to null with warning when date format is unrecognized', () => {
      const res = normalizeDate('unspecified time');
      expect(res.date).toBeNull();
      expect(res.warning).toBeDefined();
    });
  });

  describe('2. Deterministic Local Resume Parser', () => {
    it('extracts contact info, summary, experience, education, and skills correctly', () => {
      const parsed = parseResumeLocally(SAMPLE_RESUME_TEXT);

      // Verify schema compliance
      const validated = ResumeParserOutputSchema.safeParse(parsed);
      expect(validated.success).toBe(true);

      // Basics
      expect(parsed.basics.fullName).toBe('Jane Doe');
      expect(parsed.basics.headline).toBe('Senior Full-Stack Engineer');
      expect(parsed.basics.email).toBe('jane.doe@example.com');
      expect(parsed.basics.phone).toContain('555');
      expect(parsed.basics.location).toBe('Seattle, WA');
      expect(parsed.basics.links.length).toBeGreaterThanOrEqual(1);

      // Summary
      expect(parsed.summary).toContain('Passionate engineer with 8+ years');

      // Experience
      expect(parsed.experience.length).toBe(2);
      expect(parsed.experience[0].company).toContain('Acme Cloud');
      expect(parsed.experience[0].title).toContain('Architect');
      expect(parsed.experience[0].start).toBe('2021-03');
      expect(parsed.experience[0].current).toBe(true);
      expect(parsed.experience[0].end).toBeNull();
      expect(parsed.experience[0].bullets.length).toBe(3);

      expect(parsed.experience[1].company).toContain('Pioneer Tech');
      expect(parsed.experience[1].start).toBe('2018-06');
      expect(parsed.experience[1].end).toBe('2021-02');
      expect(parsed.experience[1].current).toBe(false);

      // Education
      expect(parsed.education.length).toBe(1);
      expect(parsed.education[0].school).toContain('University of Washington');
      expect(parsed.education[0].degree).toContain('Bachelor of Science');

      // Skills
      expect(parsed.skills.length).toBeGreaterThanOrEqual(2);
      const languageSkill = parsed.skills.find((s) => s.group.includes('Languages'));
      expect(languageSkill?.items).toContain('TypeScript');
      expect(languageSkill?.items).toContain('Python');
    });

    it('identifies and tags low-confidence fields when data is missing or ambiguous', () => {
      const incompleteResume = `
      Software Resume
      Summary
      Experienced developer working on various applications.
      Experience
      Software Engineer
      - Worked on core website functionality.
      Education
      College
      `;

      const parsed = parseResumeLocally(incompleteResume);
      expect(parsed.low_confidence_paths).toContain('basics.email');
      expect(parsed.low_confidence_paths).toContain('basics.phone');
      expect(parsed.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('3. POST /api/ai/parse-resume Route Handler', () => {
    it('returns 401 Unauthorized when session is unauthenticated', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      } as unknown as SupabaseClient);

      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: SAMPLE_RESUME_TEXT }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('enforces 5 MB file size limit and returns HTTP 413 if exceeded', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'test-user', email: 'test@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClient);

      // Over 5 MB text string
      const hugeText = 'A'.repeat(5 * 1024 * 1024 + 100);
      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: hugeText }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.error).toContain('exceeds 5 MB limit');
    });

    it('triggers Scan Fallback: returns HTTP 422 with isScan: true when extracted text is <200 chars', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'test-user', email: 'test@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClient);

      const shortText = 'John Doe. Software Engineer. Call me at 555-1234.'; // ~50 chars < 200
      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: shortText }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.isScan).toBe(true);
      expect(json.error).toContain('Extracted text is too short');
    });

    it('returns 200 with ResumeParserOutput when text payload is valid', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'test-user', email: 'test@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClient);

      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: SAMPLE_RESUME_TEXT }),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.basics.fullName).toBe('Jane Doe');
      expect(json.experience.length).toBeGreaterThan(0);
      expect(json.skills.length).toBeGreaterThan(0);
      expect(Array.isArray(json.warnings)).toBe(true);
      expect(Array.isArray(json.low_confidence_paths)).toBe(true);
    });

    it('extracts text from real PDF buffer using pdf-parse v2 class API', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'test-user', email: 'test@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClient);

      // Render a real PDF buffer using React-PDF
      registerFonts();
      const mockResumeData: Resume = {
        basics: {
          fullName: 'Morgan Freeman',
          headline: 'Cloud Systems Architect',
          email: 'morgan.freeman@example.com',
          phone: '+1 555-4321',
          location: 'San Francisco, CA',
          links: [],
        },
        summary: 'Experienced cloud systems architect with over a decade of hands-on experience designing and operating distributed platforms, Kubernetes clusters, and microservice architectures with zero data loss.',
        experience: [
          {
            id: 'exp-1',
            company: 'Starlight Computing',
            title: 'Staff Architect',
            start: '2021-01',
            end: null,
            current: true,
            bullets: [
              'Architected robust microservices and distributed database platforms.',
              'Mentored junior engineers and improved operational release cadence.',
            ],
          },
        ],
        projects: [],
        education: [
          {
            id: 'edu-1',
            school: 'Stanford University',
            degree: 'B.S. in Computer Science',
            start: '2016-09',
            end: '2020-06',
          },
        ],
        skills: [
          {
            group: 'Languages',
            items: ['TypeScript', 'Go', 'Rust'],
          },
        ],
      };

      const docElement = React.createElement(ResumeDocument, {
        resume: mockResumeData,
      }) as unknown as React.ReactElement<React.ComponentProps<typeof Document>>;

      const pdfBuffer = await renderToBuffer(docElement);
      expect(pdfBuffer.byteLength).toBeGreaterThan(1000);

      // Send as binary PDF body
      const req = new Request('http://localhost:3000/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: new Uint8Array(pdfBuffer),
      });

      const res = await parseResumeRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.basics.fullName).toBe('Morgan Freeman');
      expect(json.basics.email).toBe('morgan.freeman@example.com');
      expect(json.experience.length).toBeGreaterThan(0);
    });
  });

  describe('4. ImportReviewModal UI Component & Save Dispatch', () => {
    const mockParsedOutput: ResumeParserOutput = {
      basics: {
        fullName: 'Jane Doe',
        headline: 'Staff Engineer',
        email: 'unconfirmed@example.com',
        phone: '+1 555-0100',
        location: 'Seattle, WA',
        links: [],
      },
      summary: 'Experienced developer',
      experience: [
        {
          id: 'exp-1',
          company: 'Tech Innovations',
          title: 'Senior Engineer',
          start: '2021-01',
          end: null,
          current: true,
          bullets: ['Built microservice platforms.'],
        },
      ],
      projects: [],
      education: [
        {
          id: 'edu-1',
          school: 'University',
          degree: 'Degree',
          start: '2016',
          end: '2020',
        },
      ],
      skills: [{ group: 'Languages', items: ['TypeScript', 'Go'] }],
      warnings: ['Email placeholder assigned.', 'Education degree was ambiguous.'],
      low_confidence_paths: [
        'basics.email',
        'education.0.degree',
      ],
    };

    it('renders modal dialog and highlights low confidence paths with amber badges', () => {
      const html = renderToString(
        React.createElement(ImportReviewModal, {
          isOpen: true,
          onClose: () => {},
          parsedResume: mockParsedOutput,
        })
      );

      // Verify header and modal structure
      expect(html).toContain('Review Parsed Resume');
      expect(html).toContain('Extraction Complete');

      // Verify warnings box
      expect(html).toContain('Parsing Warnings');
      expect(html).toContain('Email placeholder assigned.');

      // Verify low confidence badge on basics.email
      expect(html).toContain('data-testid="badge-low-conf-basics-email"');
      expect(html).toContain('Needs confirmation');

      // Verify low confidence badge on education.0.degree
      expect(html).toContain('data-testid="badge-low-conf-education-0-degree"');

      // Verify action buttons
      expect(html).toContain('Confirm &amp; Save Resume');
      expect(html).toContain('Cancel');
    });

    it('renders clean without low confidence badges when paths array is empty', () => {
      const cleanOutput: ResumeParserOutput = {
        ...mockParsedOutput,
        low_confidence_paths: [],
        warnings: [],
      };

      const html = renderToString(
        React.createElement(ImportReviewModal, {
          isOpen: true,
          onClose: () => {},
          parsedResume: cleanOutput,
        })
      );

      expect(html).not.toContain('badge-low-conf-basics-email');
      expect(html).not.toContain('Needs confirmation');
      expect(html).not.toContain('Parsing Warnings');
    });

    it('dispatches POST /api/resumes with parsed content when saving', async () => {
      const onSavedMock = vi.fn();
      const mockSavedResponse = { id: 'new-res-123', title: 'Jane Doe Resume' };

      const originalFetch = globalThis.fetch;
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSavedResponse,
      } as Response);
      globalThis.fetch = fetchSpy;

      try {
        const payload = {
          title: 'Jane Doe Resume',
          template: 'standard',
          content: mockParsedOutput,
        };

        const res = await globalThis.fetch('/api/resumes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        onSavedMock(data);

        expect(fetchSpy).toHaveBeenCalledWith('/api/resumes', expect.objectContaining({
          method: 'POST',
        }));
        expect(onSavedMock).toHaveBeenCalledWith(mockSavedResponse);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('5. ImportResumeDialog Component', () => {
    it('renders drag-and-drop file upload zone and paste tab', () => {
      const html = renderToString(
        React.createElement(ImportResumeDialog, {
          isOpen: true,
          onClose: () => {},
        })
      );

      expect(html).toContain('Import Existing Resume');
      expect(html).toContain('Upload PDF');
      expect(html).toContain('Paste Text');
      expect(html).toContain('Drag and drop your PDF resume here');
      expect(html).toContain('Extract &amp; Review');
    });

    it('does not render when isOpen is false', () => {
      const html = renderToString(
        React.createElement(ImportResumeDialog, {
          isOpen: false,
          onClose: () => {},
        })
      );

      expect(html).toBe('');
    });
  });

  describe('6. DashboardView Import Button Integration', () => {
    it('renders Import PDF button alongside Create New Resume in active state', () => {
      const html = renderToString(
        React.createElement(DashboardView, {
          initialResumes: [],
        })
      );

      expect(html).toContain('data-testid="import-resume-header-btn"');
      expect(html).toContain('Import PDF');
      expect(html).toContain('data-testid="create-resume-header-btn"');
      expect(html).toContain('Create New Resume');
    });

    it('disables Import PDF button when resume limit is reached (5 of 5)', () => {
      const fiveResumes = Array.from({ length: 5 }, (_, i) => ({
        id: `res-${i + 1}`,
        title: `Resume ${i + 1}`,
        template: 'standard',
      }));

      const html = renderToString(
        React.createElement(DashboardView, {
          initialResumes: fiveResumes,
        })
      );

      expect(html).toContain('data-testid="import-resume-header-btn"');
      expect(html).toContain('disabled=""');
      expect(html).toContain('cursor-not-allowed');
      expect(html).toContain('Resume limit reached (5 of 5)');
    });
  });
});
