import { afterEach, describe, expect, it, vi } from 'vitest';

const callOrder: string[] = [];
let lastGuardedDraftRef: unknown;
let lastFlaggedInputRef: unknown;

vi.mock('@/lib/ai/guards/provenance', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/ai/guards/provenance')>();
  return {
    ...actual,
    guardProvenance: vi.fn((...args: Parameters<typeof actual.guardProvenance>) => {
      callOrder.push('guardProvenance');
      const res = actual.guardProvenance(...args);
      lastGuardedDraftRef = res.draft;
      return res;
    }),
  };
});

vi.mock('@/lib/ai/schemas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/schemas')>();
  return {
    ...actual,
    flagOverLimitContent: vi.fn(
      (...args: Parameters<typeof actual.flagOverLimitContent>) => {
        callOrder.push('flagOverLimitContent');
        lastFlaggedInputRef = args[0];
        return actual.flagOverLimitContent(...args);
      },
    ),
  };
});

import { guardProvenance } from '@/lib/ai/guards/provenance';
import {
  ensureUrlScheme,
  hasEmailShapedTokenOnLine,
  hasPhoneShapedTokenOnLine,
} from '@/lib/ai/helpers/grammars';
import {
  ModelDraftSchema,
  ParseError,
  parseResume,
  type ModelDraft,
} from '@/lib/ai/parsers/resume-parser';
import {
  RESUME_IMPORT_SYSTEM_PROMPT,
  buildResumePrompt,
} from '@/lib/ai/prompts/resume-import';
import {
  ProviderError,
  type GenerateParams,
  type GenerateResult,
  type LlmProvider,
  type ProviderErrorKind,
} from '@/lib/ai/provider';
import { FakeProvider } from '@/lib/ai/providers/fake';
import {
  ResumeImportDraftSchema,
  flagOverLimitContent,
} from '@/lib/ai/schemas';

class SpyProvider implements LlmProvider {
  readonly name = 'fake' as const;
  readonly calls: Array<GenerateParams<unknown>> = [];
  private readonly rawResponse: unknown;
  private readonly errorToThrow?: ProviderError;
  private readonly model: string;
  private readonly latencyMs: number;

  constructor(options: {
    response?: unknown;
    error?: ProviderError;
    model?: string;
    latencyMs?: number;
  }) {
    this.rawResponse = options.response;
    this.errorToThrow = options.error;
    this.model = options.model ?? 'spy-model-v1';
    this.latencyMs = options.latencyMs ?? 12;
  }

  async generateStructured<T>(
    params: GenerateParams<T>,
  ): Promise<GenerateResult<T>> {
    this.calls.push(params as GenerateParams<unknown>);
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }
    const parsed = params.schema.parse(this.rawResponse);
    return {
      data: parsed,
      provider: 'fake',
      model: this.model,
      latencyMs: this.latencyMs,
    };
  }
}

const SAMPLE_RESUME_TEXT = [
  'Jordan Avery',
  'Staff Systems Architect',
  'jordan.avery@example.org | +1 (555) 014-8821 | Stonehaven, EX',
  'Links: example.org/me | https://example.org/portfolio',
  '',
  'Summary',
  'Built distributed storage engines and low-latency replication pipelines across regional clusters.',
  '',
  'Experience',
  'Example Corp | Staff Systems Architect | 2021-03 - Present',
  '- Designed consensus state machine handling 45000 writes per second across three zones.',
  'Northwind Labs | Senior Backend Developer | 2018-06 - 2021-02',
  '- Migrated ledger service to partitioned storage reducing tail latency by 35 percent.',
  '',
  'Projects',
  'KvStream (example.org/kvstream)',
  '- Implemented Raft log compaction engine in TypeScript.',
  'NullUrlProj',
  '- Built offline snapshot verifier for local test clusters.',
  '',
  'Education',
  'Westbrook Institute of Technology | B.S. Computer Engineering | 2014 - 2018',
  'Lakeside Polytechnic | Certificate in Distributed Computing | 2019 - 2020',
  '',
  'Skills',
  'Languages: TypeScript, Rust, SQL',
].join('\n');

