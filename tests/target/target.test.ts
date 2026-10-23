import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Resume } from '@/types/resume';
import { JdAnalysisSchema, type JdAnalysis, type JdKeyword } from '@/lib/ai/schemas';
import { scoreResume } from '@/lib/scoring/match';
import { getScoreGrade } from '@/components/target/MatchScoreCard';
import { computeResumeFormatScore } from '@/components/target/TargetLayout';
import {
  POST as analyzeJdRoute,
  computeJdHash,
  jdAnalysisCache,
  PROMPT_VERSION,
} from '@/app/api/jd/analyze/route';
import * as supabaseServer from '@/lib/db/supabase-server';

function createFixtureResume(overrides: Partial<Resume> = {}): Resume {
  return {
    basics: {
      fullName: 'Alex Morgan',
      headline: 'Senior Full Stack Engineer',
      email: 'alex.morgan@example.com',
      phone: '+1 555-0144',
      location: 'San Francisco, CA',
      links: [{ label: 'GitHub', url: 'https://github.com/alexmorgan' }],
      ...(overrides.basics ?? {}),
    },
    summary:
      overrides.summary ??
      'Full Stack Engineer with 7 years architecting scalable cloud applications using TypeScript and React.',
    experience: overrides.experience ?? [
      {
        id: 'exp-1',
        company: 'Veloce Labs',
        title: 'Senior Software Engineer',
        location: 'San Francisco, CA',
        start: '2021-03',
        end: null,
        current: true,
        bullets: [
          'Engineered event-driven microservices using TypeScript, Node.js, and PostgreSQL.',
          'Deployed containerized applications to Kubernetes with automated CI/CD pipelines.',
        ],
      },
      {
        id: 'exp-2',
        company: 'Apex Cloud',
        title: 'Software Engineer',
        location: 'Remote',
        start: '2018-06',
        end: '2021-02',
        current: false,
        bullets: [
          'Developed responsive customer portals using React, Next.js, and Tailwind CSS.',
        ],
      },
    ],
    projects: overrides.projects ?? [
      {
        id: 'proj-1',
        name: 'Distributed Task Queue',
        url: 'https://github.com/alexmorgan/task-queue',
        bullets: ['Implemented distributed job scheduler using Redis and Docker.'],
      },
    ],
    education: overrides.education ?? [
      {
        id: 'edu-1',
        school: 'University of California, Berkeley',
        degree: 'B.S. in Computer Science',
        start: '2014',
        end: '2018',
      },
    ],
    skills: overrides.skills ?? [
      {
        group: 'Frontend & Backend',
        items: ['TypeScript', 'JavaScript', 'React', 'Node.js', 'Next.js'],
      },
      {
        group: 'Cloud & Database',
        items: ['PostgreSQL', 'Docker', 'Kubernetes', 'Redis', 'AWS'],
      },
    ],
  };
}

function createFixtureJd(overrides: Partial<JdAnalysis> = {}): JdAnalysis {
  return {
    job_title: overrides.job_title ?? 'Senior Full Stack Engineer',
    years_experience: overrides.years_experience !== undefined ? overrides.years_experience : 5,
    education: overrides.education !== undefined ? overrides.education : "Bachelor's Degree",
    keywords: overrides.keywords ?? [
      {
        term: 'TypeScript',
        aliases: ['TS'],
        category: 'hard_skill',
        importance: 'required',
      },
      {
        term: 'React',
        aliases: ['React.js'],
        category: 'tool',
        importance: 'required',
      },
      {
        term: 'Node.js',
        aliases: ['NodeJS', 'Node'],
        category: 'tool',
        importance: 'required',
      },
      {
        term: 'PostgreSQL',
        aliases: ['Postgres'],
        category: 'tool',
        importance: 'preferred',
      },
      {
        term: 'GraphQL',
        aliases: [],
        category: 'tool',
        importance: 'required', // missing required keyword fixture
      },
      {
        term: 'Go',
        aliases: ['Golang'],
        category: 'hard_skill',
        importance: 'preferred', // missing preferred keyword fixture
      },
    ],
  };
}

