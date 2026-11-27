import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/db/supabase-server';
import { getServiceRoleClient, hasActivePass } from '@/lib/billing/entitlements';
import { recordUsageEvent } from '@/lib/db/usage-events';
import { resolveGeminiModel } from '@/lib/ai/config';
import {
  ProviderError,
  type GenerateResult,
  type LlmProvider,
} from '@/lib/ai/provider';
import { GeminiProvider } from '@/lib/ai/providers/gemini';
import {
  JD_ANALYZE_PROMPT_VERSION,
  JD_ANALYZE_SYSTEM_PROMPT,
  buildJdPrompt,
} from '@/lib/ai/prompts/jd-analyze';
import { JdAnalysisSchema, type JdAnalysis } from '@/lib/ai/schemas';

export const PROMPT_VERSION = JD_ANALYZE_PROMPT_VERSION;

const AnalyzePayloadSchema = z.object({
  jdText: z
    .string()
    .min(50, 'Job description must be at least 50 characters')
    .max(12000, 'Job description must not exceed 12,000 characters'),
  resumeId: z.string().uuid().optional(),
});

// In-memory cache for deterministic quick lookup
export const jdAnalysisCache = new Map<string, JdAnalysis>();

let providerOverride: LlmProvider | null = null;

export function setProviderForTesting(provider: LlmProvider | null): void {
  providerOverride = provider;
}

export function resolveDefaultProvider(): LlmProvider {
  if (providerOverride) {
    return providerOverride;
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing required environment variable: GEMINI_API_KEY');
  }
  return new GeminiProvider({ apiKey });
}

/**
 * Computes deterministic SHA-256 hash for job description, prompt version, provider, and model.
 */
export function computeJdHash(
  rawJd: string,
  version: string = PROMPT_VERSION,
  provider: string = 'gemini',
  model: string = resolveGeminiModel(process.env),
): string {
  const normalized = rawJd.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(`${normalized}:${version}:${provider}:${model}`)
    .digest('hex');
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

  let provider: LlmProvider;
  try {
    provider = resolveDefaultProvider();
  } catch {
    return NextResponse.json(
      { error: 'AI analysis service is temporarily unavailable.' },
      { status: 503 },
    );
  }

  const activeModel =
    provider.name === 'gemini' ? resolveGeminiModel(process.env) : provider.name;
  const { jdText, resumeId } = parseResult.data;
  const jdHash = computeJdHash(jdText, PROMPT_VERSION, provider.name, activeModel);

  // 1. Check in-memory cache (cache hits do not consume AI quota)
  if (jdAnalysisCache.has(jdHash)) {
    const cached = jdAnalysisCache.get(jdHash)!;
    return NextResponse.json(cached, {
      status: 200,
      headers: { 'X-Cache': 'HIT' },
    });
  }

  // 2. Check Supabase jd_targets table (cache hits do not consume AI quota)
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

  // 3. Enforce per-user rate limit and AI quota on cache miss
  const admin = getServiceRoleClient();
  const sixtySecondsAgoIso = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount, error: rateLimitError } = await admin
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', sixtySecondsAgoIso);

  if (rateLimitError) {
    return NextResponse.json(
      { error: 'AI analysis service is temporarily unavailable.' },
      { status: 503 },
    );
  }

  if ((recentCount ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const isPassActive = await hasActivePass(user.id, admin);
  const quotaLimit = isPassActive ? 300 : 5;
  const quotaWindowMs = isPassActive
    ? 30 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const quotaSinceIso = new Date(Date.now() - quotaWindowMs).toISOString();

  const { count: quotaCount, error: quotaError } = await admin
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', quotaSinceIso);

  if (quotaError) {
    return NextResponse.json(
      { error: 'AI analysis service is temporarily unavailable.' },
      { status: 503 },
    );
  }

  if ((quotaCount ?? 0) >= quotaLimit) {
    return NextResponse.json(
      { error: 'AI quota limit reached.' },
      { status: 429 },
    );
  }

  // 4. Extract structured JD keywords via LlmProvider (never log JD text)
  let generation: GenerateResult<JdAnalysis>;
  try {
    generation = await provider.generateStructured({
      systemPrompt: JD_ANALYZE_SYSTEM_PROMPT,
      prompt: buildJdPrompt(jdText),
      schema: JdAnalysisSchema,
    });
  } catch (err: unknown) {
    if (err instanceof ProviderError) {
      if (err.kind === 'timeout') {
        return NextResponse.json(
          { error: 'AI analysis request timed out. Please try again.' },
          { status: 504 },
        );
      }
      return NextResponse.json(
        { error: 'AI analysis failed. Please try again shortly.' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: 'AI analysis service is temporarily unavailable.' },
      { status: 502 },
    );
  }

  const analysis = generation.data;

  // 5. Update in-memory cache
  jdAnalysisCache.set(jdHash, analysis);

  // 6. Persist to jd_targets if resumeId is provided
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

  // 7. Record telemetry event
  await recordUsageEvent(
    {
      userId: user.id,
      route: '/api/jd/analyze',
      provider: generation.provider,
      model: generation.model,
      latencyMs: generation.latencyMs,
      inputTokens: generation.inputTokens ?? null,
      outputTokens: generation.outputTokens ?? null,
      estCostUsd: null,
    },
    { adminClient: admin },
  );

  return NextResponse.json(analysis, {
    status: 200,
    headers: { 'X-Cache': 'MISS' },
  });
}