function createBaseModelDraft(overrides: Partial<ModelDraft> = {}): ModelDraft {
  return {
    basics: {
      fullName: 'Jordan Avery',
      headline: 'Staff Systems Architect',
      email: 'jordan.avery@example.org',
      phone: '+1 (555) 014-8821',
      location: 'Stonehaven, EX',
      links: [
        { label: 'Site', url: 'example.org/me' },
        { label: 'Portfolio', url: 'https://example.org/portfolio' },
      ],
    },
    summary:
      'Built distributed storage engines and low-latency replication pipelines across regional clusters.',
    experience: [
      {
        company: 'Example Corp',
        title: 'Staff Systems Architect',
        location: 'Stonehaven, EX',
        start: '2021-03',
        end: null,
        current: true,
        bullets: [
          'Designed consensus state machine handling 45000 writes per second across three zones.',
        ],
      },
      {
        company: 'Northwind Labs',
        title: 'Senior Backend Developer',
        location: 'Stonehaven, EX',
        start: '2018-06',
        end: '2021-02',
        current: false,
        bullets: [
          'Migrated ledger service to partitioned storage reducing tail latency by 35 percent.',
        ],
      },
    ],
    projects: [
      {
        name: 'KvStream',
        url: 'example.org/kvstream',
        bullets: ['Implemented Raft log compaction engine in TypeScript.'],
      },
      {
        name: 'NullUrlProj',
        url: null,
        bullets: ['Built offline snapshot verifier for local test clusters.'],
      },
    ],
    education: [
      {
        school: 'Westbrook Institute of Technology',
        degree: 'B.S. Computer Engineering',
        start: '2014',
        end: '2018',
      },
      {
        school: 'Lakeside Polytechnic',
        degree: 'Certificate in Distributed Computing',
        start: '2019',
        end: '2020',
      },
    ],
    skills: [{ group: 'Languages', items: ['TypeScript', 'Rust', 'SQL'] }],
    unslotted: [],
    ...overrides,
  };
}