describe('Match Panel & Score Breakdown (BLUEPRINT Section 7)', () => {
  it('computes deterministic score with 3-part breakdown (Coverage /80, Title /10, Format /10)', () => {
    const resume = createFixtureResume();
    const jd = createFixtureJd();
    const formatScore = 1.0;

    const result = scoreResume(resume, jd, formatScore);

    // Assert breakdown keys and bounds
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown.coverage).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.coverage).toBeLessThanOrEqual(80);
    expect(result.breakdown.title).toBe(10); // Matches "Senior Full Stack Engineer"
    expect(result.breakdown.format).toBe(10); // 10 * 1.0

    // Overall score equals sum of rounded components
    expect(result.score).toBe(
      result.breakdown.coverage + result.breakdown.title + result.breakdown.format
    );
  });

  it('correctly maps scores to letter grades and descriptive labels', () => {
    expect(getScoreGrade(90)).toEqual({
      grade: 'A',
      label: 'Strong Match',
      badgeClass: expect.stringContaining('emerald'),
    });

    expect(getScoreGrade(75)).toEqual({
      grade: 'B',
      label: 'Good Match',
      badgeClass: expect.stringContaining('blue'),
    });

    expect(getScoreGrade(60)).toEqual({
      grade: 'C',
      label: 'Fair Match',
      badgeClass: expect.stringContaining('amber'),
    });

    expect(getScoreGrade(42)).toEqual({
      grade: 'D',
      label: 'Needs Targeting',
      badgeClass: expect.stringContaining('rose'),
    });
  });

  it('computes format score based on resume structural completeness', () => {
    const completeResume = createFixtureResume();
    const formatScore = computeResumeFormatScore(completeResume);
    expect(formatScore).toBe(1.0);

    const emptyResume: Resume = {
      basics: { fullName: '', headline: '', email: 'empty@example.com', links: [] },
      summary: '',
      experience: [],
      projects: [],
      education: [],
      skills: [],
    };
    const emptyFormatScore = computeResumeFormatScore(emptyResume);
    expect(emptyFormatScore).toBeLessThan(0.5);
  });
});

describe('Keyword Classification & Stuffing Detection', () => {
  it('correctly identifies sections containing matched keywords', () => {
    const resume = createFixtureResume();
    const jd = createFixtureJd();

    const result = scoreResume(resume, jd, 1.0);

    const tsKeyword = result.keywords.find((k) => k.term === 'TypeScript');
    expect(tsKeyword).toBeDefined();
    expect(tsKeyword?.found).toBe(true);
    // TypeScript appears in summary, experience, and skills
    expect(tsKeyword?.sections).toContain('experience');
    expect(tsKeyword?.sections).toContain('skills');
    expect(tsKeyword?.sections).toContain('summary');

    const redisKeyword = scoreResume(
      resume,
      createFixtureJd({
        keywords: [
          { term: 'Redis', aliases: [], category: 'tool', importance: 'preferred' },
        ],
      }),
      1.0
    ).keywords[0];

    // Redis appears in projects and skills
    expect(redisKeyword.sections).toContain('projects');
    expect(redisKeyword.sections).toContain('skills');
  });

  it('flags keyword stuffing when mentions > 4 and does not grant extra credit', () => {
    const normalResume = createFixtureResume();
    const stuffedResume = createFixtureResume({
      experience: [
        {
          id: 'exp-1',
          company: 'Company',
          title: 'Title',
          start: '2020-01',
          end: null,
          current: true,
          bullets: [
            'TypeScript TypeScript TypeScript TypeScript TypeScript TypeScript engineer.',
          ],
        },
      ],
    });

    const jd = createFixtureJd({
      keywords: [
        { term: 'TypeScript', aliases: [], category: 'hard_skill', importance: 'required' },
      ],
    });

    const normalResult = scoreResume(normalResume, jd, 1.0);
    const stuffedResult = scoreResume(stuffedResume, jd, 1.0);

    const stuffedTs = stuffedResult.keywords.find((k) => k.term === 'TypeScript');
    expect(stuffedTs?.stuffed).toBe(true);
    expect(stuffedTs?.mentions).toBeGreaterThan(4);

    // Repeating a keyword 6+ times earns the exact same coverage points as having it once in experience
    expect(stuffedResult.breakdown.coverage).toBe(normalResult.breakdown.coverage);
  });
});

describe('Missing Required Keywords & 1-Click Skill Additions', () => {
  it('identifies missing required keywords versus preferred keywords', () => {
    const resume = createFixtureResume();
    const jd = createFixtureJd();

    const result = scoreResume(resume, jd, 1.0);

    // GraphQL is required and missing
    expect(result.missingRequired).toContain('GraphQL');

    // Go is preferred and missing, so it is NOT in missingRequired
    expect(result.missingRequired).not.toContain('Go');

    const missingPreferred = result.keywords.filter(
      (k) => !k.found && k.importance === 'preferred'
    );
    expect(missingPreferred.some((k) => k.term === 'Go')).toBe(true);
  });

  it('1-click skill addition mutates resume skills and dynamically raises score', () => {
    const resume = createFixtureResume();
    const jd = createFixtureJd();

    const initialResult = scoreResume(resume, jd, 1.0);
    expect(initialResult.missingRequired).toContain('GraphQL');
    const initialScore = initialResult.score;

    // Simulate 1-click addition of "GraphQL"
    const mutatedResume: Resume = JSON.parse(JSON.stringify(resume));
    mutatedResume.skills[0].items.push('GraphQL');

    const updatedResult = scoreResume(mutatedResume, jd, 1.0);

    // GraphQL should now be found
    const updatedGql = updatedResult.keywords.find((k) => k.term === 'GraphQL');
    expect(updatedGql?.found).toBe(true);
    expect(updatedGql?.sections).toContain('skills');

    // GraphQL is no longer in missingRequired
    expect(updatedResult.missingRequired).not.toContain('GraphQL');

    // Score and coverage must increase
    expect(updatedResult.score).toBeGreaterThan(initialScore);
    expect(updatedResult.breakdown.coverage).toBeGreaterThan(
      initialResult.breakdown.coverage
    );
  });
});

