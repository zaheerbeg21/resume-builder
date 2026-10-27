import { describe, it, expect } from 'vitest';
import {
  ResumeImportDraftSchema,
  flagOverLimitContent,
  type ResumeImportDraft,
  ReviewFlagSchema,
} from '@/lib/ai/schemas';
import { ResumeSchema } from '@/types/resume';

/**
 * Flag Path Conventions:
 * - 'summary': summary text length exceeds SUMMARY_MAX (600)
 * - 'basics.links': link items count exceeds LINKS_MAX (5)
 * - 'experience[i].bullets': experience item bullets count exceeds EXPERIENCE_BULLETS_MAX (8)
 * - 'experience[i].bullets[j]': individual experience bullet character length exceeds BULLET_CHARS_MAX (300)
 * - 'projects[i].bullets': project item bullets count exceeds PROJECT_BULLETS_MAX (5)
 * - 'projects[i].bullets[j]': individual project bullet character length exceeds BULLET_CHARS_MAX (300)
 */

function createFictionalValidDraft(overrides: Partial<ResumeImportDraft> = {}): ResumeImportDraft {
  const base: ResumeImportDraft = {
    basics: {
      fullName: 'Alex Example',
      headline: 'Software Engineer',
      email: 'alex@example.org',
      phone: '+1-555-0100',
      location: 'Example City',
      links: [
        { label: 'Website', url: 'https://example.org' },
      ],
    },
    summary: 'Experienced software engineer with a track record of building reliable systems.',
    experience: [
      {
        id: 'exp-1',
        company: 'Example Corp',
        title: 'Senior Developer',
        location: 'Remote',
        start: '2020-01',
        end: 'Present',
        current: true,
        bullets: ['Built scalable distributed backend services with high uptime.'],
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'Project Alpha',
        url: 'https://example.org/project-alpha',
        bullets: ['Designed and implemented core streaming architecture.'],
      },
    ],
    education: [
      {
        id: 'edu-1',
        school: 'Example University',
        degree: 'B.S. in Computer Science',
        start: '2016-09',
        end: '2020-05',
      },
    ],
    skills: [
      {
        group: 'Engineering',
        items: ['TypeScript', 'Node.js', 'PostgreSQL'],
      },
    ],
    warnings: [],
    low_confidence_paths: [],
    review_flags: [],
  };

  return ResumeImportDraftSchema.parse({
    ...base,
    ...overrides,
  });
}

function createMinimalValidResume() {
  return {
    basics: {
      fullName: 'Jordan Example',
      headline: 'Staff Engineer',
      email: 'jordan@example.org',
      links: [
        { label: 'Portfolio', url: 'https://example.org/portfolio' },
      ],
    },
    summary: 'A short summary under 600 characters.',
    experience: [
      {
        id: 'exp-1',
        company: 'Fictional Tech',
        title: 'Engineer',
        start: '2021-01',
        end: null,
        current: true,
        bullets: ['Standard bullet under 300 characters.'],
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'Tooling',
        bullets: ['Tooling project bullet.'],
      },
    ],
    education: [
      {
        id: 'edu-1',
        school: 'Tech Institute',
        degree: 'B.S.',
        start: '2017-09',
        end: '2021-05',
      },
    ],
    skills: [
      { group: 'Languages', items: ['TypeScript'] },
    ],
  };
}