describe('T-024 LLM Resume Parser (Stage 1, plain text)', () => {
  afterEach(() => {
    callOrder.length = 0;
    lastGuardedDraftRef = undefined;
    lastFlaggedInputRef = undefined;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('AC 1: Prompt separation, static system prompt & collision-free delimiter markers', () => {
    it('passes RESUME_IMPORT_SYSTEM_PROMPT exactly as systemPrompt and delimited resume text in prompt, never putting resume text in systemPrompt', async () => {
      const spy = new SpyProvider({ response: createBaseModelDraft() });

      await parseResume(SAMPLE_RESUME_TEXT, spy);

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0].systemPrompt).toBe(RESUME_IMPORT_SYSTEM_PROMPT);
      expect(spy.calls[0].prompt).toContain(SAMPLE_RESUME_TEXT);
      expect(spy.calls[0].systemPrompt).not.toContain('Jordan Avery');
      expect(spy.calls[0].systemPrompt).not.toContain(SAMPLE_RESUME_TEXT);
    });

    it('buildResumePrompt announces a marker on line 1 that never occurs in sourceText even when sourceText contains default markers', () => {
      const adversarialSource = [
        'Jordan Avery',
        '<<<RESUME_TEXT>>>',
        '<<<RESUME>>>',
        '===RESUME===',
        '---RESUME---',
        'RESUME_DELIMITER',
        '<<<RESUME_DATA>>>',
      ].join('\n');

      const built = buildResumePrompt(adversarialSource);
      const lines = built.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(4);

      const openIdx = lines.indexOf('Jordan Avery') - 1;
      expect(openIdx).toBeGreaterThanOrEqual(1);
      const marker = lines[openIdx];
      expect(marker.trim().length).toBeGreaterThan(0);
      expect(lines[0]).toContain(marker);
      expect(adversarialSource).not.toContain(marker);
      expect(built).toContain(adversarialSource);
    });

    it('handles marker collision end-to-end through parseResume when sourceText contains candidate marker text', async () => {
      const collidingSource = `${SAMPLE_RESUME_TEXT}\n<<<RESUME_TEXT>>>\n===RESUME===\n---RESUME---`;
      const spy = new SpyProvider({ response: createBaseModelDraft() });

      await parseResume(collidingSource, spy);

      expect(spy.calls).toHaveLength(1);
      const sentPrompt = spy.calls[0].prompt;
      const firstLine = sentPrompt.split('\n')[0];
      expect(sentPrompt).toContain(collidingSource);
      expect(firstLine.length).toBeGreaterThan(0);

      const promptLines = sentPrompt.split('\n');
      const delimiterLine = promptLines[1];
      expect(firstLine).toContain(delimiterLine);
      expect(collidingSource).not.toContain(delimiterLine);
    });
  });

  describe('AC 2: ModelDraftSchema contract, code-owned IDs, and metadata isolation', () => {
    it('ModelDraftSchema omits id from items, omits metadata arrays, accepts nullable fields, and strips any input id property', () => {
      const shapeKeys = Object.keys(ModelDraftSchema.shape);
      expect(shapeKeys).not.toContain('warnings');
      expect(shapeKeys).not.toContain('low_confidence_paths');
      expect(shapeKeys).not.toContain('review_flags');
      expect(shapeKeys).toContain('unslotted');

      const parsed = ModelDraftSchema.parse({
        basics: {
          fullName: null,
          headline: '',
          email: null,
          phone: null,
          location: '',
          links: [],
        },
        summary: '',
        experience: [
          {
            id: 'model-injected-exp-id',
            company: null,
            title: null,
            start: null,
            end: null,
            current: false,
            bullets: [],
          },
        ],
        projects: [
          {
            id: 'model-injected-proj-id',
            name: null,
            url: null,
            bullets: [],
          },
        ],
        education: [
          {
            id: 'model-injected-edu-id',
            school: null,
            degree: null,
            start: null,
            end: null,
          },
        ],
        skills: [],
        unslotted: [{ label: 'Publications', text: 'Paper on Raft' }],
      });

      expect('id' in parsed.experience[0]).toBe(false);
      expect('id' in parsed.projects[0]).toBe(false);
      expect('id' in parsed.education[0]).toBe(false);
    });

    it('assigns unique code-owned ids matching section patterns and produces identical ids across two runs', async () => {
      const provider1 = new FakeProvider({ response: createBaseModelDraft() });
      const provider2 = new FakeProvider({ response: createBaseModelDraft() });

      const run1 = await parseResume(SAMPLE_RESUME_TEXT, provider1);
      const run2 = await parseResume(SAMPLE_RESUME_TEXT, provider2);

      const expIds = run1.draft.experience.map((e) => e.id);
      const projIds = run1.draft.projects.map((p) => p.id);
      const eduIds = run1.draft.education.map((ed) => ed.id);

      expect(expIds).toEqual(['exp-1', 'exp-2']);
      expect(projIds).toEqual(['proj-1', 'proj-2']);
      expect(eduIds).toEqual(['edu-1', 'edu-2']);

      expect(new Set(expIds).size).toBe(expIds.length);
      expect(new Set(projIds).size).toBe(projIds.length);
      expect(new Set(eduIds).size).toBe(eduIds.length);

      expect(run2.draft.experience.map((e) => e.id)).toEqual(expIds);
      expect(run2.draft.projects.map((p) => p.id)).toEqual(projIds);
      expect(run2.draft.education.map((ed) => ed.id)).toEqual(eduIds);
    });

    it('ignores model-supplied warnings, low_confidence_paths, and review_flags so result warnings equal only the code-built list', async () => {
      const pollutedResponse = {
        ...createBaseModelDraft(),
        warnings: ['MODEL_INJECTED_WARNING'],
        low_confidence_paths: ['basics.fullName'],
        review_flags: [
          {
            path: 'summary',
            reason: 'EXCEEDS_LENGTH_LIMIT',
            message: 'MODEL_INJECTED_FLAG',
          },
        ],
      };

      const spy = new SpyProvider({ response: pollutedResponse });
      const result = await parseResume(SAMPLE_RESUME_TEXT, spy);

      expect(result.draft.warnings).toEqual([]);
      expect(result.draft.low_confidence_paths).toEqual([]);
      expect(result.draft.review_flags).toEqual([]);
    });
  });

  describe('AC 3: Fixed pipeline order & over-limit preservation', () => {
    it('runs guardProvenance strictly before flagOverLimitContent and passes guardProvenance draft output into flagOverLimitContent', async () => {
      const provider = new FakeProvider({ response: createBaseModelDraft() });

      await parseResume(SAMPLE_RESUME_TEXT, provider);

      expect(guardProvenance).toHaveBeenCalledTimes(1);
      expect(flagOverLimitContent).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['guardProvenance', 'flagOverLimitContent']);
      expect(lastGuardedDraftRef).toBeDefined();
      expect(lastFlaggedInputRef).toBe(lastGuardedDraftRef);
    });

    it('preserves over-limit content (9 grounded bullets and 601-char grounded summary) and adds exact EXCEEDS_LENGTH_LIMIT flags in order after guard', async () => {
      const longSentence =
        'Engineered deterministic storage engines across multi-region fault domains with automated recovery and verification. ';
      const longSummary = longSentence.repeat(6).trim(); // > 600 chars
      const nineBullets = Array.from(
        { length: 9 },
        (_, idx) =>
          `Implemented storage subsystem component number ${idx + 1} reducing replication lag across clusters.`,
      );

      const overLimitSource = [
        'Jordan Avery',
        'jordan.avery@example.org | +1 (555) 014-8821',
        'Summary',
        longSummary,
        'Experience',
        'Example Corp | Staff Systems Architect | 2021-03 - Present',
        ...nineBullets.map((b) => `- ${b}`),
      ].join('\n');

      const draftInput = createBaseModelDraft({
        summary: longSummary,
        basics: {
          ...createBaseModelDraft().basics,
          links: [],
        },
        experience: [
          {
            company: 'Example Corp',
            title: 'Staff Systems Architect',
            location: 'Stonehaven, EX',
            start: '2021-03',
            end: null,
            current: true,
            bullets: nineBullets,
          },
        ],
        projects: [],
        education: [],
        skills: [],
      });

      const provider = new FakeProvider({ response: draftInput });
      const result = await parseResume(overLimitSource, provider);

      expect(result.draft.summary.length).toBeGreaterThan(600);
      expect(result.draft.experience[0].bullets).toHaveLength(9);

      expect(result.draft.review_flags).toEqual([
        { path: 'summary', reason: 'EXCEEDS_LENGTH_LIMIT' },
        { path: 'experience[0].bullets', reason: 'EXCEEDS_LENGTH_LIMIT' },
      ]);
    });
  });

  describe('AC 4 & AC 5: Error propagation and empty input guard', () => {
    it.each([
      { kind: 'api' as ProviderErrorKind, status: 503 },
      { kind: 'timeout' as ProviderErrorKind, status: undefined },
      { kind: 'empty_response' as ProviderErrorKind, status: undefined },
      { kind: 'schema_validation' as ProviderErrorKind, status: undefined },
    ])(
      'propagates ProviderError with kind $kind unchanged, calls provider once, and performs no fallback',
      async ({ kind, status }) => {
        const providerError = new ProviderError(`Simulated ${kind} failure`, {
          kind,
          provider: 'fake',
          status,
        });
        const spy = new SpyProvider({ error: providerError });

        let caught: unknown;
        try {
          await parseResume(SAMPLE_RESUME_TEXT, spy);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(ProviderError);
        const pErr = caught as ProviderError;
        expect(pErr.kind).toBe(kind);
        expect(pErr.provider).toBe('fake');
        expect(pErr.status).toBe(status);
        expect(spy.calls).toHaveLength(1);
      },
    );

    it('throws ParseError with code empty_input on blank or whitespace-only sourceText with zero provider calls', async () => {
      const spy = new SpyProvider({ response: createBaseModelDraft() });

      for (const emptyInput of ['', '   ', '\n\t  \r\n']) {
        let caught: unknown;
        try {
          await parseResume(emptyInput, spy);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(ParseError);
        expect((caught as ParseError).code).toBe('empty_input');
      }

      expect(spy.calls).toHaveLength(0);
    });
  });

  describe('AC 6 & AC 7: Provenance guard, unslotted content flags, and empty model draft warning', () => {
    it('nulls an ungrounded company in model output and records experience[0].company in provenance.nulledPaths', async () => {
      const draftWithHallucinatedCompany = createBaseModelDraft({
        experience: [
          {
            company: 'Hallucinated Quantum Corp',
            title: 'Staff Systems Architect',
            location: 'Stonehaven, EX',
            start: '2021-03',
            end: null,
            current: true,
            bullets: [
              'Designed consensus state machine handling 45000 writes per second across three zones.',
            ],
          },
        ],
      });

      const provider = new FakeProvider({
        response: draftWithHallucinatedCompany,
      });
      const result = await parseResume(SAMPLE_RESUME_TEXT, provider);

      expect(result.draft.experience[0].company).toBeNull();
      expect(result.provenance.nulledPaths).toContain('experience[0].company');
      expect(result.draft.low_confidence_paths).toContain(
        'experience[0].company',
      );
    });

    it('converts a grounded unslotted item into an UNSLOTTED_CONTENT review flag with path unslotted[0] and excerpt', async () => {
      const sourceWithPatents = `${SAMPLE_RESUME_TEXT}\n\nPatents\nPatent US-2024-998811: Deterministic Quorum Lease Protocol`;
      const draftWithUnslotted = createBaseModelDraft({
        unslotted: [
          {
            label: 'Patents',
            text: 'Patent US-2024-998811: Deterministic Quorum Lease Protocol',
          },
        ],
      });

      const provider = new FakeProvider({ response: draftWithUnslotted });
      const result = await parseResume(sourceWithPatents, provider);

      expect(result.draft.review_flags).toContainEqual({
        path: 'unslotted[0]',
        reason: 'UNSLOTTED_CONTENT',
        excerpt: 'Patent US-2024-998811: Deterministic Quorum Lease Protocol',
      });
    });

    it('drops an ungrounded unslotted item, adds the exact warning "Dropped ungrounded unslotted content at unslotted[0].", and leaks neither label nor text into warnings', async () => {
      const draftWithFakeUnslotted = createBaseModelDraft({
        unslotted: [
          {
            label: 'SecretInjectedLabel99',
            text: 'Completely fabricated award not in source text 888',
          },
        ],
      });

      const provider = new FakeProvider({ response: draftWithFakeUnslotted });
      const result = await parseResume(SAMPLE_RESUME_TEXT, provider);

      expect(
        result.draft.review_flags.filter(
          (f) => f.reason === 'UNSLOTTED_CONTENT',
        ),
      ).toEqual([]);
      expect(result.draft.warnings).toContain(
        'Dropped ungrounded unslotted content at unslotted[0].',
      );
      const joinedWarnings = result.draft.warnings.join(' ');
      expect(joinedWarnings).not.toContain('SecretInjectedLabel99');
      expect(joinedWarnings).not.toContain(
        'Completely fabricated award not in source text 888',
      );
    });

    it('preserves original unslotted[i] index paths when mixing ungrounded and grounded unslotted items', async () => {
      const sourceWithVolunteer = `${SAMPLE_RESUME_TEXT}\n\nVolunteer\nMentored regional robotics club students in Stonehaven.`;
      const draftWithTwoUnslotted = createBaseModelDraft({
        unslotted: [
          {
            label: 'InventedSection',
            text: 'Fabricated keynote speaker entry 12345',
          },
          {
            label: 'Volunteer',
            text: 'Mentored regional robotics club students in Stonehaven.',
          },
        ],
      });

      const provider = new FakeProvider({ response: draftWithTwoUnslotted });
      const result = await parseResume(sourceWithVolunteer, provider);

      expect(result.draft.warnings).toContain(
        'Dropped ungrounded unslotted content at unslotted[0].',
      );
      expect(result.draft.review_flags).toContainEqual({
        path: 'unslotted[1]',
        reason: 'UNSLOTTED_CONTENT',
        excerpt: 'Mentored regional robotics club students in Stonehaven.',
      });
    });

    it('adds warning "Model returned no extractable content." when model returns an all-empty draft', async () => {
      const allEmptyDraft: ModelDraft = {
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
        unslotted: [],
      };

      const provider = new FakeProvider({ response: allEmptyDraft });
      const result = await parseResume(
        'Jordan Avery\nSoftware Engineer',
        provider,
      );

      expect(result.draft.warnings).toContain(
        'Model returned no extractable content.',
      );
    });
  });

  describe('AC 8: Post-guard URL scheme normalization, unsupported scheme rejection, and ensureUrlScheme unit cases', () => {
    it('grounded scheme-less link example.org/me survives guardProvenance and becomes https://example.org/me, schemed urls stay unchanged, and null urls stay null', async () => {
      const provider = new FakeProvider({ response: createBaseModelDraft() });
      const result = await parseResume(SAMPLE_RESUME_TEXT, provider);

      expect(result.draft.basics.links).toEqual([
        { label: 'Site', url: 'https://example.org/me' },
        { label: 'Portfolio', url: 'https://example.org/portfolio' },
      ]);
      expect(result.draft.projects[0].url).toBe('https://example.org/kvstream');
      expect(result.draft.projects[1].url).toBeNull();
    });

    it('nulls link and project urls with schemes other than http, https, or mailto (javascript:, data:) and adds exact path-only warning', async () => {
      const sourceWithUnsafeLinks = `${SAMPLE_RESUME_TEXT}\nmailto:jordan.avery@example.org\njavascript:alert(1)\ndata:text/html,payload`;
      const draftWithUnsafeLinks = createBaseModelDraft({
        basics: {
          ...createBaseModelDraft().basics,
          links: [
            { label: 'BadLink', url: 'javascript:alert(1)' },
            { label: 'Mail', url: 'mailto:jordan.avery@example.org' },
            { label: 'Portfolio', url: 'https://example.org/portfolio' },
          ],
        },
        projects: [
          {
            name: 'KvStream',
            url: 'data:text/html,payload',
            bullets: ['Implemented Raft log compaction engine in TypeScript.'],
          },
        ],
      });

      const provider = new FakeProvider({ response: draftWithUnsafeLinks });
      const result = await parseResume(sourceWithUnsafeLinks, provider);

      expect(result.draft.basics.links[0].url).toBeNull();
      expect(result.draft.basics.links[1].url).toBe(
        'mailto:jordan.avery@example.org',
      );
      expect(result.draft.basics.links[2].url).toBe(
        'https://example.org/portfolio',
      );
      expect(result.draft.projects[0].url).toBeNull();

      expect(result.draft.warnings).toContain(
        'Dropped unsupported link scheme at basics.links[0].url.',
      );
      expect(result.draft.warnings).toContain(
        'Dropped unsupported link scheme at projects[0].url.',
      );

      const joinedWarnings = result.draft.warnings.join(' ');
      expect(joinedWarnings).not.toContain('javascript:alert(1)');
      expect(joinedWarnings).not.toContain('data:text/html,payload');
      expect(joinedWarnings).not.toContain('mailto:jordan.avery@example.org');
      expect(joinedWarnings).not.toContain('https://example.org/portfolio');
    });

    it('ensureUrlScheme handles www.example.org/a, example.org, https://example.org, http://example.org, mailto:a@example.org, empty string, and leaves javascript: untouched', () => {
      // Decision: ensureUrlScheme only prepends https:// to scheme-less strings; allowed-scheme filtering (rejecting javascript:/data:) is a separate step in parseResume.
      expect(ensureUrlScheme('www.example.org/a')).toBe(
        'https://www.example.org/a',
      );
      expect(ensureUrlScheme('example.org')).toBe('https://example.org');
      expect(ensureUrlScheme('https://example.org')).toBe(
        'https://example.org',
      );
      expect(ensureUrlScheme('http://example.org')).toBe('http://example.org');
      expect(ensureUrlScheme('mailto:a@example.org')).toBe(
        'mailto:a@example.org',
      );
      expect(ensureUrlScheme('javascript:alert(1)')).toBe(
        'javascript:alert(1)',
      );
      expect(ensureUrlScheme('')).toBe('');
    });
  });

  describe('AC 9: Line-bounded email/phone warnings without auto-fill', () => {
    it('adds exact email warning without token leak and does not auto-fill when basics.email is null, and adds no warning when grounded', async () => {
      const missingEmailDraft = createBaseModelDraft({
        basics: {
          ...createBaseModelDraft().basics,
          email: null,
        },
      });
      const provider1 = new FakeProvider({ response: missingEmailDraft });
      const resMissing = await parseResume(SAMPLE_RESUME_TEXT, provider1);

      expect(resMissing.draft.basics.email).toBeNull();
      expect(resMissing.draft.warnings).toContain(
        'Email-shaped text found in the source but no email was extracted.',
      );
      expect(resMissing.draft.warnings.join(' ')).not.toContain(
        'jordan.avery@example.org',
      );

      const provider2 = new FakeProvider({ response: createBaseModelDraft() });
      const resGrounded = await parseResume(SAMPLE_RESUME_TEXT, provider2);
      expect(resGrounded.draft.basics.email).toBe('jordan.avery@example.org');
      expect(resGrounded.draft.warnings).not.toContain(
        'Email-shaped text found in the source but no email was extracted.',
      );
    });

    it('adds exact phone warning without token leak and does not auto-fill when basics.phone is null, and adds no warning when grounded', async () => {
      const missingPhoneDraft = createBaseModelDraft({
        basics: {
          ...createBaseModelDraft().basics,
          phone: null,
        },
      });
      const provider1 = new FakeProvider({ response: missingPhoneDraft });
      const resMissing = await parseResume(SAMPLE_RESUME_TEXT, provider1);

      expect(resMissing.draft.basics.phone).toBeNull();
      expect(resMissing.draft.warnings).toContain(
        'Phone-shaped text found in the source but no phone was extracted.',
      );
      expect(resMissing.draft.warnings.join(' ')).not.toContain(
        '+1 (555) 014-8821',
      );
      expect(resMissing.draft.warnings.join(' ')).not.toContain('014-8821');

      const provider2 = new FakeProvider({ response: createBaseModelDraft() });
      const resGrounded = await parseResume(SAMPLE_RESUME_TEXT, provider2);
      expect(resGrounded.draft.basics.phone).toBe('+1 (555) 014-8821');
      expect(resGrounded.draft.warnings).not.toContain(
        'Phone-shaped text found in the source but no phone was extracted.',
      );
    });

    it('hasEmailShapedTokenOnLine and hasPhoneShapedTokenOnLine return false when token is split across a line break and true when on one line amid text', () => {
      expect(
        hasEmailShapedTokenOnLine('Contact: jordan.avery@\nexample.org today'),
      ).toBe(false);
      expect(
        hasEmailShapedTokenOnLine(
          'Reach out to jordan.avery@example.org for details.',
        ),
      ).toBe(true);

      // Phone grammar threshold: requires 10 or more digits in a phone-shaped span on a single line (starting value, tuned on corpus).
      expect(
        hasPhoneShapedTokenOnLine('Phone: +1 (555)\n014-8821 office'),
      ).toBe(false);
      expect(hasPhoneShapedTokenOnLine('Short number: 555-014-882')).toBe(
        false,
      );
      expect(
        hasPhoneShapedTokenOnLine(
          'Call +1 (555) 014-8821 during business hours',
        ),
      ).toBe(true);
    });
  });

  describe('AC 10: Entity-swap structural invariance & non-Latin fictional fixture', () => {
    it('maintains entity-swap invariance across twin fictional resumes (reverse-mapped draftB equals draftA)', async () => {
      const swaps: Array<[string, string]> = [
        ['Jordan Avery', 'Morgan Vance'],
        ['Example Corp', 'Contoso Systems'],
        ['Northwind Labs', 'Fabrikam Cloud'],
        [
          'Westbrook Institute of Technology',
          'Crestview Technical University',
        ],
        ['Stonehaven, EX', 'Briarwood, EX'],
      ];

      const applyForward = (str: string): string =>
        swaps.reduce((acc, [from, to]) => acc.replaceAll(from, to), str);
      const applyReverse = (str: string): string =>
        swaps.reduce((acc, [from, to]) => acc.replaceAll(to, from), str);

      const sourceA = SAMPLE_RESUME_TEXT;
      const sourceB = applyForward(SAMPLE_RESUME_TEXT);

      const draftA = createBaseModelDraft();
      const draftB: ModelDraft = JSON.parse(
        applyForward(JSON.stringify(draftA)),
      );

      const resA = await parseResume(
        sourceA,
        new FakeProvider({ response: draftA }),
      );
      const resB = await parseResume(
        sourceB,
        new FakeProvider({ response: draftB }),
      );

      const reverseMappedDraftB = JSON.parse(
        applyReverse(JSON.stringify(resB.draft)),
      );
      expect(reverseMappedDraftB).toEqual(resA.draft);
      expect(resB.provenance.nulledPaths).toEqual(resA.provenance.nulledPaths);
    });

    it('preserves invented non-Latin and accented fictional entities (Ségolène Çelik-Öztürk, 北星システムズ) through parseResume', async () => {
      const nonLatinSource = [
        'Ségolène Çelik-Öztürk',
        'segolene@example.org | +1 (555) 018-4400 | Cloudhaven, EX',
        'Summary',
        'Designed distributed telemetry pipelines for 北星システムズ across regional clusters.',
        'Experience',
        '北星システムズ | Principal Platform Engineer | 2020-04 - Present',
        '- Built fault-tolerant ingestion routers handling 12000 events per second.',
        'Education',
        'École Polytechnique Fictive | M.S. Distributed Systems | 2016 - 2018',
        'Skills',
        'Core: Rust, Go, 分散システム',
      ].join('\n');

      const nonLatinModelDraft: ModelDraft = {
        basics: {
          fullName: 'Ségolène Çelik-Öztürk',
          headline: 'Principal Platform Engineer',
          email: 'segolene@example.org',
          phone: '+1 (555) 018-4400',
          location: 'Cloudhaven, EX',
          links: [],
        },
        summary:
          'Designed distributed telemetry pipelines for 北星システムズ across regional clusters.',
        experience: [
          {
            company: '北星システムズ',
            title: 'Principal Platform Engineer',
            location: 'Cloudhaven, EX',
            start: '2020-04',
            end: null,
            current: true,
            bullets: [
              'Built fault-tolerant ingestion routers handling 12000 events per second.',
            ],
          },
        ],
        projects: [],
        education: [
          {
            school: 'École Polytechnique Fictive',
            degree: 'M.S. Distributed Systems',
            start: '2016',
            end: '2018',
          },
        ],
        skills: [{ group: 'Core', items: ['Rust', 'Go', '分散システム'] }],
        unslotted: [],
      };

      const result = await parseResume(
        nonLatinSource,
        new FakeProvider({ response: nonLatinModelDraft }),
      );

      expect(result.draft.basics.fullName).toBe('Ségolène Çelik-Öztürk');
      expect(result.draft.experience[0].company).toBe('北星システムズ');
      expect(result.draft.education[0].school).toBe(
        'École Polytechnique Fictive',
      );
      expect(result.draft.skills[0].items).toContain('分散システム');
      expect(ResumeImportDraftSchema.safeParse(result.draft).success).toBe(true);
    });
  });

  describe('AC 11 & AC 12: Input immutability, zero logging, no network, and schema validity', () => {
    it('does not mutate the input sourceText string', async () => {
      const originalCopy = `${SAMPLE_RESUME_TEXT}`;
      const provider = new FakeProvider({ response: createBaseModelDraft() });

      await parseResume(originalCopy, provider);

      expect(originalCopy).toBe(SAMPLE_RESUME_TEXT);
    });

    it('never logs resume text to console on success or failure', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const sentinelResume = `${SAMPLE_RESUME_TEXT}\nCONFIDENTIAL_RESUME_SENTINEL_774411`;
      const okProvider = new FakeProvider({ response: createBaseModelDraft() });
      await parseResume(sentinelResume, okProvider);

      const failProvider = new FakeProvider({
        error: new ProviderError('Simulated failure', {
          kind: 'api',
          provider: 'fake',
          status: 500,
        }),
      });
      await expect(parseResume(sentinelResume, failProvider)).rejects.toThrow(
        ProviderError,
      );

      const allLogged = [
        ...logSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]
        .flat()
        .map((arg) =>
          typeof arg === 'string' ? arg : JSON.stringify(arg ?? ''),
        )
        .join(' ');

      expect(allLogged).not.toContain('CONFIDENTIAL_RESUME_SENTINEL_774411');
      expect(allLogged).not.toContain('Jordan Avery');
    });

    it('never calls globalThis.fetch during parseResume execution', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const provider = new FakeProvider({ response: createBaseModelDraft() });

      await parseResume(SAMPLE_RESUME_TEXT, provider);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns a draft that passes ResumeImportDraftSchema validation', async () => {
      const provider = new FakeProvider({ response: createBaseModelDraft() });
      const result = await parseResume(SAMPLE_RESUME_TEXT, provider);

      const parsed = ResumeImportDraftSchema.safeParse(result.draft);
      expect(parsed.success).toBe(true);
    });
  });
});
