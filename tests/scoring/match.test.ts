import { describe, it, expect } from 'vitest';
import type { Resume } from '@/types/resume';
import { JdAnalysisSchema, type JdAnalysis } from '@/lib/ai/schemas';
import {
  stem,
  tokenize,
  countPhrase,
  scoreResume,
} from '@/lib/scoring/match';

function createMockResume(overrides: Partial<Resume> = {}): Resume {
  return {
    basics: {
      fullName: 'Jane Doe',
      headline: 'Senior Full Stack Engineer',
      email: 'jane.doe@example.com',
      links: [],
      ...(overrides.basics ?? {}),
    },
    summary: overrides.summary ?? 'Experienced software engineer specializing in scalable cloud applications.',
    experience: overrides.experience ?? [
      {
        id: 'exp-1',
        company: 'Acme Cloud Corp',
        title: 'Senior Software Engineer',
        start: '2020-01',
        end: null,
        current: true,
        bullets: ['Led development of distributed services deploying resilient microservices.'],
      },
    ],
    projects: overrides.projects ?? [],
    education: overrides.education ?? [],
    skills: overrides.skills ?? [
      {
        group: 'Languages',
        items: ['TypeScript', 'JavaScript'],
      },
    ],
  };
}

function createMockJd(overrides: Partial<JdAnalysis> = {}): JdAnalysis {
  return {
    job_title: overrides.job_title ?? 'Senior Software Engineer',
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
        importance: 'preferred',
      },
    ],
  };
}

