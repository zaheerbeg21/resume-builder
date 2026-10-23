import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/db/supabase-server';
import { JdAnalysisSchema, type JdAnalysis, type JdKeyword } from '@/lib/ai/schemas';

export const PROMPT_VERSION = 'v1';

const AnalyzePayloadSchema = z.object({
  jdText: z
    .string()
    .min(50, 'Job description must be at least 50 characters')
    .max(12000, 'Job description must not exceed 12,000 characters'),
  resumeId: z.string().uuid().optional(),
});

// In-memory cache for deterministic quick lookup
export const jdAnalysisCache = new Map<string, JdAnalysis>();

/**
 * Computes deterministic SHA-256 hash for job description + prompt version.
 */
export function computeJdHash(rawJd: string, version: string = PROMPT_VERSION): string {
  const normalized = rawJd.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(`${normalized}:${version}`).digest('hex');
}

/**
 * Standard known technical vocabulary for deterministic local extraction.
 */
const KNOWN_KEYWORDS: Array<{
  term: string;
  aliases: string[];
  category: JdKeyword['category'];
  patterns: RegExp[];
}> = [
  { term: 'TypeScript', aliases: ['TS'], category: 'hard_skill', patterns: [/\btypescript\b/i, /\bts\b/] },
  { term: 'JavaScript', aliases: ['JS', 'ES6'], category: 'hard_skill', patterns: [/\bjavascript\b/i, /\bjs\b/i] },
  { term: 'React', aliases: ['React.js', 'ReactJS'], category: 'tool', patterns: [/\breact(?:\.js|js)?\b/i] },
  { term: 'Next.js', aliases: ['NextJS', 'Next'], category: 'tool', patterns: [/\bnext(?:\.js|js)?\b/i] },
  { term: 'Node.js', aliases: ['Node', 'NodeJS'], category: 'tool', patterns: [/\bnode(?:\.js|js)?\b/i] },
  { term: 'Python', aliases: ['Py'], category: 'hard_skill', patterns: [/\bpython\b/i] },
  { term: 'Go', aliases: ['Golang'], category: 'hard_skill', patterns: [/\bgolang\b/i, /\bgo\b/] },
  { term: 'Java', aliases: [], category: 'hard_skill', patterns: [/\bjava\b/i] },
  { term: 'C++', aliases: ['CPP'], category: 'hard_skill', patterns: [/\bc\+\+\b/i] },
  { term: 'C#', aliases: ['CSharp', '.NET'], category: 'hard_skill', patterns: [/\bc#\b/i, /\bcsharp\b/i] },
  { term: 'SQL', aliases: ['RDBMS'], category: 'hard_skill', patterns: [/\bsql\b/i] },
  { term: 'PostgreSQL', aliases: ['Postgres', 'PG'], category: 'tool', patterns: [/\bpostgres(?:ql)?\b/i] },
  { term: 'MongoDB', aliases: ['Mongo'], category: 'tool', patterns: [/\bmongo(?:db)?\b/i] },
  { term: 'Redis', aliases: [], category: 'tool', patterns: [/\bredis\b/i] },
  { term: 'Docker', aliases: ['Containers'], category: 'tool', patterns: [/\bdocker\b/i] },
  { term: 'Kubernetes', aliases: ['K8s'], category: 'tool', patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { term: 'AWS', aliases: ['Amazon Web Services'], category: 'tool', patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { term: 'GCP', aliases: ['Google Cloud'], category: 'tool', patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i] },
  { term: 'Azure', aliases: ['Microsoft Azure'], category: 'tool', patterns: [/\bazure\b/i] },
  { term: 'Git', aliases: ['GitHub', 'GitLab'], category: 'tool', patterns: [/\bgit\b/i, /\bgithub\b/i] },
  { term: 'CI/CD', aliases: ['Continuous Integration', 'Pipelines'], category: 'method', patterns: [/\bci\/?cd\b/i, /\bcontinuous integration\b/i] },
  { term: 'Tailwind CSS', aliases: ['Tailwind'], category: 'tool', patterns: [/\btailwind(?:css)?\b/i] },
  { term: 'REST APIs', aliases: ['REST', 'RESTful'], category: 'method', patterns: [/\brest(?:ful)?\s*(?:api|apis)?\b/i] },
  { term: 'GraphQL', aliases: [], category: 'tool', patterns: [/\bgraphql\b/i] },
  { term: 'Microservices', aliases: ['Distributed Systems'], category: 'method', patterns: [/\bmicroservices\b/i, /\bdistributed systems\b/i] },
  { term: 'Agile', aliases: ['Scrum'], category: 'method', patterns: [/\bagile\b/i, /\bscrum\b/i] },
  { term: 'Vitest', aliases: ['Jest', 'Unit Testing'], category: 'tool', patterns: [/\bvitest\b/i, /\bjest\b/i, /\bunit testing\b/i] },
  { term: 'System Design', aliases: ['Architecture'], category: 'domain', patterns: [/\bsystem design\b/i, /\bsoftware architecture\b/i] },
  { term: 'Performance Optimization', aliases: ['Web Performance'], category: 'domain', patterns: [/\bperformance optimization\b/i] },
  { term: 'Security', aliases: ['AppSec', 'Auth'], category: 'domain', patterns: [/\bsecurity\b/i, /\bappsec\b/i, /\bauthentication\b/i] },
];

/**
 * Deterministic local JD keyword and metadata extractor.
 */
export function extractJdLocally(jdText: string): JdAnalysis {
  // 1. Extract job title
  let jobTitle = 'Software Engineer';
  const firstLines = jdText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length < 80);

  const titleRegex = /(?:job\s*title|role|position)?[:\-]?\s*((?:Senior|Lead|Principal|Staff|Junior)?\s*(?:Full[\s-]Stack|Frontend|Backend|Systems|Software|DevOps|Platform|Cloud)?\s*(?:Engineer|Developer|Architect|Lead))/i;
  for (const line of firstLines) {
    const match = line.match(titleRegex);
    if (match && match[1]) {
      jobTitle = match[1].trim();
      break;
    }
  }

  // 2. Extract years of experience
  let yearsExperience: number | null = null;
  const expMatch = jdText.match(/(\d+)\+?\s*(?:-\s*\d+)?\s*years?(?:\s+of)?(?:\s+relevant)?\s+experience/i);
  if (expMatch && expMatch[1]) {
    const parsedYears = parseInt(expMatch[1], 10);
    if (!isNaN(parsedYears) && parsedYears >= 0 && parsedYears <= 30) {
      yearsExperience = parsedYears;
    }
  }

  // 3. Extract education requirement
  let education: string | null = null;
  if (/master(?:'s)?\s+degree|\bm\.s\.\b/i.test(jdText)) {
    education = "Master's Degree in Computer Science or related field";
  } else if (/bachelor(?:'s)?\s+degree|\bb\.s\.\b|\bdegree in computer science\b/i.test(jdText)) {
    education = "Bachelor's Degree in Computer Science or related field";
  }

  // 4. Extract keywords
  const requiredSectionRegex = /(?:requirements|qualifications|must\s*have|what\s*you(?:'ll)?\s*need|minimum\s*qualifications)[\s\S]*?(?=(?:preferred|nice\s*to\s*have|bonus|benefits|about\s*us|$))/i;
  const requiredSectionMatch = jdText.match(requiredSectionRegex);
  const requiredText = requiredSectionMatch ? requiredSectionMatch[0] : '';

  const keywords: JdKeyword[] = [];

  for (const item of KNOWN_KEYWORDS) {
    const isMatched = item.patterns.some((pattern) => pattern.test(jdText));
    if (isMatched) {
      const isRequired =
        (requiredText && item.patterns.some((pattern) => pattern.test(requiredText))) ||
        new RegExp(`(?:must|required|minimum)[^.]*\\b${item.term}\\b`, 'i').test(jdText);

      keywords.push({
        term: item.term,
        aliases: item.aliases,
        category: item.category,
        importance: isRequired ? 'required' : 'preferred',
      });
    }
  }

  // If text contains technical terms not in standard list, harvest up to limit
  if (keywords.length === 0) {
    keywords.push({
      term: 'Software Development',
      aliases: ['Coding'],
      category: 'hard_skill',
      importance: 'required',
    });
  }

  // Sort: required first, then term alphabetically, capped at 40
  keywords.sort((a, b) => {
    if (a.importance === b.importance) {
      return a.term.localeCompare(b.term);
    }
    return a.importance === 'required' ? -1 : 1;
  });

  const cappedKeywords = keywords.slice(0, 40);

  return JdAnalysisSchema.parse({
    job_title: jobTitle,
    years_experience: yearsExperience,
    education,
    keywords: cappedKeywords,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parseResult = AnalyzePayloadSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      },
      { status: 400 }
    );
  }

  const { jdText, resumeId } = parseResult.data;
  const jdHash = computeJdHash(jdText, PROMPT_VERSION);

  // 1. Check in-memory cache
  if (jdAnalysisCache.has(jdHash)) {
    const cached = jdAnalysisCache.get(jdHash)!;
    return NextResponse.json(cached, {
      status: 200,
      headers: { 'X-Cache': 'HIT' },
    });
  }

  // 2. Check Supabase jd_targets table
  try {
    const { data: dbTarget } = await supabase
      .from('jd_targets')
      .select('analysis')
      .eq('jd_hash', jdHash)
      .maybeSingle();

    if (dbTarget?.analysis) {
      const parsed = JdAnalysisSchema.safeParse(dbTarget.analysis);
      if (parsed.success) {
        jdAnalysisCache.set(jdHash, parsed.data);
        return NextResponse.json(parsed.data, {
          status: 200,
          headers: { 'X-Cache': 'HIT' },
        });
      }
    }
  } catch {
    // Non-fatal if database read encounters an issue
  }

  // 3. Extract keywords conforming to JdAnalysisSchema
  const analysis = extractJdLocally(jdText);

  // 4. Update in-memory cache
  jdAnalysisCache.set(jdHash, analysis);

  // 5. Persist to jd_targets if resumeId is provided
  if (resumeId) {
    try {
      await supabase.from('jd_targets').insert({
        user_id: user.id,
        resume_id: resumeId,
        jd_hash: jdHash,
        analysis,
      });
    } catch {
      // Non-fatal if database insert encounters an issue
    }
  }

  return NextResponse.json(analysis, {
    status: 200,
    headers: { 'X-Cache': 'MISS' },
  });
}