describe('T-021: ResumeImportDraftSchema & flagOverLimitContent', () => {
  it('1. accepts null for each nullable field specified in criterion 1', () => {
    const draftWithNulls = createFictionalValidDraft({
      basics: {
        fullName: null,
        headline: 'Engineer',
        email: null,
        phone: null,
        location: 'Remote',
        links: [],
      },
      experience: [
        {
          id: 'exp-1',
          company: null,
          title: null,
          location: 'Remote',
          start: '2021-01',
          end: null,
          current: true,
          bullets: ['Bullet text'],
        },
      ],
      education: [
        {
          id: 'edu-1',
          school: null,
          degree: null,
          start: '2017',
          end: '2021',
        },
      ],
    });

    const parsed = ResumeImportDraftSchema.safeParse(draftWithNulls);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.basics.fullName).toBeNull();
    expect(parsed.data.basics.email).toBeNull();
    expect(parsed.data.basics.phone).toBeNull();
    expect(parsed.data.experience[0].company).toBeNull();
    expect(parsed.data.experience[0].title).toBeNull();
    expect(parsed.data.education[0].school).toBeNull();
    expect(parsed.data.education[0].degree).toBeNull();
  });

  it('2. preserves 601-character summary unchanged and flags EXCEEDS_LENGTH_LIMIT with path "summary"', () => {
    const longSummary = 'A'.repeat(601);
    const draft = createFictionalValidDraft({ summary: longSummary });

    const parsed = ResumeImportDraftSchema.parse(draft);
    expect(parsed.summary).toHaveLength(601);
    expect(parsed.summary).toBe(longSummary);

    const flagged = flagOverLimitContent(parsed);
    expect(flagged.summary).toBe(longSummary);
    expect(flagged.review_flags).toEqual([
      {
        path: 'summary',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
    ]);
  });

  it('3. preserves and flags role with 9 bullets and bullet over 300 characters', () => {
    const nineBullets = Array.from({ length: 9 }, (_, i) => `Fictional bullet ${i + 1}`);
    const longBullet = 'B'.repeat(305);
    nineBullets[0] = longBullet;

    const draft = createFictionalValidDraft({
      experience: [
        {
          id: 'exp-1',
          company: 'Example Corp',
          title: 'Senior Engineer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: nineBullets,
        },
      ],
    });

    const parsed = ResumeImportDraftSchema.parse(draft);
    expect(parsed.experience[0].bullets).toHaveLength(9);
    expect(parsed.experience[0].bullets[0]).toHaveLength(305);

    const flagged = flagOverLimitContent(parsed);
    expect(flagged.experience[0].bullets).toHaveLength(9);
    expect(flagged.experience[0].bullets[0]).toHaveLength(305);
    expect(flagged.review_flags).toEqual([
      {
        path: 'experience[0].bullets',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
      {
        path: 'experience[0].bullets[0]',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
    ]);
  });

  it('4. preserves and flags project with 6 bullets', () => {
    const sixBullets = Array.from({ length: 6 }, (_, i) => `Project task bullet ${i + 1}`);
    const draft = createFictionalValidDraft({
      projects: [
        {
          id: 'proj-1',
          name: 'Project Beta',
          url: 'https://example.org/beta',
          bullets: sixBullets,
        },
      ],
    });

    const parsed = ResumeImportDraftSchema.parse(draft);
    expect(parsed.projects[0].bullets).toHaveLength(6);

    const flagged = flagOverLimitContent(parsed);
    expect(flagged.projects[0].bullets).toHaveLength(6);
    expect(flagged.review_flags).toEqual([
      {
        path: 'projects[0].bullets',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
    ]);
  });

  it('5. preserves and flags 6 links', () => {
    const sixLinks = [
      { label: 'Site 1', url: 'https://example.org/1' },
      { label: 'Site 2', url: 'https://example.org/2' },
      { label: 'Site 3', url: 'https://example.org/3' },
      { label: 'Site 4', url: 'https://example.org/4' },
      { label: 'Site 5', url: 'https://example.org/5' },
      { label: 'Site 6', url: 'https://example.org/6' },
    ];

    const draft = createFictionalValidDraft({
      basics: {
        fullName: 'Alex Example',
        headline: 'Developer',
        email: 'alex@example.org',
        links: sixLinks,
      },
    });

    const parsed = ResumeImportDraftSchema.parse(draft);
    expect(parsed.basics.links).toHaveLength(6);

    const flagged = flagOverLimitContent(parsed);
    expect(flagged.basics.links).toHaveLength(6);
    expect(flagged.review_flags).toEqual([
      {
        path: 'basics.links',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
    ]);
  });

  it('6. parses a link without a scheme (e.g. "www.example.org/portfolio")', () => {
    const draft = createFictionalValidDraft({
      basics: {
        fullName: 'Alex Example',
        headline: 'Developer',
        email: 'alex@example.org',
        links: [
          { label: 'Portfolio', url: 'www.example.org/portfolio' },
          { label: 'Blog', url: 'blog.example.org' },
        ],
      },
    });

    const parsed = ResumeImportDraftSchema.safeParse(draft);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.basics.links[0].url).toBe('www.example.org/portfolio');
    expect(parsed.data.basics.links[1].url).toBe('blog.example.org');
  });

  it('7. flags non-first items: experience[1] over 8 bullets and projects[1] over 5 bullets', () => {
    const draft = createFictionalValidDraft({
      experience: [
        {
          id: 'exp-1',
          company: 'First Corp',
          title: 'Dev 1',
          start: '2020-01',
          end: null,
          current: true,
          bullets: ['Single bullet'],
        },
        {
          id: 'exp-2',
          company: 'Second Corp',
          title: 'Dev 2',
          start: '2019-01',
          end: '2020-01',
          current: false,
          bullets: Array.from({ length: 9 }, (_, i) => `Exp bullet ${i + 1}`),
        },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'First Proj',
          bullets: ['Single proj bullet'],
        },
        {
          id: 'proj-2',
          name: 'Second Proj',
          bullets: Array.from({ length: 6 }, (_, i) => `Proj bullet ${i + 1}`),
        },
      ],
    });

    const parsed = ResumeImportDraftSchema.parse(draft);
    const flagged = flagOverLimitContent(parsed);

    expect(flagged.review_flags).toEqual([
      {
        path: 'experience[1].bullets',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
      {
        path: 'projects[1].bullets',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
    ]);
  });

  it('8. flags a project bullet of 301 chars exactly at projects[0].bullets[0]', () => {
    const draft = createFictionalValidDraft({
      projects: [
        {
          id: 'proj-1',
          name: 'Project Delta',
          bullets: ['P'.repeat(301)],
        },
      ],
    });

    const parsed = ResumeImportDraftSchema.parse(draft);
    expect(parsed.projects[0].bullets[0]).toHaveLength(301);

    const flagged = flagOverLimitContent(parsed);
    expect(flagged.review_flags).toEqual([
      {
        path: 'projects[0].bullets[0]',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
    ]);
  });

  it('9. boundary test: exact limits produce zero flags', () => {
    const exact600Summary = 'C'.repeat(600);
    const exact300ExpBullet = 'D'.repeat(300);
    const exact300ProjBullet = 'P'.repeat(300);
    const eightExpBullets = [exact300ExpBullet, ...Array.from({ length: 7 }, (_, i) => `Exp bullet ${i + 2}`)];
    const fiveProjBullets = [exact300ProjBullet, ...Array.from({ length: 4 }, (_, i) => `Proj bullet ${i + 2}`)];
    const fiveLinks = Array.from({ length: 5 }, (_, i) => ({
      label: `Link ${i + 1}`,
      url: `https://example.org/link-${i + 1}`,
    }));

    const draft = createFictionalValidDraft({
      summary: exact600Summary,
      basics: {
        fullName: 'Alex Example',
        headline: 'Lead Developer',
        email: 'alex@example.org',
        links: fiveLinks,
      },
      experience: [
        {
          id: 'exp-1',
          company: 'Example Corp',
          title: 'Staff Engineer',
          start: '2019-01',
          end: null,
          current: true,
          bullets: eightExpBullets,
        },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'Project Gamma',
          bullets: fiveProjBullets,
        },
      ],
      review_flags: [],
    });

    const flagged = flagOverLimitContent(draft);
    expect(flagged.review_flags).toEqual([]);
  });

  it('10. input draft is not mutated by flagOverLimitContent', () => {
    const draft = createFictionalValidDraft({
      summary: 'M'.repeat(605),
      review_flags: [],
    });

    const cloneBefore = JSON.parse(JSON.stringify(draft));
    Object.freeze(draft);

    flagOverLimitContent(draft);
    expect(draft).toEqual(cloneBefore);
  });

  it('11. output draft equals input draft apart from review_flags', () => {
    const draft = createFictionalValidDraft({
      summary: 'O'.repeat(610),
      review_flags: [],
    });

    const flagged = flagOverLimitContent(draft);
    expect({ ...flagged, review_flags: [] }).toEqual({ ...draft, review_flags: [] });
  });

  it('12. pre-existing review_flags are preserved and new flags are appended', () => {
    const preExistingFlag = {
      path: 'unslotted',
      reason: 'UNSLOTTED_CONTENT' as const,
      excerpt: 'Fictional preserved excerpt text',
    };
    const draft = createFictionalValidDraft({
      summary: 'E'.repeat(605),
      review_flags: [preExistingFlag],
    });

    const flagged = flagOverLimitContent(draft);
    expect(flagged.review_flags).toEqual([
      preExistingFlag,
      {
        path: 'summary',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
    ]);
  });

  it('13. preserves and flags all over-limit sections in canonical order (summary, basics.links, experience, projects)', () => {
    const draft = createFictionalValidDraft({
      summary: 'S'.repeat(605),
      basics: {
        fullName: 'Alex Example',
        headline: 'Lead Developer',
        email: 'alex@example.org',
        links: Array.from({ length: 6 }, (_, i) => ({
          label: `Link ${i + 1}`,
          url: `https://example.org/${i + 1}`,
        })),
      },
      experience: [
        {
          id: 'exp-1',
          company: 'Example Corp',
          title: 'Senior Engineer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: Array.from({ length: 9 }, (_, i) => `Exp bullet ${i + 1}`),
        },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'Project Omega',
          bullets: Array.from({ length: 6 }, (_, i) => `Proj bullet ${i + 1}`),
        },
      ],
      review_flags: [],
    });

    const flagged = flagOverLimitContent(draft);
    expect(flagged.review_flags).toEqual([
      {
        path: 'summary',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
      {
        path: 'basics.links',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
      {
        path: 'experience[0].bullets',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
      {
        path: 'projects[0].bullets',
        reason: 'EXCEEDS_LENGTH_LIMIT',
      },
    ]);
  });

  it('14. accepts unstructured draft dates: "03/2021", "Present", and "2021"', () => {
    const draft = createFictionalValidDraft({
      experience: [
        {
          id: 'exp-1',
          company: 'Example Corp',
          title: 'Developer',
          start: '03/2021',
          end: 'Present',
          current: true,
          bullets: ['Worked on migrations.'],
        },
      ],
      education: [
        {
          id: 'edu-1',
          school: 'Example University',
          degree: 'B.S.',
          start: '2021',
          end: null,
        },
      ],
    });

    const parsed = ResumeImportDraftSchema.safeParse(draft);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.experience[0].start).toBe('03/2021');
    expect(parsed.data.experience[0].end).toBe('Present');
    expect(parsed.data.education[0].start).toBe('2021');
    expect(parsed.data.education[0].end).toBeNull();
  });

  it('15. drift test: positive control passes ResumeSchema, while strict limits reject over-limit values', () => {
    const validResume = createMinimalValidResume();
    expect(ResumeSchema.safeParse(validResume).success).toBe(true);

    // 601-char summary rejected by ResumeSchema
    const longSummaryResume = {
      ...validResume,
      summary: 'X'.repeat(601),
    };
    expect(ResumeSchema.safeParse(longSummaryResume).success).toBe(false);

    // 9 experience bullets rejected by ResumeSchema
    const nineBulletsResume = {
      ...validResume,
      experience: [
        {
          ...validResume.experience[0],
          bullets: Array.from({ length: 9 }, (_, i) => `Bullet ${i + 1}`),
        },
      ],
    };
    expect(ResumeSchema.safeParse(nineBulletsResume).success).toBe(false);

    // 301-character bullet rejected by ResumeSchema
    const longBulletResume = {
      ...validResume,
      experience: [
        {
          ...validResume.experience[0],
          bullets: ['Y'.repeat(301)],
        },
      ],
    };
    expect(ResumeSchema.safeParse(longBulletResume).success).toBe(false);

    // 6 project bullets rejected by ResumeSchema
    const sixProjBulletsResume = {
      ...validResume,
      projects: [
        {
          ...validResume.projects[0],
          bullets: Array.from({ length: 6 }, (_, i) => `Proj bullet ${i + 1}`),
        },
      ],
    };
    expect(ResumeSchema.safeParse(sixProjBulletsResume).success).toBe(false);

    // 6 links rejected by ResumeSchema
    const sixLinksResume = {
      ...validResume,
      basics: {
        ...validResume.basics,
        links: Array.from({ length: 6 }, (_, i) => ({
          label: `Link ${i + 1}`,
          url: `https://example.org/link-${i + 1}`,
        })),
      },
    };
    expect(ResumeSchema.safeParse(sixLinksResume).success).toBe(false);
  });

  it('16. defaults warnings, low_confidence_paths, and review_flags to empty arrays', () => {
    const minimalDraftInput = {
      basics: {
        fullName: 'Alex Minimal',
        email: 'alex@example.org',
      },
      summary: 'Basic profile.',
      experience: [],
      projects: [],
      education: [],
      skills: [],
    };

    const parsed = ResumeImportDraftSchema.safeParse(minimalDraftInput);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.warnings).toEqual([]);
    expect(parsed.data.low_confidence_paths).toEqual([]);
    expect(parsed.data.review_flags).toEqual([]);
  });

  it('17. UNSLOTTED_CONTENT flag with excerpt round-trips through ResumeImportDraftSchema, and unknown reason is rejected', () => {
    const unslottedFlag = {
      path: 'unslotted',
      reason: 'UNSLOTTED_CONTENT' as const,
      message: 'Unslotted content found in imported document',
      excerpt: 'Fictional uncategorized awards section text',
    };

    const validDraft = createFictionalValidDraft({
      review_flags: [unslottedFlag],
    });

    const parsed = ResumeImportDraftSchema.safeParse(validDraft);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.review_flags).toHaveLength(1);
    expect(parsed.data.review_flags[0]).toEqual(unslottedFlag);

    const invalidFlag = {
      path: 'unslotted',
      reason: 'INVALID_UNKNOWN_REASON',
      excerpt: 'Fictional text',
    };

    const invalidDraft = {
      ...validDraft,
      review_flags: [invalidFlag],
    };

    const invalidParsed = ResumeImportDraftSchema.safeParse(invalidDraft);
    expect(invalidParsed.success).toBe(false);

    const flagSchemaCheck = ReviewFlagSchema.safeParse(invalidFlag);
    expect(flagSchemaCheck.success).toBe(false);
  });
});
