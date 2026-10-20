import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ResumeSchema, type Resume } from '@/types/resume';
import * as ResumeExports from '@/types/resume';

import spikeBasicJson from '../fixtures/resumes/spike-basic.json';
import spikeTwoPageJson from '../fixtures/resumes/spike-two-page.json';
import spikeAccentedJson from '../fixtures/resumes/spike-accented.json';
import spikePolishJson from '../fixtures/resumes/spike-polish.json';

describe('T-003: Core Resume Zod Schema & TypeScript Types', () => {
  // Helper to build a valid base resume for testing isolated mutations
  function createBaseResume(): Resume {
    return {
      basics: {
        fullName: 'Jane Doe',
        headline: 'Senior Software Engineer',
        email: 'jane.doe@example.com',
        phone: '+1 (555) 123-4567',
        location: 'New York, NY',
        links: [
          { label: 'GitHub', url: 'https://github.com/janedoe' },
          { label: 'Portfolio', url: 'https://janedoe.dev' },
        ],
      },
      summary: 'Experienced engineer passionate about distributed systems and clean design.',
      experience: [
        {
          id: 'exp-1',
          company: 'Acme Systems',
          title: 'Staff Engineer',
          location: 'New York, NY',
          start: '2021-03',
          end: null,
          current: true,
          bullets: [
            'Led migration of monolithic backend to event-driven microservices.',
            'Mentored junior engineers and instituted rigorous code review standards.',
          ],
        },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'OpenMetrics',
          url: 'https://openmetrics.example.com',
          bullets: ['Lightweight observability agent written in Go.'],
        },
      ],
      education: [
        {
          id: 'edu-1',
          school: 'Columbia University',
          degree: 'Bachelor of Science in Computer Science',
          start: '2016-09',
          end: '2020-05',
        },
      ],
      skills: [
        {
          group: 'Languages',
          items: ['TypeScript', 'Go', 'Rust'],
        },
      ],
    };
  }

  describe('1. Minimal Resume & Default Value Population', () => {
    it('parses minimal resume with only required fields and populates all schema defaults', () => {
      const minimalInput = {
        basics: {
          fullName: 'Alex Morgan',
          email: 'alex.morgan@example.com',
        },
      };

      const parsed = ResumeSchema.parse(minimalInput);

      expect(parsed.basics.fullName).toBe('Alex Morgan');
      expect(parsed.basics.email).toBe('alex.morgan@example.com');
      expect(parsed.basics.headline).toBe('');
      expect(parsed.basics.phone).toBeUndefined();
      expect(parsed.basics.location).toBeUndefined();
      expect(parsed.basics.links).toEqual([]);
      expect(parsed.summary).toBe('');
      expect(parsed.experience).toEqual([]);
      expect(parsed.projects).toEqual([]);
      expect(parsed.education).toEqual([]);
      expect(parsed.skills).toEqual([]);
    });

    it('rejects resume missing required basics or basics.fullName', () => {
      const noBasics = ResumeSchema.safeParse({});
      expect(noBasics.success).toBe(false);

      const emptyName = ResumeSchema.safeParse({
        basics: {
          fullName: '',
          email: 'alex@example.com',
        },
      });
      expect(emptyName.success).toBe(false);
      if (!emptyName.success) {
        expect(emptyName.error.issues.some((i) => i.path.includes('fullName'))).toBe(true);
      }
    });

    it('rejects resume missing required basics.email', () => {
      const noEmail = ResumeSchema.safeParse({
        basics: {
          fullName: 'Alex Morgan',
        },
      });
      expect(noEmail.success).toBe(false);
      if (!noEmail.success) {
        expect(noEmail.error.issues.some((i) => i.path.includes('email'))).toBe(true);
      }
    });
  });

  describe('2. Comprehensive Multi-Role Fixtures Validation', () => {
    it('validates spike-basic.json fixture cleanly', () => {
      const parsed = ResumeSchema.safeParse(spikeBasicJson);
      expect(parsed.success).toBe(true);
    });

    it('validates spike-two-page.json multi-role fixture cleanly', () => {
      const parsed = ResumeSchema.safeParse(spikeTwoPageJson);
      expect(parsed.success).toBe(true);
    });

    it('validates spike-accented.json fixture cleanly', () => {
      const parsed = ResumeSchema.safeParse(spikeAccentedJson);
      expect(parsed.success).toBe(true);
    });

    it('validates spike-polish.json fixture cleanly', () => {
      const parsed = ResumeSchema.safeParse(spikePolishJson);
      expect(parsed.success).toBe(true);
    });
  });

  describe('3. Email Validation (Zod 4 Syntax & Error Messaging)', () => {
    it('rejects invalid emails with clear error issue path', () => {
      const invalidEmails = [
        'not-an-email',
        'user@',
        '@example.com',
        'user@example',
        'plainaddress',
        'user name@example.com',
      ];

      for (const email of invalidEmails) {
        const base = createBaseResume();
        (base.basics as { email: string }).email = email;
        const result = ResumeSchema.safeParse(base);
        expect(result.success, `Expected email "${email}" to be rejected`).toBe(false);
        if (!result.success) {
          const emailIssue = result.error.issues.find((i) => i.path.includes('email'));
          expect(emailIssue, `Expected validation issue on path "basics.email" for "${email}"`).toBeDefined();
        }
      }
    });

    it('accepts valid RFC-compliant emails', () => {
      const validEmails = [
        'alex.morgan@example.com',
        'first.last+tag@sub.domain.org',
        'user_123@domain.co.uk',
      ];

      for (const email of validEmails) {
        const base = createBaseResume();
        base.basics.email = email;
        const result = ResumeSchema.safeParse(base);
        expect(result.success, `Expected email "${email}" to be accepted`).toBe(true);
      }
    });
  });

  describe('4. URL Validation in Links and Projects', () => {
    it('rejects invalid URLs in basics.links', () => {
      const invalidUrls = ['not-a-url', 'www.example.com', 'https://', 'http:// invalid with spaces'];

      for (const badUrl of invalidUrls) {
        const base = createBaseResume();
        base.basics.links = [{ label: 'Bad Link', url: badUrl }];
        const result = ResumeSchema.safeParse(base);
        expect(result.success, `Expected invalid links URL "${badUrl}" to be rejected`).toBe(false);
      }
    });

    it('rejects invalid URLs in projects', () => {
      const invalidUrls = ['not-a-url', 'www.example.com', 'https://', 'http:// invalid with spaces'];

      for (const badUrl of invalidUrls) {
        const base = createBaseResume();
        base.projects = [
          {
            id: 'proj-bad',
            name: 'Bad URL Project',
            url: badUrl,
            bullets: ['Some bullet'],
          },
        ];
        const result = ResumeSchema.safeParse(base);
        expect(result.success, `Expected invalid project URL "${badUrl}" to be rejected`).toBe(false);
      }
    });

    it('accepts optional url omitted in projects', () => {
      const base = createBaseResume();
      base.projects = [
        {
          id: 'proj-no-url',
          name: 'Project Without URL',
          bullets: ['Bullet points only'],
        },
      ];
      const result = ResumeSchema.safeParse(base);
      expect(result.success).toBe(true);
    });

    it('rejects more than 5 links in basics.links', () => {
      const base = createBaseResume();
      base.basics.links = Array.from({ length: 6 }, (_, idx) => ({
        label: `Link ${idx + 1}`,
        url: `https://example.com/link-${idx + 1}`,
      }));
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected >5 links in basics.links to be rejected').toBe(false);
    });
  });

  describe('5. Experience Section Constraints', () => {
    it('rejects more than 8 bullets in an experience entry', () => {
      const base = createBaseResume();
      base.experience[0].bullets = Array.from({ length: 9 }, (_, idx) => `Bullet item ${idx + 1}`);
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected >8 experience bullets to be rejected').toBe(false);
    });

    it('accepts exactly 8 bullets in an experience entry', () => {
      const base = createBaseResume();
      base.experience[0].bullets = Array.from({ length: 8 }, (_, idx) => `Bullet item ${idx + 1}`);
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected exactly 8 experience bullets to be accepted').toBe(true);
    });

    it('rejects experience bullets exceeding 300 characters', () => {
      const base = createBaseResume();
      base.experience[0].bullets = ['A'.repeat(301)];
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected experience bullet >300 characters to be rejected').toBe(false);
    });

    it('accepts experience bullets of exactly 300 characters', () => {
      const base = createBaseResume();
      base.experience[0].bullets = ['A'.repeat(300)];
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected experience bullet of 300 characters to be accepted').toBe(true);
    });

    it('populates experience current boolean default to false if omitted', () => {
      const rawExpWithoutCurrent = {
        basics: { fullName: 'Alex', email: 'alex@example.com' },
        experience: [
          {
            id: 'exp-default',
            company: 'Tech Corp',
            title: 'Developer',
            start: '2023-01',
            end: '2023-12',
            bullets: ['Contributed code'],
          },
        ],
      };
      const parsed = ResumeSchema.parse(rawExpWithoutCurrent);
      expect(parsed.experience[0].current).toBe(false);
    });
  });

  describe('6. Project Section Constraints', () => {
    it('rejects more than 5 bullets in a project entry', () => {
      const base = createBaseResume();
      base.projects = [
        {
          id: 'proj-too-many',
          name: 'Mega Project',
          bullets: Array.from({ length: 6 }, (_, idx) => `Project bullet ${idx + 1}`),
        },
      ];
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected >5 project bullets to be rejected').toBe(false);
    });

    it('rejects project bullets exceeding 300 characters', () => {
      const base = createBaseResume();
      base.projects = [
        {
          id: 'proj-long-bullet',
          name: 'Verbose Project',
          bullets: ['B'.repeat(301)],
        },
      ];
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected project bullet >300 characters to be rejected').toBe(false);
    });
  });

  describe('7. Summary Section Constraints', () => {
    it('rejects summary exceeding 600 characters', () => {
      const base = createBaseResume();
      base.summary = 'S'.repeat(601);
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected summary >600 characters to be rejected').toBe(false);
    });

    it('accepts summary of exactly 600 characters', () => {
      const base = createBaseResume();
      base.summary = 'S'.repeat(600);
      const result = ResumeSchema.safeParse(base);
      expect(result.success, 'Expected summary of 600 characters to be accepted').toBe(true);
    });
  });

  describe('8. Date Format (YearMonth) Constraints & Export', () => {
    it('accepts valid YearMonth formats: YYYY, YYYY-MM, and null', () => {
      const validDates = ['2024', '2024-06', '1999-12', '2020-01', null];

      for (const d of validDates) {
        const base = createBaseResume();
        base.experience[0].start = d;
        const result = ResumeSchema.safeParse(base);
        expect(result.success, `Expected date "${d}" to be accepted`).toBe(true);
      }
    });

    it('rejects non-standard date formats (e.g. "June 2024", "2024/06", "2024-6", "2024-06-15")', () => {
      const invalidDates = [
        'June 2024',
        '2024/06',
        '2024-6',
        '2024-06-15',
        '24-06',
        '06-2024',
        'Present',
        'current',
      ];

      for (const badDate of invalidDates) {
        const base = createBaseResume();
        base.experience[0].start = badDate;
        const result = ResumeSchema.safeParse(base);
        expect(result.success, `Expected invalid date format "${badDate}" to be rejected`).toBe(false);
      }
    });

    it('rejects out-of-bounds month numbers (e.g. "2024-00" and "2024-13")', () => {
      const outOfBoundsMonths = ['2024-00', '2024-13', '2024-99'];

      for (const badDate of outOfBoundsMonths) {
        const base = createBaseResume();
        base.experience[0].start = badDate;
        const result = ResumeSchema.safeParse(base);
        expect(result.success, `Expected out-of-bounds month "${badDate}" to be rejected`).toBe(false);
      }
    });

    it('exports YearMonth schema validator directly from types/resume.ts', () => {
      const YearMonth = (ResumeExports as Record<string, unknown>).YearMonth as z.ZodTypeAny | undefined;
      expect(YearMonth, 'Expected YearMonth to be an exported Zod validator from types/resume.ts').toBeDefined();
      if (YearMonth) {
        expect(YearMonth.safeParse('2024').success).toBe(true);
        expect(YearMonth.safeParse('2024-06').success).toBe(true);
        expect(YearMonth.safeParse(null).success).toBe(true);
        expect(YearMonth.safeParse('June 2024').success).toBe(false);
        expect(YearMonth.safeParse('2024-13').success).toBe(false);
      }
    });
  });
});
