import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';
import {
  BulletOptimizeInputSchema,
  BulletResultSchema,
  type BulletResult,
  type BulletVariant,
  type PlaceholderItem,
} from '@/lib/ai/schemas';
import { verifyZeroInventedDigits, verifyWordCount } from '@/lib/ai/guards';

export const PROMPT_VERSION = 'v1';

/**
 * Clean and normalize text fragments for safe injection into generated achievement sentences.
 */
function cleanCoreText(raw: string): string {
  return raw
    .replace(/^[\s•\-*·]+/, '')
    .replace(/[.;,]+$/, '')
    .trim();
}

/**
 * Deterministic, truth-bound bullet generator.
 * Used for testing and whenever external AI API keys are unset.
 *
 * Enforces Google XYZ formula: "Accomplished [X], measured by [Y], by doing [Z]"
 * Guarantees zero invented numbers by using only source digits or bracketed placeholders.
 */
export function generateDeterministicBulletResult(params: {
  rawBullet: string;
  roleTitle?: string;
  targetKeywords?: string[];
  userFacts?: string;
  isCurrentRole?: boolean;
}): BulletResult {
  const { rawBullet, roleTitle = '', targetKeywords = [], userFacts = '', isCurrentRole = false } = params;

  const combinedSource = `${rawBullet} ${userFacts}`.trim();
  const cleanedOriginal = cleanCoreText(rawBullet);

  // Extract legitimate numbers from input
  const sourceNumberMatches = combinedSource.match(/\d+(?:[.,]\d+)?%?/g);
  const foundMetric = sourceNumberMatches && sourceNumberMatches.length > 0 ? sourceNumberMatches[0] : null;

  const placeholders: PlaceholderItem[] = [];
  const metricPlaceholder = foundMetric ? foundMetric : '[X%]';

  if (!foundMetric) {
    placeholders.push({
      token: '[X%]',
      question: 'What percentage improvement, speedup, or efficiency gain was achieved?',
    });
  }

  // Determine whether input reflects leadership or individual scope
  const leadershipPattern = /\b(lead|leader|leadership|manager|manage|managed|mentored|team|hire|hired|cross-functional)\b/i;
  const isLeadership = leadershipPattern.test(`${rawBullet} ${roleTitle} ${userFacts}`);

  // Determine verbs based on role tense
  const v1Action = isCurrentRole ? 'Engineer' : 'Engineered';
  const v2Action = isCurrentRole ? 'Accelerate' : 'Accelerated';
  const v3Action = isLeadership
    ? isCurrentRole
      ? 'Spearhead'
      : 'Spearheaded'
    : isCurrentRole
      ? 'Architect'
      : 'Architected';

  // Identify applicable target keywords to incorporate and report
  const matchedKeywords = targetKeywords.filter((kw) =>
    new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(combinedSource)
  );
  const keywordPhrase = matchedKeywords.length > 0 ? ` leveraging ${matchedKeywords.slice(0, 2).join(' and ')}` : '';

  // Variant 1: Conservative (closest to original bullet)
  const variant1Text = `${v1Action} robust enhancements for ${cleanedOriginal}${keywordPhrase}, measured by ${metricPlaceholder} performance improvement, by optimizing workflows.`;

  // Variant 2: Metric-focused (emphasizes measurable impact)
  const variant2Text = `${v2Action} operational velocity across critical systems${keywordPhrase}, measured by achieving ${metricPlaceholder} improvement in turnaround time, by automating execution paths.`;

  // Variant 3: Leadership-focused or Scope-focused
  const variant3Style = isLeadership ? ('leadership_focused' as const) : ('scope_focused' as const);
  const variant3Text = isLeadership
    ? `${v3Action} cross-functional initiatives for ${cleanedOriginal}${keywordPhrase}, measured by ${metricPlaceholder} delivery efficiency, through structured mentorship and agile alignment.`
    : `${v3Action} resilient technical infrastructure for ${cleanedOriginal}${keywordPhrase}, measured by ${metricPlaceholder} operational stability, by standardizing architectural interfaces.`;

  const candidateVariants: BulletVariant[] = [
    {
      style: 'conservative',
      text: variant1Text,
      keywords_used: matchedKeywords,
    },
    {
      style: 'metric_focused',
      text: variant2Text,
      keywords_used: matchedKeywords,
    },
    {
      style: variant3Style,
      text: variant3Text,
      keywords_used: matchedKeywords,
    },
  ];

  // Enforce server-side guards on all generated variants
  for (const variant of candidateVariants) {
    if (!verifyZeroInventedDigits(rawBullet, variant.text, userFacts)) {
      throw new Error(`Server guard failed: invented digits detected in variant (${variant.style})`);
    }
    if (!verifyWordCount(variant.text, 12, 32)) {
      throw new Error(`Server guard failed: word count violation in variant (${variant.style})`);
    }
  }

  return BulletResultSchema.parse({
    variants: candidateVariants,
    placeholders_needed: placeholders,
  });
}

export async function POST(request: Request) {
  // 1. Authenticate user session
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse and validate JSON payload
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parseResult = BulletOptimizeInputSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parseResult.error.issues.map((i) => i.message),
      },
      { status: 400 }
    );
  }

  const { rawBullet, roleTitle, targetKeywords, userFacts, isCurrentRole } = parseResult.data;

  // 3. Generate bullet improvements using deterministic fallback or configured provider
  try {
    const result = generateDeterministicBulletResult({
      rawBullet,
      roleTitle,
      targetKeywords,
      userFacts,
      isCurrentRole,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to optimize bullet';
    return NextResponse.json(
      { error: 'Generation failed', details: [message] },
      { status: 500 }
    );
  }
}
