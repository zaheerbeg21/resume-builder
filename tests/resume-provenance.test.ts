import { describe, it, expect } from 'vitest';
import {
  guardProvenance,
  CONTAINMENT_THRESHOLD,
  SHORT_FIELD_WORD_LIMIT,
  NGRAM_SIZE_STANDARD,
  NGRAM_SIZE_SHORT,
  SPATIAL_WINDOW_LINES,
  DATE_SEARCH_MARGIN_LINES,
} from '@/lib/ai/guards/provenance';
import { ResumeImportDraftSchema, type ResumeImportDraft } from '@/lib/ai/schemas';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze((obj as Record<string, unknown>)[key]);
  }
  return obj;
}

function createFictionalDraft(
  overrides: Partial<ResumeImportDraft> = {},
  options: { minimal?: boolean } = {}
): ResumeImportDraft {
  const base: ResumeImportDraft = options.minimal
    ? {
      basics: {
        fullName: null,
        headline: '',
        email: null,
        phone: null,
        location: '',
        links: [],
      },
      summary: '',
      experience: [],
      projects: [],
      education: [],
      skills: [],
      warnings: [],
      low_confidence_paths: [],
      review_flags: [],
    }
    : {
      basics: {
        fullName: 'Alex Example',
        headline: 'Lead Developer',
        email: 'alex@example.org',
        phone: '+1-555-0100',
        location: 'Example City',
        links: [
          { label: 'Website', url: 'https://example.org/alex' },
        ],
      },
      summary: 'Experienced software engineer specializing in scalable backend systems.',
      experience: [
        {
          id: 'exp-1',
          company: 'Example Corp',
          title: 'Lead Developer',
          location: 'Example City',
          start: '2020-01',
          end: null,
          current: true,
          bullets: [
            'Built scalable distributed backend services with high uptime and resilient data stores.',
          ],
        },
      ],
      projects: [
        {
          id: 'proj-1',
          name: 'Project Alpha',
          url: 'https://example.org/alpha',
          bullets: [
            'Engineered event-driven streaming pipeline processing high throughput events reliably.',
          ],
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
          group: 'Programming',
          items: ['TypeScript', 'Node.js', 'C++', 'C#'],
        },
      ],
      warnings: [],
      low_confidence_paths: [],
      review_flags: [],
    };

  return ResumeImportDraftSchema.parse({
    ...base,
    ...overrides,
    ...(options.minimal && overrides.basics
      ? {
        basics: {
          ...base.basics,
          ...overrides.basics,
        },
      }
      : {}),
  });
}

const standardSourceText = `
Alex Example
alex@example.org | +1-555-0100 | Example City | https://example.org/alex

Summary
Experienced software engineer specializing in scalable backend systems.

Experience
Lead Developer
Example Corp
2020-01 - Present
Built scalable distributed backend services with high uptime and resilient data stores.

Projects
Project Alpha
https://example.org/alpha
Engineered event-driven streaming pipeline processing high throughput events reliably.

Education
Example University
B.S. in Computer Science
2016-09 - 2020-05

Skills
Programming: TypeScript, Node.js, C++, C#
`;