describe('JdAnalysisSchema (Blueprint Section 6.2)', () => {
  it('validates a well-formed JD analysis object', () => {
    const validJd = createMockJd();
    const result = JdAnalysisSchema.safeParse(validJd);
    expect(result.success).toBe(true);
  });

  it('allows nullable years_experience and nullable education', () => {
    const parsed = JdAnalysisSchema.safeParse(
      createMockJd({ years_experience: null, education: null })
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects keywords array exceeding 40 items', () => {
    const keywords = Array.from({ length: 41 }, (_, i) => ({
      term: `skill-${i}`,
      aliases: [],
      category: 'hard_skill' as const,
      importance: 'required' as const,
    }));
    const result = JdAnalysisSchema.safeParse(createMockJd({ keywords }));
    expect(result.success).toBe(false);
  });

  it('rejects empty keyword term', () => {
    const result = JdAnalysisSchema.safeParse(
      createMockJd({
        keywords: [
          {
            term: '',
            aliases: [],
            category: 'hard_skill',
            importance: 'required',
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects aliases array with more than 5 entries', () => {
    const result = JdAnalysisSchema.safeParse(
      createMockJd({
        keywords: [
          {
            term: 'Python',
            aliases: ['py', 'python3', 'py3', 'cpython', 'pypy', 'pythonic'],
            category: 'hard_skill',
            importance: 'required',
          },
        ],
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects invalid enum values for category or importance', () => {
    const invalidCategory = JdAnalysisSchema.safeParse({
      ...createMockJd(),
      keywords: [
        {
          term: 'Docker',
          aliases: [],
          category: 'invalid_category',
          importance: 'required',
        },
      ],
    });
    expect(invalidCategory.success).toBe(false);

    const invalidImportance = JdAnalysisSchema.safeParse({
      ...createMockJd(),
      keywords: [
        {
          term: 'Docker',
          aliases: [],
          category: 'tool',
          importance: 'mandatory',
        },
      ],
    });
    expect(invalidImportance.success).toBe(false);
  });
});

describe('Pure Helpers: stem, tokenize, countPhrase (Blueprint Section 7)', () => {
  it('stem: preserves short terms and terms with +, #, .', () => {
    expect(stem('c')).toBe('c');
    expect(stem('go')).toBe('go');
    expect(stem('c++')).toBe('c++');
    expect(stem('c#')).toBe('c#');
    expect(stem('node.js')).toBe('node.js');
    expect(stem('.net')).toBe('.net');
  });

  it('stem: strips common English suffixes (ing, ed, es, s) when stem length >= 3', () => {
    expect(stem('deploying')).toBe('deploy');
    expect(stem('deployed')).toBe('deploy');
    expect(stem('processes')).toBe('process');
    expect(stem('containers')).toBe('container');
    expect(stem('yes')).toBe('yes'); // length 3, length - 2 < 3, length - 1 < 3
  });

  it('tokenize: preserves technical symbols, removes punctuation, stems words', () => {
    expect(tokenize('Node.js, C++, and C#.')).toEqual(['node.js', 'c++', 'and', 'c#']);
    expect(tokenize('Deploying microservices with Docker.')).toEqual([
      'deploy',
      'microservic',
      'with',
      'docker',
    ]);
  });

  it('countPhrase: counts exact occurrences and multi-word phrases correctly', () => {
    const tokens = ['build', 'scalabl', 'cloud', 'system', 'and', 'cloud', 'system'];
    expect(countPhrase(tokens, ['cloud', 'system'])).toBe(2);
    expect(countPhrase(tokens, ['build'])).toBe(1);
    expect(countPhrase(tokens, ['nonexistent'])).toBe(0);
    expect(countPhrase(tokens, [])).toBe(0);
  });
});

describe('Deterministic Keyword Match Score (Blueprint Section 7 Golden Tests)', () => {
  it('Determinism: identical resume and JD return identical score and breakdown on repeated runs', () => {
    const resume = createMockResume();
    const jd = createMockJd();
    const run1 = scoreResume(resume, jd, 1.0);
    const run2 = scoreResume(resume, jd, 1.0);
    const run3 = scoreResume(resume, jd, 1.0);

    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });

  it('Normalization & aliases: "Node.js", "node.js", and alias "NodeJS" all match', () => {
    const jd = createMockJd({
      keywords: [
        {
          term: 'Node.js',
          aliases: ['NodeJS'],
          category: 'tool',
          importance: 'required',
        },
      ],
    });

    const resumeLower = createMockResume({
      experience: [
        {
          id: 'exp-1',
          company: 'Tech Corp',
          title: 'Software Engineer',
          start: '2021-01',
          end: null,
          current: true,
          bullets: ['Engineered backends with node.js and Express.'],
        },
      ],
    });
    const resultLower = scoreResume(resumeLower, jd, 1.0);
    expect(resultLower.keywords[0].found).toBe(true);
    expect(resultLower.keywords[0].mentions).toBe(1);

    const resumeAlias = createMockResume({
      experience: [
        {
          id: 'exp-1',
          company: 'Tech Corp',
          title: 'Software Engineer',
          start: '2021-01',
          end: null,
          current: true,
          bullets: ['Built APIs with NodeJS backend framework.'],
        },
      ],
    });
    const resultAlias = scoreResume(resumeAlias, jd, 1.0);
    expect(resultAlias.keywords[0].found).toBe(true);
    expect(resultAlias.keywords[0].mentions).toBe(1);

    const resumeStandard = createMockResume({
      experience: [
        {
          id: 'exp-1',
          company: 'Tech Corp',
          title: 'Software Engineer',
          start: '2021-01',
          end: null,
          current: true,
          bullets: ['Maintained robust Node.js microservices.'],
        },
      ],
    });
    const resultStandard = scoreResume(resumeStandard, jd, 1.0);
    expect(resultStandard.keywords[0].found).toBe(true);
    expect(resultStandard.keywords[0].mentions).toBe(1);
  });

  it('Punctuation & language precision: "C++" matches "c++", but does NOT match "C"; "C#" does not match "C"', () => {
    const jdCpp = createMockJd({
      keywords: [
        {
          term: 'C++',
          aliases: [],
          category: 'hard_skill',
          importance: 'required',
        },
      ],
    });

    const jdC = createMockJd({
      keywords: [
        {
          term: 'C',
          aliases: [],
          category: 'hard_skill',
          importance: 'required',
        },
      ],
    });

    const resumeWithC = createMockResume({
      skills: [{ group: 'Languages', items: ['C'] }],
    });
    const resumeWithCpp = createMockResume({
      skills: [{ group: 'Languages', items: ['c++'] }],
    });
    const resumeWithCSharp = createMockResume({
      skills: [{ group: 'Languages', items: ['C#'] }],
    });

    // C++ JD matching:
    const cppOnCpp = scoreResume(resumeWithCpp, jdCpp, 1.0);
    expect(cppOnCpp.keywords[0].found).toBe(true);

    const cppOnC = scoreResume(resumeWithC, jdCpp, 1.0);
    expect(cppOnC.keywords[0].found).toBe(false);

    // C JD matching:
    const cOnCpp = scoreResume(resumeWithCpp, jdC, 1.0);
    expect(cOnCpp.keywords[0].found).toBe(false);

    const cOnCSharp = scoreResume(resumeWithCSharp, jdC, 1.0);
    expect(cOnCSharp.keywords[0].found).toBe(false);

    const cOnC = scoreResume(resumeWithC, jdC, 1.0);
    expect(cOnC.keywords[0].found).toBe(true);
  });

  it('Stemming: "deploying" and "deployed" match JD term "deploy"', () => {
    const jd = createMockJd({
      keywords: [
        {
          term: 'deploy',
          aliases: [],
          category: 'method',
          importance: 'required',
        },
      ],
    });

    const resumeDeploying = createMockResume({
      experience: [
        {
          id: 'exp-1',
          company: 'Acme',
          title: 'DevOps Engineer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: ['Responsible for deploying serverless infrastructure.'],
        },
      ],
    });
    const resDeploying = scoreResume(resumeDeploying, jd, 1.0);
    expect(resDeploying.keywords[0].found).toBe(true);

    const resumeDeployed = createMockResume({
      experience: [
        {
          id: 'exp-1',
          company: 'Acme',
          title: 'DevOps Engineer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: ['Successfully deployed multiple production clusters.'],
        },
      ],
    });
    const resDeployed = scoreResume(resumeDeployed, jd, 1.0);
    expect(resDeployed.keywords[0].found).toBe(true);
  });

  it('Stuffing detection: a keyword repeated 10 times scores the same as once, but sets stuffed: true', () => {
    const jd = createMockJd({
      job_title: 'Docker Specialist',
      keywords: [
        {
          term: 'Docker',
          aliases: [],
          category: 'tool',
          importance: 'required',
        },
      ],
    });

    const resumeOnce = createMockResume({
      experience: [
        {
          id: 'exp-1',
          company: 'Acme',
          title: 'Software Engineer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: ['Containerized services with Docker.'],
        },
      ],
    });

    const resumeTenTimes = createMockResume({
      experience: [
        {
          id: 'exp-1',
          company: 'Acme',
          title: 'Software Engineer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: [
            'Docker Docker Docker Docker Docker.',
            'Docker Docker Docker Docker Docker.',
          ],
        },
      ],
    });

    const resOnce = scoreResume(resumeOnce, jd, 1.0);
    const resTenTimes = scoreResume(resumeTenTimes, jd, 1.0);

    // Scoring must be identical despite 10 repetitions
    expect(resTenTimes.breakdown.coverage).toBe(resOnce.breakdown.coverage);
    expect(resTenTimes.score).toBe(resOnce.score);

    // Stuffing flag assertion
    expect(resOnce.keywords[0].mentions).toBe(1);
    expect(resOnce.keywords[0].stuffed).toBe(false);

    expect(resTenTimes.keywords[0].mentions).toBe(10);
    expect(resTenTimes.keywords[0].stuffed).toBe(true);
  });

  it('Section weights: a keyword found only in summary earns less than in experience (0.5 vs 1.0 weight)', () => {
    const jd = createMockJd({
      job_title: 'Python Engineer',
      keywords: [
        {
          term: 'Python',
          aliases: [],
          category: 'hard_skill',
          importance: 'required',
        },
      ],
    });

    const resumeSummaryOnly = createMockResume({
      basics: {
        fullName: 'Jane Doe',
        headline: 'Developer',
        email: 'jane@example.com',
        links: [],
      },
      summary: 'Proficient in Python scripting and data processing.',
      experience: [],
      projects: [],
      skills: [],
    });

    const resumeExperienceOnly = createMockResume({
      basics: {
        fullName: 'Jane Doe',
        headline: 'Developer',
        email: 'jane@example.com',
        links: [],
      },
      summary: '',
      experience: [
        {
          id: 'exp-1',
          company: 'Tech Corp',
          title: 'Developer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: ['Developed backend services using Python.'],
        },
      ],
      projects: [],
      skills: [],
    });

    const resSummary = scoreResume(resumeSummaryOnly, jd, 0);
    const resExperience = scoreResume(resumeExperienceOnly, jd, 0);

    // Summary weight is 0.5: coverage = 0.5, 80 * 0.5 = 40 points
    expect(resSummary.breakdown.coverage).toBe(40);
    // Experience weight is 1.0: coverage = 1.0, 80 * 1.0 = 80 points
    expect(resExperience.breakdown.coverage).toBe(80);
    expect(resSummary.score).toBeLessThan(resExperience.score);
  });

  it('Section weights: respects hierarchy (experience: 1.0, projects: 0.9, skills: 0.7, summary: 0.5)', () => {
    const jd = createMockJd({
      job_title: 'Rust Engineer',
      keywords: [
        {
          term: 'Rust',
          aliases: [],
          category: 'hard_skill',
          importance: 'required',
        },
      ],
    });

    const resumeProjects = createMockResume({
      basics: { fullName: 'Jane', headline: 'Dev', email: 'j@e.co', links: [] },
      summary: '',
      experience: [],
      projects: [{ id: 'p1', name: 'Rust Engine', bullets: ['Built a parser in Rust.'] }],
      skills: [],
    });

    const resumeSkills = createMockResume({
      basics: { fullName: 'Jane', headline: 'Dev', email: 'j@e.co', links: [] },
      summary: '',
      experience: [],
      projects: [],
      skills: [{ group: 'Languages', items: ['Rust'] }],
    });

    const resProjects = scoreResume(resumeProjects, jd, 0);
    const resSkills = scoreResume(resumeSkills, jd, 0);

    // Projects: 0.9 * 80 = 72
    expect(resProjects.breakdown.coverage).toBe(72);
    // Skills: 0.7 * 80 = 56
    expect(resSkills.breakdown.coverage).toBe(56);
  });

  it('Division-by-zero safety: empty JD keyword list returns 0 coverage without NaN', () => {
    const emptyJd = createMockJd({
      keywords: [],
    });
    const resume = createMockResume();

    const result = scoreResume(resume, emptyJd, 0.5);

    expect(Number.isNaN(result.score)).toBe(false);
    expect(Number.isNaN(result.breakdown.coverage)).toBe(false);
    expect(Number.isNaN(result.breakdown.title)).toBe(false);
    expect(Number.isNaN(result.breakdown.format)).toBe(false);
    expect(result.breakdown.coverage).toBe(0);
    expect(result.keywords).toEqual([]);
    expect(result.missingRequired).toEqual([]);
  });

  it('Division-by-zero safety: empty JD title and minimal resume without titles', () => {
    const noTitleJd = createMockJd({
      job_title: '',
      keywords: [],
    });
    const minimalResume = createMockResume({
      basics: { fullName: 'Jane', headline: '', email: 'j@e.co', links: [] },
      experience: [],
    });

    const result = scoreResume(minimalResume, noTitleJd, 0);
    expect(Number.isNaN(result.score)).toBe(false);
    expect(result.breakdown.title).toBe(0);
    expect(result.score).toBe(0);
  });

  it('Missing required keywords: accurately populates the missingRequired array', () => {
    const jd = createMockJd({
      keywords: [
        {
          term: 'Kubernetes',
          aliases: ['k8s'],
          category: 'tool',
          importance: 'required',
        },
        {
          term: 'GraphQL',
          aliases: [],
          category: 'hard_skill',
          importance: 'preferred',
        },
        {
          term: 'TypeScript',
          aliases: ['TS'],
          category: 'hard_skill',
          importance: 'required',
        },
      ],
    });

    const resume = createMockResume({
      skills: [{ group: 'Languages', items: ['TypeScript'] }],
      experience: [],
      summary: '',
    });

    const result = scoreResume(resume, jd, 0.5);

    // Kubernetes is missing and required -> included
    // GraphQL is missing but preferred -> excluded
    // TypeScript is found and required -> excluded
    expect(result.missingRequired).toEqual(['Kubernetes']);
  });

  it('Title alignment: matches tokens between JD title and headline or latest experience title', () => {
    const jd = createMockJd({
      job_title: 'Senior Staff Engineer',
      keywords: [],
    });

    const resumeMatch = createMockResume({
      basics: {
        fullName: 'Jane',
        headline: 'Staff Engineer',
        email: 'j@e.co',
        links: [],
      },
      experience: [
        {
          id: 'e1',
          company: 'Acme',
          title: 'Senior Engineer',
          start: '2020-01',
          end: null,
          current: true,
          bullets: [],
        },
      ],
    });

    const result = scoreResume(resumeMatch, jd, 0);
    // jdTitle tokens: ['senior', 'staff', 'engin']
    // myTitles tokens: ['staff', 'engin', 'senior', 'engin']
    // Overlap: 'senior' (yes), 'staff' (yes), 'engin' (yes) -> 3 / 3 = 1.0 -> 10 points
    expect(result.breakdown.title).toBe(10);
  });
});