describe('POST /api/jd/analyze Route', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.restoreAllMocks();
    jdAnalysisCache.clear();
  });

  it('returns 401 when user session is unauthorized', async () => {
    vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Auth error') }),
      },
    } as unknown as SupabaseClient);

    const req = new Request('http://localhost:3000/api/jd/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdText: 'Short text' }),
    });

    const res = await analyzeJdRoute(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when jdText is under 50 characters', async () => {
    vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    } as unknown as SupabaseClient);

    const req = new Request('http://localhost:3000/api/jd/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdText: 'Too short JD text.' }),
    });

    const res = await analyzeJdRoute(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validation failed');
  });

  it('returns 400 when jdText exceeds 12,000 characters', async () => {
    vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    } as unknown as SupabaseClient);

    const hugeText = 'a'.repeat(12001);
    const req = new Request('http://localhost:3000/api/jd/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdText: hugeText }),
    });

    const res = await analyzeJdRoute(req);
    expect(res.status).toBe(400);
  });

  it('successfully extracts valid keywords and metadata conforming to JdAnalysisSchema', async () => {
    vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as unknown as SupabaseClient);

    const sampleJd = `
      Job Title: Senior Software Engineer
      About the Role:
      We are looking for a Senior Software Engineer with 5+ years of experience to join our team.
      Requirements:
      - 5+ years experience building web applications
      - Must have strong experience with TypeScript and React
      - Solid understanding of Node.js and REST APIs
      - Experience with PostgreSQL and Docker is required
      Preferred Qualifications:
      - Hands-on experience with Kubernetes and GraphQL
      - Experience with Tailwind CSS
    `;

    const req = new Request('http://localhost:3000/api/jd/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdText: sampleJd }),
    });

    const res = await analyzeJdRoute(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Cache')).toBe('MISS');

    const analysis: JdAnalysis = await res.json();
    const validated = JdAnalysisSchema.safeParse(analysis);
    expect(validated.success).toBe(true);

    expect(analysis.job_title).toContain('Software Engineer');
    expect(analysis.years_experience).toBe(5);

    const extractedTerms = analysis.keywords.map((k: JdKeyword) => k.term);
    expect(extractedTerms).toContain('TypeScript');
    expect(extractedTerms).toContain('React');
    expect(extractedTerms).toContain('Node.js');
    expect(extractedTerms).toContain('PostgreSQL');

    // Required keywords
    const tsKeyword = analysis.keywords.find((k: JdKeyword) => k.term === 'TypeScript');
    expect(tsKeyword?.importance).toBe('required');
  });

  it('returns cached analysis with X-Cache: HIT on subsequent identical request', async () => {
    vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient);

    const sampleJd = 'Looking for a Senior Frontend Developer with 4+ years experience in React and TypeScript. Requirements: React and TypeScript.';

    // First request -> MISS
    const req1 = new Request('http://localhost:3000/api/jd/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdText: sampleJd }),
    });
    const res1 = await analyzeJdRoute(req1);
    expect(res1.status).toBe(200);
    expect(res1.headers.get('X-Cache')).toBe('MISS');

    // Second request with same JD -> HIT
    const req2 = new Request('http://localhost:3000/api/jd/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdText: sampleJd }),
    });
    const res2 = await analyzeJdRoute(req2);
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-Cache')).toBe('HIT');
  });

  it('computes deterministic hash based on normalized text and prompt version', () => {
    const text1 = 'Senior Full Stack Engineer \n\n with React and TypeScript';
    const text2 = 'senior full stack engineer with react and typescript';

    const hash1 = computeJdHash(text1, PROMPT_VERSION);
    const hash2 = computeJdHash(text2, PROMPT_VERSION);
    expect(hash1).toBe(hash2);

    const hashDifferentVersion = computeJdHash(text1, 'v2');
    expect(hash1).not.toBe(hashDifferentVersion);
  });
});