describe('T-023: guardProvenance', () => {
  it('1. pins outputs: nulled paths appear exactly once in low_confidence_paths and report.nulledPaths in draft order; grounded fields produce neither', () => {
    const draft = createFictionalDraft({
      basics: {
        fullName: 'Alex Example',
        headline: 'Lead Developer',
        email: 'alex@example.org',
        links: [],
      },
      experience: [
        {
          id: 'exp-1',
          company: 'Hallucinated Inc',
          title: 'Lead Developer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: ['Built scalable distributed backend services with high uptime and resilient data stores.'],
        },
      ],
      education: [
        {
          id: 'edu-1',
          school: 'Phantom Institute',
          degree: 'B.S. in Computer Science',
          start: '2016-09',
          end: '2020-05',
        },
      ],
    });

    const { draft: resultDraft, report } = guardProvenance(draft, standardSourceText);

    expect(resultDraft.basics.fullName).toBe('Alex Example');
    expect(resultDraft.experience[0].title).toBe('Lead Developer');
    expect(resultDraft.education[0].degree).toBe('B.S. in Computer Science');

    expect(resultDraft.experience[0].company).toBeNull();
    expect(resultDraft.education[0].school).toBeNull();

    expect(report.nulledPaths).toEqual(['experience[0].company', 'education[0].school']);
    expect(resultDraft.low_confidence_paths).toEqual(['experience[0].company', 'education[0].school']);
  });

  it('2. converts hallucinated company, title, school, and degree to null and records exact paths in low_confidence_paths', () => {
    const draft = createFictionalDraft({
      experience: [
        {
          id: 'exp-1',
          company: 'Invented Aerospace Corp',
          title: 'Chief Wizard',
          start: '2020-01',
          end: null,
          current: true,
          bullets: [],
        },
      ],
      education: [
        {
          id: 'edu-1',
          school: 'Imaginary Academy',
          degree: 'Ph.D. in Alchemy',
          start: '2016-09',
          end: '2020-05',
        },
      ],
    });

    const { draft: resultDraft, report } = guardProvenance(draft, standardSourceText);

    expect(resultDraft.experience[0].company).toBeNull();
    expect(resultDraft.experience[0].title).toBeNull();
    expect(resultDraft.education[0].school).toBeNull();
    expect(resultDraft.education[0].degree).toBeNull();

    expect(report.nulledPaths).toEqual([
      'experience[0].company',
      'experience[0].title',
      'education[0].school',
      'education[0].degree',
    ]);
    expect(resultDraft.low_confidence_paths).toEqual([
      'experience[0].company',
      'experience[0].title',
      'education[0].school',
      'education[0].degree',
    ]);
  });

  it('3. converts hallucinated fullName, email, phone, link url, project name, and project url to null', () => {
    const draft = createFictionalDraft({
      basics: {
        fullName: 'Ghost Person',
        headline: 'Lead Developer',
        email: 'ghost@nowhere.org',
        phone: '+1-999-9999',
        links: [{ label: 'Site', url: 'https://phantom-link.org' }],
      },
      projects: [
        {
          id: 'proj-1',
          name: 'Phantom Project',
          url: 'https://phantom-project.org',
          bullets: [],
        },
      ],
    });

    const { draft: resultDraft, report } = guardProvenance(draft, standardSourceText);

    expect(resultDraft.basics.fullName).toBeNull();
    expect(resultDraft.basics.email).toBeNull();
    expect(resultDraft.basics.phone).toBeNull();
    expect(resultDraft.basics.links[0].url).toBeNull();
    expect(resultDraft.projects[0].name).toBeNull();
    expect(resultDraft.projects[0].url).toBeNull();

    expect(report.nulledPaths).toEqual([
      'basics.fullName',
      'basics.email',
      'basics.phone',
      'basics.links[0].url',
      'projects[0].name',
      'projects[0].url',
    ]);
  });

  it('4. skills: word boundaries (Java vs JavaScript), C# vs C++, and plain C isolation', () => {
    const sourceWithJavaScriptOnly = `
Skills
Programming: JavaScript, C#
    `;

    const draft = createFictionalDraft({
      skills: [
        {
          group: 'Programming',
          items: ['JavaScript', 'Java', 'C++', 'C#', 'C'],
        },
      ],
    });

    const { draft: resultDraft, report } = guardProvenance(draft, sourceWithJavaScriptOnly);

    // 'Java' must not match inside 'JavaScript'
    // 'C++' is absent when only 'C#' is in source
    // 'C' is absent when only 'C#' is in source
    // 'C#' and 'JavaScript' match exactly
    expect(resultDraft.skills[0].items).toEqual(['JavaScript', 'C#']);
    expect(report.removedSkillPaths).toEqual([
      'skills[0].items[1]', // Java
      'skills[0].items[2]', // C++
      'skills[0].items[4]', // C
    ]);
  });

  it('5a. bullet adversarial: short bullet with invented metric is rejected', () => {
    const source = `
Experience
Lead Developer
Example Corp
2020-01 - Present
Refactored microservices architecture.
    `;

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [
              'Refactored microservices architecture, increasing throughput by 40% and saving $2M.',
            ],
          },
        ],
      },
      { minimal: true }
    );

    const result = guardProvenance(draft, source);
    expect(result.draft.experience[0].bullets).toEqual([]);
    expect(result.report.nulledPaths).toEqual(['experience[0].bullets[0]']);
  });

  it('5b. bullet adversarial: 30+ word source bullet with 3-word invented tail containing a number is rejected', () => {
    const sourceBullet =
      'Engineered an enterprise data processing pipeline that ingested raw data streams across distributed nodes to generate indexed search documents daily for operational analytics across the company.';
    const source = `
Experience
Lead Developer
Example Corp
2020-01 - Present
${sourceBullet}
    `;

    // 30+ word source bullet plus 3-word invented tail with a number: "saving 500 hours"
    const inventedBullet = `${sourceBullet} saving 500 hours.`;

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [inventedBullet],
          },
        ],
      },
      { minimal: true }
    );

    const result = guardProvenance(draft, source);
    expect(result.draft.experience[0].bullets).toEqual([]);
    expect(result.report.nulledPaths).toEqual(['experience[0].bullets[0]']);
  });

  it('5c. bullet verification: faithfully extracted bullet passes unharmed', () => {
    const sourceBullet =
      'Engineered an enterprise data processing pipeline that ingested raw data streams across distributed nodes to generate indexed search documents daily.';
    const source = `
Experience
Lead Developer
Example Corp
2020-01 - Present
${sourceBullet}
    `;

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [sourceBullet],
          },
        ],
      },
      { minimal: true }
    );

    const result = guardProvenance(draft, source);
    expect(result.draft.experience[0].bullets).toEqual([sourceBullet]);
    expect(result.report.nulledPaths).toEqual([]);
  });

  it('6. evaluates 0.85 boundary: passes at exactly >= 0.85 and rejected below', () => {
    /**
     * N-gram Containment Arithmetic:
     * Output text has 22 words, generating 20 trigrams (W - 2 = 22 - 2 = 20 trigrams).
     *
     * Case A (17 matching trigrams out of 20):
     * Containment = 17 / 20 = 0.85 (>= CONTAINMENT_THRESHOLD 0.85).
     * Output is accepted.
     *
     * Case B (16 matching trigrams out of 20):
     * Containment = 16 / 20 = 0.80 (< CONTAINMENT_THRESHOLD 0.85).
     * Output is rejected.
     */
    expect(CONTAINMENT_THRESHOLD).toBe(0.85);
    expect(SHORT_FIELD_WORD_LIMIT).toBe(6);
    expect(NGRAM_SIZE_STANDARD).toBe(3);
    expect(NGRAM_SIZE_SHORT).toBe(2);

    const source = `
Experience
Lead Developer
Example Corp
2020-01 - Present
one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty
    `;

    const bulletAt85 =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen extraA extraB extraC';

    const draftAt85 = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [bulletAt85],
          },
        ],
      },
      { minimal: true }
    );

    const resultAt85 = guardProvenance(draftAt85, source);
    expect(resultAt85.draft.experience[0].bullets).toEqual([bulletAt85]);

    const bulletBelow85 =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen extraA extraB extraC extraD';

    const draftBelow85 = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [bulletBelow85],
          },
        ],
      },
      { minimal: true }
    );

    const resultBelow85 = guardProvenance(draftBelow85, source);
    expect(resultBelow85.draft.experience[0].bullets).toEqual([]);
    expect(resultBelow85.report.nulledPaths).toEqual(['experience[0].bullets[0]']);
  });

  it('7. rejects bullet where containment passes (21/24 = 0.875) but contains an invented currency token ($2M)', () => {
    /**
     * Trigram Arithmetic:
     * Source bullet (25 words):
     * "Managed an engineering department delivering software platforms on schedule with high reliability and zero downtime across multiple global production clusters throughout the entire fiscal year."
     *
     * Output bullet with single inserted token "$2M" (26 words, 24 trigrams):
     * "Managed an engineering department delivering software platforms on schedule with high reliability and zero downtime saving $2M across multiple global production clusters throughout the entire fiscal year."
     *
     * Trigrams affected by inserted token:
     * 1. (downtime, saving, $2M) - not in source
     * 2. (saving, $2M, across) - not in source
     * 3. ($2M, across, multiple) - not in source
     * Matching trigrams = 24 - 3 = 21.
     * Containment score = 21 / 24 = 0.875 (87.5% >= 0.85).
     *
     * Containment score alone passes (0.875 >= 0.85), but '$2M' is an ungrounded currency token.
     * The guard must reject the bullet.
     */
    const sourceBullet =
      'Managed an engineering department delivering software platforms on schedule with high reliability and zero downtime across multiple global production clusters throughout the entire fiscal year.';
    const source = `
Experience
Lead Developer
Example Corp
2020-01 - Present
${sourceBullet}
    `;

    const outputBulletWithCurrency =
      'Managed an engineering department delivering software platforms on schedule with high reliability and zero downtime saving $2M across multiple global production clusters throughout the entire fiscal year.';

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [outputBulletWithCurrency],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);
    expect(resultDraft.experience[0].bullets).toEqual([]);
    expect(report.nulledPaths).toEqual(['experience[0].bullets[0]']);
  });

  it('8. anchoring: rejects cross-role bullet under wrong role, and accepts under correct role control', () => {
    const multiRoleSource = `
Experience
Lead Developer
Example Corp
2020-01 - Present
Engineered cloud infrastructure components.

Software Engineer
Previous Solutions
2018-06 - 2019-12
Optimized database query response times.
    `;

    const crossRoleDraft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: ['Optimized database query response times.'], // Belongs to Previous Solutions
          },
          {
            id: 'exp-2',
            company: 'Previous Solutions',
            title: 'Software Engineer',
            start: '2018-06',
            end: '2019-12',
            current: false,
            bullets: [],
          },
        ],
      },
      { minimal: true }
    );

    const crossResult = guardProvenance(crossRoleDraft, multiRoleSource);
    expect(crossResult.draft.experience[0].bullets).toEqual([]);
    expect(crossResult.report.nulledPaths).toEqual(['experience[0].bullets[0]']);

    // Control: same bullet under correct role passes
    const correctRoleDraft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: ['Engineered cloud infrastructure components.'],
          },
          {
            id: 'exp-2',
            company: 'Previous Solutions',
            title: 'Software Engineer',
            start: '2018-06',
            end: '2019-12',
            current: false,
            bullets: ['Optimized database query response times.'],
          },
        ],
      },
      { minimal: true }
    );

    const correctResult = guardProvenance(correctRoleDraft, multiRoleSource);
    expect(correctResult.draft.experience[1].bullets).toEqual(['Optimized database query response times.']);
    expect(correctResult.report.nulledPaths).toEqual([]);
  });

  it('9. anchoring: checks headless summary before first entity, rejects unanchored summary, and rejects text without verified entity anchor without whole-document fallback', () => {
    const headlessSource = `
Alex Example
alex@example.org

Self-directed engineer with deep expertise in distributed database architecture.

Experience
Lead Developer
Example Corp
2020-01 - Present
Built scalable backend services.

Unverified Footer Section
Engineered cloud infrastructure components.
    `;

    // Headless summary before first verified entity
    const draftHeadless = createFictionalDraft(
      {
        basics: {
          fullName: 'Alex Example',
          headline: '',
          email: 'alex@example.org',
          links: [],
        },
        summary: 'Self-directed engineer with deep expertise in distributed database architecture.',
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: ['Built scalable backend services.'],
          },
        ],
      },
      { minimal: true }
    );
    const resultHeadless = guardProvenance(draftHeadless, headlessSource);
    expect(resultHeadless.draft.summary).toBe('Self-directed engineer with deep expertise in distributed database architecture.');
    expect(resultHeadless.report.nulledPaths).toEqual([]);

    // Unanchored summary not present in the pre-entity region
    const draftUnanchored = createFictionalDraft(
      {
        basics: {
          fullName: 'Alex Example',
          headline: '',
          email: 'alex@example.org',
          links: [],
        },
        summary: 'Invented summary not present anywhere in pre-entity region.',
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: ['Built scalable backend services.'],
          },
        ],
      },
      { minimal: true }
    );
    const resultUnanchored = guardProvenance(draftUnanchored, headlessSource);
    expect(resultUnanchored.draft.summary).toBe('');
    expect(resultUnanchored.report.nulledPaths).toEqual(['summary']);

    // No-verified-entity case: role has ungrounded title & company; bullet text exists in document footer but cannot be anchored
    const draftNoVerifiedEntity = createFictionalDraft(
      {
        basics: {
          fullName: 'Alex Example',
          headline: '',
          email: 'alex@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Nonexistent Enterprise',
            title: 'Ghost Specialist',
            start: '2020-01',
            end: null,
            current: true,
            bullets: ['Engineered cloud infrastructure components.'],
          },
        ],
      },
      { minimal: true }
    );

    const resultNoEntity = guardProvenance(draftNoVerifiedEntity, headlessSource);
    expect(resultNoEntity.draft.experience[0].bullets).toEqual([]);
    expect(resultNoEntity.report.nulledPaths).toEqual([
      'experience[0].company',
      'experience[0].title',
      'experience[0].bullets[0]',
    ]);
  });

  it('10a. dates: normalizes MM/YYYY, YYYY-MM, YYYY, and English month names to ISO format', () => {
    const dateSource = `
Lead Developer
Example Corp
March 2020 - Present
Built services.

Software Engineer
Previous Solutions
06/2018 - 12/2019
Maintained tools.

Education
Example University
B.S. in Computer Science
2016 - 2020
    `;

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: 'March 2020',
            end: 'Present',
            current: false,
            bullets: [],
          },
          {
            id: 'exp-2',
            company: 'Previous Solutions',
            title: 'Software Engineer',
            start: '06/2018',
            end: '12/2019',
            current: false,
            bullets: [],
          },
        ],
        education: [
          {
            id: 'edu-1',
            school: 'Example University',
            degree: 'B.S. in Computer Science',
            start: '2016',
            end: '2020',
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, dateSource);

    expect(resultDraft.experience[0].start).toBe('2020-03');
    expect(resultDraft.experience[1].start).toBe('2018-06');
    expect(resultDraft.experience[1].end).toBe('2019-12');
    expect(resultDraft.education[0].start).toBe('2016');
    expect(resultDraft.education[0].end).toBe('2020');
    expect(report.nulledPaths).toEqual([]);
  });

  it('10b. dates: "Present" resolves to end null and current true', () => {
    const source = `
Lead Developer
Example Corp
2020-01 - Present
Built services.
    `;

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: 'Present',
            current: false,
            bullets: [],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);
    expect(resultDraft.experience[0].end).toBeNull();
    expect(resultDraft.experience[0].current).toBe(true);
    expect(report.nulledPaths).toEqual([]);
  });

  it('10c. dates: date not in source dates is nulled and flagged in report.nulledPaths', () => {
    const source = `
Lead Developer
Example Corp
2020-01 - Present
Built services.
    `;

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '1995-05', // Ungrounded date
            end: null,
            current: true,
            bullets: [],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);
    expect(resultDraft.experience[0].start).toBeNull();
    expect(report.nulledPaths).toEqual(['experience[0].start']);
  });

  it('10d. dates: unparseable date string is nulled and flagged in report.nulledPaths', () => {
    const source = `
Lead Developer
Example Corp
2020-01 - Present
Built services.
    `;

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: 'not-a-valid-date-string',
            end: null,
            current: true,
            bullets: [],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);
    expect(resultDraft.experience[0].start).toBeNull();
    expect(report.nulledPaths).toEqual(['experience[0].start']);
  });

  it('10e. dates: non-English month name is nulled and flagged in report.nulledPaths', () => {
    const source = `
Lead Developer
Example Corp
2020-01 - Present
Built services.
    `;

    const draft = createFictionalDraft(
      {
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Lead Developer',
            start: '15 de Mayo 2020',
            end: null,
            current: true,
            bullets: [],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);
    expect(resultDraft.experience[0].start).toBeNull();
    expect(report.nulledPaths).toEqual(['experience[0].start']);
  });

  it('10f. dates: unmapped source date range produces an entry in report.unmappedDateRanges without throwing', () => {
    const sourceWithUnmappedRole = `
Lead Developer
Example Corp
2020-01 - Present
Built services.

Legacy Engineer
Old Startup LLC
2012-05 - 2014-08
Previous unlisted tenure.
    `;

    const draft = createFictionalDraft(); // Only contains exp-1 (2020-01)
    const { report } = guardProvenance(draft, sourceWithUnmappedRole);

    expect(report.unmappedDateRanges).toEqual(['2012-05 - 2014-08']);
  });

  it('11. spatial pairing: date exactly SPATIAL_WINDOW_LINES away passes, but SPATIAL_WINDOW_LINES + 1 is in decoupledRoles', () => {
    expect(SPATIAL_WINDOW_LINES).toBe(4);

    // Dynamic generation of filler lines:
    // Distance from company (line 2) to dates:
    // exactlyBoundary: SPATIAL_WINDOW_LINES (4 lines away)
    // decoupled: SPATIAL_WINDOW_LINES + 1 (5 lines away)
    const exactBoundaryFiller = Array.from(
      { length: SPATIAL_WINDOW_LINES - 1 },
      (_, i) => `filler line ${i + 1}`
    ).join('\n');

    const exactlyBoundarySource = `
Lead Developer
Example Corp
${exactBoundaryFiller}
2020-01 - Present
Built services.
    `;

    const draft = createFictionalDraft();
    const resultBoundary = guardProvenance(draft, exactlyBoundarySource);
    expect(resultBoundary.report.decoupledRoles).toEqual([]);

    const decoupledFiller = Array.from(
      { length: SPATIAL_WINDOW_LINES },
      (_, i) => `filler line ${i + 1}`
    ).join('\n');

    const decoupledSource = `
Lead Developer
Example Corp
${decoupledFiller}
2020-01 - Present
Built services.
    `;

    const resultDecoupled = guardProvenance(draft, decoupledSource);
    expect(resultDecoupled.report.decoupledRoles).toEqual(['experience[0]']);

    // Title separated from company/dates by more than SPATIAL_WINDOW_LINES lines
    const titleDecoupledFiller = Array.from(
      { length: SPATIAL_WINDOW_LINES },
      (_, i) => `title filler ${i + 1}`
    ).join('\n');

    const titleDecoupledSource = `
Lead Developer
${titleDecoupledFiller}
Example Corp
2020-01 - Present
Built services.
    `;

    const resultTitleDecoupled = guardProvenance(draft, titleDecoupledSource);
    expect(resultTitleDecoupled.report.decoupledRoles).toEqual(['experience[0]']);
  });

  it('12. entity-swap invariance: mechanical mapping yields identical report structure and mapped output equality', () => {
    const draftA = createFictionalDraft(
      {
        basics: {
          fullName: 'Alex Example',
          headline: 'Lead Developer',
          email: 'alex@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Hallucinated Alpha Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: ['Built scalable distributed backend services with high uptime and resilient data stores.'],
          },
        ],
      },
      { minimal: true }
    );

    const sourceA = `
Alex Example
alex@example.org | Example City

Lead Developer
True Company Alpha
2020-01 - Present
Built scalable distributed backend services with high uptime and resilient data stores.
    `;

    // Mechanical substitution map
    const mapAtoB = (text: string) =>
      text
        .replace(/Alex Example/g, 'Jordan Fictional')
        .replace(/Example City/g, 'Metro Town')
        .replace(/True Company Alpha/g, 'Real Enterprise Beta')
        .replace(/Hallucinated Alpha Corp/g, 'Hallucinated Beta Corp');

    const mapBtoA = (text: string) =>
      text
        .replace(/Jordan Fictional/g, 'Alex Example')
        .replace(/Metro Town/g, 'Example City')
        .replace(/Real Enterprise Beta/g, 'True Company Alpha')
        .replace(/Hallucinated Beta Corp/g, 'Hallucinated Alpha Corp');

    const sourceB = mapAtoB(sourceA);
    const draftB = JSON.parse(mapAtoB(JSON.stringify(draftA)));

    const resultA = guardProvenance(draftA, sourceA);
    const resultB = guardProvenance(draftB, sourceB);

    // Exact equal report structures
    expect(resultA.report.nulledPaths).toEqual(['experience[0].company']);
    expect(resultB.report.nulledPaths).toEqual(['experience[0].company']);
    expect(resultA.report.removedSkillPaths).toEqual(resultB.report.removedSkillPaths);
    expect(resultA.report.unmappedDateRanges).toEqual(resultB.report.unmappedDateRanges);
    expect(resultA.report.decoupledRoles).toEqual(resultB.report.decoupledRoles);

    // Mapped output equality
    const resultBMappedBack = JSON.parse(mapBtoA(JSON.stringify(resultB.draft)));
    expect(resultBMappedBack).toEqual(resultA.draft);
  });

  it('13. non-Latin multilingual fixture: preserves fully Japanese draft unharmed and nulls hallucinated item in that script', () => {
    const japaneseSource = `
山田 太郎
yamada@example.org | +81-3-0000-0000 | 東京都 | https://example.org/yamada

概要
大規模な分散システムとデータベースの設計および構築に従事。

職歴
ソフトウェアエンジニア
株式会社サンプル技術
2020-01 - 現在
分散バックエンドシステムの開発およびマイクロサービスの設計運用を担当。

学歴
東京工科大学
情報科学学士
2016-04 - 2020-03

スキル
技術: TypeScript, Go言語
    `;

    const draftJapanese = createFictionalDraft(
      {
        basics: {
          fullName: '山田 太郎',
          headline: 'ソフトウェアエンジニア',
          email: 'yamada@example.org',
          phone: '+81-3-0000-0000',
          location: '東京都',
          links: [{ label: 'ウェブサイト', url: 'https://example.org/yamada' }],
        },
        summary: '大規模な分散システムとデータベースの設計および構築に従事。',
        experience: [
          {
            id: 'exp-1',
            company: '株式会社架空企業', // Hallucinated Japanese company
            title: 'ソフトウェアエンジニア', // Grounded
            start: '2020-01',
            end: 'Present', // Source has 現在, but only English 'Present' is supported -> nulled & flagged per decision 4
            current: false,
            bullets: ['分散バックエンドシステムの開発およびマイクロサービスの設計運用を担当。'],
          },
        ],
        education: [
          {
            id: 'edu-1',
            school: '東京工科大学',
            degree: '情報科学学士',
            start: '2016-04',
            end: '2020-03',
          },
        ],
        skills: [
          {
            group: '技術',
            items: ['TypeScript', 'Go言語'],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draftJapanese, japaneseSource);

    expect(resultDraft.basics.fullName).toBe('山田 太郎');
    expect(resultDraft.basics.headline).toBe('ソフトウェアエンジニア');
    expect(resultDraft.basics.email).toBe('yamada@example.org');
    expect(resultDraft.basics.phone).toBe('+81-3-0000-0000');
    expect(resultDraft.basics.location).toBe('東京都');
    expect(resultDraft.basics.links[0].url).toBe('https://example.org/yamada');
    expect(resultDraft.summary).toBe('大規模な分散システムとデータベースの設計および構築に従事。');
    expect(resultDraft.experience[0].title).toBe('ソフトウェアエンジニア');
    expect(resultDraft.experience[0].bullets).toEqual([
      '分散バックエンドシステムの開発およびマイクロサービスの設計運用を担当。',
    ]);
    expect(resultDraft.education[0].school).toBe('東京工科大学');
    expect(resultDraft.education[0].degree).toBe('情報科学学士');
    expect(resultDraft.skills[0].items).toEqual(['TypeScript', 'Go言語']);

    expect(resultDraft.experience[0].company).toBeNull();
    expect(resultDraft.experience[0].end).toBeNull();
    expect(report.nulledPaths).toEqual(['experience[0].company', 'experience[0].end']);
  });

  it('14. immutability: deep freeze on input verifies zero mutation, pre-call clone matches, and output differs', () => {
    const draft = createFictionalDraft({
      summary: 'Hallucinated summary content that will be rejected.',
    });
    const cloneBefore = JSON.parse(JSON.stringify(draft));
    deepFreeze(draft);

    const { draft: outputDraft } = guardProvenance(draft, standardSourceText);

    expect(draft).toEqual(cloneBefore);
    expect(outputDraft).not.toEqual(draft);
    expect(outputDraft.summary).toBe('');
  });

  it('15. non-truncation: long bullets maintain exact character length without clipping', () => {
    const longBullet = 'Built scalable distributed backend services with high uptime and resilient data stores '.repeat(5).trim();
    const sourceWithLongBullet = `
Lead Developer
Example Corp
2020-01 - Present
${longBullet}
    `;

    const draft = createFictionalDraft({
      experience: [
        {
          id: 'exp-1',
          company: 'Example Corp',
          title: 'Lead Developer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: [longBullet],
        },
      ],
    });

    const { draft: resultDraft } = guardProvenance(draft, sourceWithLongBullet);
    expect(resultDraft.experience[0].bullets).toEqual([longBullet]);
    expect(resultDraft.experience[0].bullets[0]).toHaveLength(longBullet.length);
  });

  it('16. fully grounded draft returns equal to input with an empty report', () => {
    // Source contains exactly the role in the draft, with end: null and current: true in draft
    const fullyGroundedDraft = createFictionalDraft();

    const { draft: resultDraft, report } = guardProvenance(fullyGroundedDraft, standardSourceText);

    expect(resultDraft).toEqual(fullyGroundedDraft);
    expect(report.nulledPaths).toEqual([]);
    expect(report.removedSkillPaths).toEqual([]);
    expect(report.unmappedDateRanges).toEqual([]);
    expect(report.decoupledRoles).toEqual([]);
  });

  it('17. pre-existing low_confidence_paths are preserved and new nulled paths are appended', () => {
    expect(DATE_SEARCH_MARGIN_LINES).toBe(5);
    const draft = createFictionalDraft(
      {
        low_confidence_paths: ['basics.headline'],
        experience: [
          {
            id: 'exp-1',
            company: 'Hallucinated Alpha Corp',
            title: 'Lead Developer',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, standardSourceText);

    expect(resultDraft.experience[0].company).toBeNull();
    expect(report.nulledPaths).toEqual(['experience[0].company']);
    expect(resultDraft.low_confidence_paths).toEqual([
      'basics.headline',
      'experience[0].company',
    ]);
  });

  it('18. (1) headline equal to first role title does not anchor: grounded summary survives and summary is absent from nulledPaths', () => {
    const summaryParagraph =
      'Built distributed storage engines and low-latency replication pipelines across regional clusters.';
    const source = [
      'Jordan Avery',
      'Staff Systems Architect',
      'jordan.avery@example.org | +1-555-0148 | Stonehaven, EX',
      'Summary',
      summaryParagraph,
      'Experience',
      'Example Corp | Staff Systems Architect | 2020-01 - Present',
      'Built scalable distributed backend services with high uptime and resilient data stores.',
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Jordan Avery',
          headline: 'Staff Systems Architect',
          email: 'jordan.avery@example.org',
          phone: '+1-555-0148',
          location: 'Stonehaven, EX',
          links: [],
        },
        summary: summaryParagraph,
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Staff Systems Architect',
            location: 'Stonehaven, EX',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [
              'Built scalable distributed backend services with high uptime and resilient data stores.',
            ],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);

    expect(resultDraft.summary).toBe(summaryParagraph);
    expect(report.nulledPaths).not.toContain('summary');
    expect(report.nulledPaths).toEqual([]);
    expect(resultDraft.low_confidence_paths).toEqual([]);
    expect(report.decoupledRoles).toEqual([]);
  });

  it('19. (2) control: same source with headline equal to first role title still nulls an invented summary', () => {
    const summaryParagraph =
      'Built distributed storage engines and low-latency replication pipelines across regional clusters.';
    const source = [
      'Jordan Avery',
      'Staff Systems Architect',
      'jordan.avery@example.org | +1-555-0148 | Stonehaven, EX',
      'Summary',
      summaryParagraph,
      'Experience',
      'Example Corp | Staff Systems Architect | 2020-01 - Present',
      'Built scalable distributed backend services with high uptime and resilient data stores.',
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Jordan Avery',
          headline: 'Staff Systems Architect',
          email: 'jordan.avery@example.org',
          phone: '+1-555-0148',
          location: 'Stonehaven, EX',
          links: [],
        },
        summary:
          'Invented executive summary claiming ten years of quantum compiler research.',
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Staff Systems Architect',
            location: 'Stonehaven, EX',
            start: '2020-01',
            end: null,
            current: true,
            bullets: [
              'Built scalable distributed backend services with high uptime and resilient data stores.',
            ],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);

    expect(resultDraft.summary).toBe('');
    expect(report.nulledPaths).toEqual(['summary']);
    expect(resultDraft.low_confidence_paths).toEqual(['summary']);
  });

  it('20. (3) headline equal to second role title only does not anchor: grounded summary survives', () => {
    const summaryParagraph =
      'Built distributed storage engines and low-latency replication pipelines across regional clusters.';
    const source = [
      'Jordan Avery',
      'Senior Backend Developer',
      'jordan.avery@example.org | +1-555-0148 | Stonehaven, EX',
      'Summary',
      summaryParagraph,
      'Experience',
      'Example Corp | Staff Systems Architect | 2021-03 - Present',
      'Built scalable distributed backend services with high uptime and resilient data stores.',
      'Northwind Labs | Senior Backend Developer | 2018-06 - 2021-02',
      'Migrated ledger service to partitioned storage reducing tail latency across clusters.',
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Jordan Avery',
          headline: 'Senior Backend Developer',
          email: 'jordan.avery@example.org',
          phone: '+1-555-0148',
          location: 'Stonehaven, EX',
          links: [],
        },
        summary: summaryParagraph,
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Staff Systems Architect',
            location: 'Stonehaven, EX',
            start: '2021-03',
            end: null,
            current: true,
            bullets: [
              'Built scalable distributed backend services with high uptime and resilient data stores.',
            ],
          },
          {
            id: 'exp-2',
            company: 'Northwind Labs',
            title: 'Senior Backend Developer',
            location: 'Stonehaven, EX',
            start: '2018-06',
            end: '2021-02',
            current: false,
            bullets: [
              'Migrated ledger service to partitioned storage reducing tail latency across clusters.',
            ],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);

    expect(resultDraft.summary).toBe(summaryParagraph);
    expect(report.nulledPaths).not.toContain('summary');
    expect(report.nulledPaths).toEqual([]);
    expect(resultDraft.low_confidence_paths).toEqual([]);
    expect(report.decoupledRoles).toEqual([]);
  });

  it('21. (4) first role has a null title: its company alone anchors and grounded summary survives', () => {
    const summaryParagraph =
      'Built distributed storage engines and low-latency replication pipelines across regional clusters.';
    const roleBullet =
      'Built scalable distributed backend services with high uptime and resilient data stores.';
    const source = [
      'Jordan Avery',
      'Senior Backend Developer',
      'jordan.avery@example.org | +1-555-0148 | Stonehaven, EX',
      'Summary',
      summaryParagraph,
      'Experience',
      'Example Corp | 2021-03 - Present',
      roleBullet,
      'Northwind Labs | Senior Backend Developer | 2018-06 - 2021-02',
      'Migrated ledger service to partitioned storage reducing tail latency across clusters.',
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Jordan Avery',
          headline: 'Senior Backend Developer',
          email: 'jordan.avery@example.org',
          phone: '+1-555-0148',
          location: 'Stonehaven, EX',
          links: [],
        },
        summary: summaryParagraph,
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: null,
            location: 'Stonehaven, EX',
            start: '2021-03',
            end: null,
            current: true,
            bullets: [roleBullet],
          },
          {
            id: 'exp-2',
            company: 'Northwind Labs',
            title: 'Senior Backend Developer',
            location: 'Stonehaven, EX',
            start: '2018-06',
            end: '2021-02',
            current: false,
            bullets: [
              'Migrated ledger service to partitioned storage reducing tail latency across clusters.',
            ],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);

    expect(resultDraft.summary).toBe(summaryParagraph);
    expect(report.nulledPaths).not.toContain('summary');
    expect(resultDraft.experience[0].company).toBe('Example Corp');
    expect(resultDraft.experience[0].title).toBeNull();
    expect(resultDraft.experience[0].bullets).toEqual([roleBullet]);
    expect(report.nulledPaths).toEqual([]);
    expect(resultDraft.low_confidence_paths).toEqual([]);
    expect(report.decoupledRoles).toEqual([]);
  });

  it('22. (1) two roles, first current (Present) and second with its own dates 3 lines after company/title: second role is not decoupled', () => {
    const role0Bullet1 =
      'Designed partitioned Kafka ingestion pipeline processing events with bounded consumer lag.';
    const role0Bullet2 =
      'Cut ClickHouse query tail latency by restructuring primary keys and materialized rollups.';
    const role1Bullet =
      'Built gRPC rate-limiting service enforcing per-tenant token buckets across edge clusters.';
    const source = [
      'Rowan Fictional',
      'Staff Backend Engineer',
      'rowan.fictional@example.org',
      'EXPERIENCE',
      'Example Corp | Example City',
      'Staff Backend Engineer',
      '2022-02 - Present',
      '- Designed partitioned Kafka ingestion pipeline processing events',
      'with bounded consumer lag.',
      '- Cut ClickHouse query tail latency by restructuring primary keys',
      'and materialized rollups.',
      'Fictional Labs',
      'Backend Engineer',
      'Example City',
      '2019-06 - 2022-01',
      `- ${role1Bullet}`,
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Rowan Fictional',
          headline: 'Staff Backend Engineer',
          email: 'rowan.fictional@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Staff Backend Engineer',
            location: 'Example City',
            start: '2022-02',
            end: null,
            current: true,
            bullets: [role0Bullet1, role0Bullet2],
          },
          {
            id: 'exp-2',
            company: 'Fictional Labs',
            title: 'Backend Engineer',
            location: 'Example City',
            start: '2019-06',
            end: '2022-01',
            current: false,
            bullets: [role1Bullet],
          },
        ],
      },
      { minimal: true }
    );

    const { report } = guardProvenance(draft, source);

    expect(report.nulledPaths).toEqual([]);
    expect(report.decoupledRoles).toEqual([]);
  });

  it('23. (2) two roles with two sidebar lines between second role title and its dates (company-to-date distance equals SPATIAL_WINDOW_LINES): second role is not decoupled', () => {
    expect(SPATIAL_WINDOW_LINES).toBe(4);
    const role0Bullet1 =
      'Automated canary rollback controller reducing recovery time across production microservices.';
    const role0Bullet2 =
      'Migrated ingress mesh to Envoy with zero-downtime certificate rotation.';
    const role1Bullet =
      'Built Prometheus federation pipeline aggregating active time series across clusters.';
    const source = [
      'Kendall Fictional',
      'Senior Site Reliability Engineer',
      'kendall.fictional@example.org',
      'EXPERIENCE',
      'Example Corp | Example City',
      'Senior Site Reliability Engineer',
      '2021-09 - Present',
      '- Automated canary rollback controller reducing recovery time',
      'across production microservices.',
      '- Migrated ingress mesh to Envoy with zero-downtime',
      'certificate rotation.',
      'Fictional Systems | Example City',
      'Site Reliability Engineer',
      'LANGUAGES',
      'English (Native), Mandarin (Conversational)',
      '2018-07 - 2021-08',
      `- ${role1Bullet}`,
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Kendall Fictional',
          headline: 'Senior Site Reliability Engineer',
          email: 'kendall.fictional@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Senior Site Reliability Engineer',
            location: 'Example City',
            start: '2021-09',
            end: null,
            current: true,
            bullets: [role0Bullet1, role0Bullet2],
          },
          {
            id: 'exp-2',
            company: 'Fictional Systems',
            title: 'Site Reliability Engineer',
            location: 'Example City',
            start: '2018-07',
            end: '2021-08',
            current: false,
            bullets: [role1Bullet],
          },
        ],
      },
      { minimal: true }
    );

    const { report } = guardProvenance(draft, source);

    expect(report.nulledPaths).toEqual([]);
    expect(report.decoupledRoles).toEqual([]);
  });

  it('24. (3) control: two roles with one extra sidebar line so company-to-date distance is SPATIAL_WINDOW_LINES + 1: second role is decoupled', () => {
    expect(SPATIAL_WINDOW_LINES).toBe(4);
    const role0Bullet1 =
      'Automated canary rollback controller reducing recovery time across production microservices.';
    const role0Bullet2 =
      'Migrated ingress mesh to Envoy with zero-downtime certificate rotation.';
    const role1Bullet =
      'Built Prometheus federation pipeline aggregating active time series across clusters.';
    const source = [
      'Kendall Fictional',
      'Senior Site Reliability Engineer',
      'kendall.fictional@example.org',
      'EXPERIENCE',
      'Example Corp | Example City',
      'Senior Site Reliability Engineer',
      '2021-09 - Present',
      '- Automated canary rollback controller reducing recovery time',
      'across production microservices.',
      '- Migrated ingress mesh to Envoy with zero-downtime',
      'certificate rotation.',
      'Fictional Systems | Example City',
      'Site Reliability Engineer',
      'LANGUAGES',
      'English (Native)',
      'Mandarin (Conversational)',
      '2018-07 - 2021-08',
      `- ${role1Bullet}`,
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Kendall Fictional',
          headline: 'Senior Site Reliability Engineer',
          email: 'kendall.fictional@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Senior Site Reliability Engineer',
            location: 'Example City',
            start: '2021-09',
            end: null,
            current: true,
            bullets: [role0Bullet1, role0Bullet2],
          },
          {
            id: 'exp-2',
            company: 'Fictional Systems',
            title: 'Site Reliability Engineer',
            location: 'Example City',
            start: '2018-07',
            end: '2021-08',
            current: false,
            bullets: [role1Bullet],
          },
        ],
      },
      { minimal: true }
    );

    const { report } = guardProvenance(draft, source);

    expect(report.nulledPaths).toEqual([]);
    expect(report.decoupledRoles).toEqual(['experience[1]']);
  });

  it('25. (4) three roles, current first, where middle role date line is far from its company: middle role is decoupled and does not latch onto either neighbour date', () => {
    const role0Bullet =
      'Automated canary rollback controller reducing recovery time across production microservices.';
    const role1Bullet =
      'Built Prometheus federation pipeline aggregating active time series across clusters.';
    const role2Bullet =
      'Maintained internal build tooling and deterministic release verification pipelines.';
    const source = [
      'Kendall Fictional',
      'Senior Site Reliability Engineer',
      'kendall.fictional@example.org',
      'EXPERIENCE',
      'Example Corp | Senior Site Reliability Engineer',
      '2021-09 - Present',
      `- ${role0Bullet}`,
      'Fictional Systems',
      'Site Reliability Engineer',
      'SIDEBAR SKILLS',
      'Kubernetes, Terraform, Envoy',
      'Prometheus, OpenTelemetry, Grafana',
      'Linux, Go, Python',
      '2018-07 - 2021-08',
      `- ${role1Bullet}`,
      'Sample Works | Junior Systems Engineer',
      '2016-06 - 2018-06',
      `- ${role2Bullet}`,
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Kendall Fictional',
          headline: 'Senior Site Reliability Engineer',
          email: 'kendall.fictional@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Senior Site Reliability Engineer',
            start: '2021-09',
            end: null,
            current: true,
            bullets: [role0Bullet],
          },
          {
            id: 'exp-2',
            company: 'Fictional Systems',
            title: 'Site Reliability Engineer',
            start: '2018-07',
            end: '2021-08',
            current: false,
            bullets: [role1Bullet],
          },
          {
            id: 'exp-3',
            company: 'Sample Works',
            title: 'Junior Systems Engineer',
            start: '2016-06',
            end: '2018-06',
            current: false,
            bullets: [role2Bullet],
          },
        ],
      },
      { minimal: true }
    );

    const { report } = guardProvenance(draft, source);

    expect(report.nulledPaths).toEqual([]);
    expect(report.decoupledRoles).toEqual(['experience[1]']);
  });

  it('26. (5) role whose own start date is absent from source with neighbour Present line nearby: date is nulled and flagged, and role is not rescued by neighbour line', () => {
    const role0Bullet =
      'Automated canary rollback controller reducing recovery time across production microservices.';
    const role1Bullet =
      'Built Prometheus federation pipeline aggregating active time series across clusters.';
    const source = [
      'Kendall Fictional',
      'Senior Site Reliability Engineer',
      'kendall.fictional@example.org',
      'EXPERIENCE',
      'Example Corp | Senior Site Reliability Engineer',
      '2021-09 - Present',
      '- Automated canary rollback controller reducing recovery time',
      'across production microservices.',
      'LANGUAGES',
      'English (Native), Mandarin (Conversational)',
      'Fictional Systems',
      'Site Reliability Engineer',
      `- ${role1Bullet}`,
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Kendall Fictional',
          headline: 'Senior Site Reliability Engineer',
          email: 'kendall.fictional@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Senior Site Reliability Engineer',
            start: '2021-09',
            end: null,
            current: true,
            bullets: [role0Bullet],
          },
          {
            id: 'exp-2',
            company: 'Fictional Systems',
            title: 'Site Reliability Engineer',
            start: '2018-07',
            end: null,
            current: false,
            bullets: [role1Bullet],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);

    expect(resultDraft.experience[1].start).toBeNull();
    expect(report.nulledPaths).toEqual(['experience[1].start']);
    expect(resultDraft.low_confidence_paths).toEqual(['experience[1].start']);
    expect(report.decoupledRoles).toEqual([]);
  });

  it('27. (6) first role has bullet "Presented quarterly results to the leadership team." and second role has its own date line 3 lines after company and title: second role start and end are kept and decoupledRoles is []', () => {
    const role0Bullet = 'Presented quarterly results to the leadership team.';
    const role1Bullet =
      'Built internal service mesh routing tools for distributed microservices across staging clusters.';

    const source = [
      'Avery Fictional',
      'avery.fictional@example.org',
      'Experience',
      'Example Corp',
      'Staff Backend Engineer',
      '2022-02 - Present',
      `- ${role0Bullet}`,
      'TypeScript, Go, PostgreSQL',
      'Kubernetes, Terraform, gRPC',
      'English (Native), Spanish (Fluent)',
      'Distributed Systems Architecture',
      'Fictional Labs',
      'Backend Engineer',
      'Example City',
      '2019-06 - 2022-01',
      `- ${role1Bullet}`,
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Avery Fictional',
          headline: 'Staff Backend Engineer',
          email: 'avery.fictional@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Example Corp',
            title: 'Staff Backend Engineer',
            start: '2022-02',
            end: null,
            current: true,
            bullets: [role0Bullet],
          },
          {
            id: 'exp-2',
            company: 'Fictional Labs',
            title: 'Backend Engineer',
            start: '2019-06',
            end: '2022-01',
            current: false,
            bullets: [role1Bullet],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);

    expect(resultDraft.experience[1].start).toBe('2019-06');
    expect(resultDraft.experience[1].end).toBe('2022-01');
    expect(report.nulledPaths).toEqual([]);
    expect(report.decoupledRoles).toEqual([]);
  });

  it('28. (7) role with no date line at all but nearby bullet "Presented at a regional conference": start and end are nulled and flagged, and bullet line is never taken as a date line', () => {
    const roleBullet1 =
      'Built internal service mesh routing tools for distributed microservices across staging clusters.';
    const roleBullet2 = 'Presented at a regional conference';

    const source = [
      'Avery Fictional',
      'avery.fictional@example.org',
      'Experience',
      'Fictional Labs',
      'Backend Engineer',
      'Example City',
      'Platform Engineering Division',
      `- ${roleBullet1}`,
      `- ${roleBullet2}`,
    ].join('\n');

    const draft = createFictionalDraft(
      {
        basics: {
          fullName: 'Avery Fictional',
          headline: 'Backend Engineer',
          email: 'avery.fictional@example.org',
          links: [],
        },
        experience: [
          {
            id: 'exp-1',
            company: 'Fictional Labs',
            title: 'Backend Engineer',
            start: '2019-06',
            end: '2022-01',
            current: false,
            bullets: [roleBullet1, roleBullet2],
          },
        ],
      },
      { minimal: true }
    );

    const { draft: resultDraft, report } = guardProvenance(draft, source);

    expect(resultDraft.experience[0].start).toBeNull();
    expect(resultDraft.experience[0].end).toBeNull();
    expect(report.nulledPaths).toEqual([
      'experience[0].start',
      'experience[0].end',
    ]);
    expect(resultDraft.low_confidence_paths).toEqual([
      'experience[0].start',
      'experience[0].end',
    ]);
    expect(report.decoupledRoles).toEqual([]);
  });
});
