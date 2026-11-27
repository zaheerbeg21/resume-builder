import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';
import { getServiceRoleClient, hasActivePass } from '@/lib/billing/entitlements';
import { recordUsageEvent } from '@/lib/db/usage-events';
import {
  ProviderError,
  type GenerateResult,
  type LlmProvider,
} from '@/lib/ai/provider';
import { GeminiProvider } from '@/lib/ai/providers/gemini';
import {
  BULLET_OPTIMIZE_PROMPT_VERSION,
  BULLET_OPTIMIZE_SYSTEM_PROMPT,
  buildBulletPrompt,
} from '@/lib/ai/prompts/bullet-optimize';
import {
  BulletOptimizeInputSchema,
  BulletResultSchema,
  type BulletResult,
} from '@/lib/ai/schemas';
import { verifyZeroInventedDigits, verifyWordCount } from '@/lib/ai/guards';

export const PROMPT_VERSION = BULLET_OPTIMIZE_PROMPT_VERSION;

const SERVICE_UNAVAILABLE_MSG =
  'AI bullet optimization service is temporarily unavailable.';
const GUARD_FAILURE_MSG =
  'Could not generate a truth-verified rewrite. Please add concrete details or edit manually.';

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

function evaluateVariantGuards(
  result: BulletResult,
  rawBullet: string,
  userFacts?: string,
): string | null {
  const issues: string[] = [];

  for (const variant of result.variants) {
    if (!verifyZeroInventedDigits(rawBullet, variant.text, userFacts)) {
      issues.push(
        `Variant '${variant.style}' included digits not present in bullet_text or user_facts; replace missing figures with bracketed placeholders like [X%] and list them in placeholders_needed.`,
      );
    }
    if (!verifyWordCount(variant.text, 12, 32)) {
      issues.push(
        `Variant '${variant.style}' must be between 12 and 32 words (aim for 15 to 28 words).`,
      );
    }
  }

  return issues.length > 0 ? issues.join(' ') : null;
}

function mapProviderErrorResponse(err: unknown): NextResponse {
  if (err instanceof ProviderError) {
    if (err.kind === 'timeout') {
      return NextResponse.json(
        { error: 'AI bullet optimization request timed out. Please try again.' },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: 'AI bullet optimization failed. Please try again shortly.' },
      { status: 502 },
    );
  }
  return NextResponse.json({ error: SERVICE_UNAVAILABLE_MSG }, { status: 502 });
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
      { status: 400 },
    );
  }

  // 3. Resolve LLM provider (fail closed with 503 if unconfigured)
  let provider: LlmProvider;
  try {
    provider = resolveDefaultProvider();
  } catch {
    return NextResponse.json({ error: SERVICE_UNAVAILABLE_MSG }, { status: 503 });
  }

  // 4. Enforce per-user rate limit and AI quota (fail closed on DB errors)
  let admin: ReturnType<typeof getServiceRoleClient>;
  try {
    admin = getServiceRoleClient();
  } catch {
    return NextResponse.json({ error: SERVICE_UNAVAILABLE_MSG }, { status: 503 });
  }

  const sixtySecondsAgoIso = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount, error: rateLimitError } = await admin
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', sixtySecondsAgoIso);

  if (rateLimitError) {
    return NextResponse.json({ error: SERVICE_UNAVAILABLE_MSG }, { status: 503 });
  }

  if ((recentCount ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  let isPassActive = false;
  try {
    isPassActive = await hasActivePass(user.id, admin);
  } catch {
    return NextResponse.json({ error: SERVICE_UNAVAILABLE_MSG }, { status: 503 });
  }

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
    return NextResponse.json({ error: SERVICE_UNAVAILABLE_MSG }, { status: 503 });
  }

  if ((quotaCount ?? 0) >= quotaLimit) {
    return NextResponse.json(
      { error: 'AI quota limit reached.' },
      { status: 429 },
    );
  }

  // 5. Generate bullet variants via LlmProvider with single guard-failure retry (never log bullet text)
  const input = parseResult.data;
  let generation: GenerateResult<BulletResult>;
  try {
    generation = await provider.generateStructured({
      systemPrompt: BULLET_OPTIMIZE_SYSTEM_PROMPT,
      prompt: buildBulletPrompt(input),
      schema: BulletResultSchema,
    });
  } catch (err: unknown) {
    return mapProviderErrorResponse(err);
  }

  let totalLatencyMs = generation.latencyMs ?? 0;
  let inputTokens: number | null = generation.inputTokens ?? null;
  let outputTokens: number | null = generation.outputTokens ?? null;

  let guardFeedback = evaluateVariantGuards(
    generation.data,
    input.rawBullet,
    input.userFacts,
  );

  if (guardFeedback !== null) {
    let retryGeneration: GenerateResult<BulletResult>;
    try {
      retryGeneration = await provider.generateStructured({
        systemPrompt: BULLET_OPTIMIZE_SYSTEM_PROMPT,
        prompt: buildBulletPrompt(input, guardFeedback),
        schema: BulletResultSchema,
      });
    } catch (err: unknown) {
      return mapProviderErrorResponse(err);
    }

    totalLatencyMs += retryGeneration.latencyMs ?? 0;
    if (retryGeneration.inputTokens != null) {
      inputTokens = (inputTokens ?? 0) + retryGeneration.inputTokens;
    }
    if (retryGeneration.outputTokens != null) {
      outputTokens = (outputTokens ?? 0) + retryGeneration.outputTokens;
    }

    generation = retryGeneration;
    guardFeedback = evaluateVariantGuards(
      generation.data,
      input.rawBullet,
      input.userFacts,
    );
  }

  // 6. Record exactly 1 telemetry row per user request
  await recordUsageEvent(
    {
      userId: user.id,
      route: '/api/ai/bullet-optimize',
      provider: generation.provider,
      model: generation.model,
      latencyMs: totalLatencyMs,
      inputTokens,
      outputTokens,
      estCostUsd: null,
    },
    { adminClient: admin },
  );

  if (guardFeedback !== null) {
    return NextResponse.json({ error: GUARD_FAILURE_MSG }, { status: 422 });
  }

  return NextResponse.json(generation.data, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
