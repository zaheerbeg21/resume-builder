import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/billing/entitlements';

export interface RecordUsageEventParams {
  userId?: string | null;
  route: string;
  provider: string;
  model: string;
  failedOverFrom?: string | null;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estCostUsd?: number | null;
}

export interface UsageEventRecord {
  id: number;
  user_id: string | null;
  route: string;
  provider: string;
  model: string;
  failed_over_from: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  est_cost_usd: number | null;
  created_at?: string;
}

/**
 * Persists an AI telemetry record to public.usage_events via the administrative client.
 * Non-blocking: catches and logs errors so telemetry failure never breaks the user flow.
 */
export async function recordUsageEvent(
  params: RecordUsageEventParams,
  options?: { adminClient?: SupabaseClient },
): Promise<void> {
  const admin = options?.adminClient ?? getServiceRoleClient();
  try {
    const { error } = await admin.from('usage_events').insert({
      user_id: params.userId ?? null,
      route: params.route,
      provider: params.provider,
      model: params.model,
      failed_over_from: params.failedOverFrom ?? null,
      latency_ms: params.latencyMs ?? null,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      est_cost_usd: params.estCostUsd ?? null,
    });

    if (error) {
      console.error('Failed to insert usage event:', error.message);
    }
  } catch (err) {
    console.error('Unexpected exception recording usage event:', err);
  }
}
