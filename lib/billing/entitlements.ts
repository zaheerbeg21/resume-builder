import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface EntitlementRow {
  id: string;
  user_id: string;
  kind: string;
  starts_at: string;
  expires_at: string;
  stripe_session_id: string | null;
  status: 'active' | 'expired' | 'refunded' | 'disputed' | string;
}

export interface UserEntitlementStatus {
  hasActivePass: boolean;
  daysRemaining: number;
  entitlement: EntitlementRow | null;
}

let serviceRoleClientOverride: SupabaseClient | null = null;

export function setServiceRoleClientForTesting(client: SupabaseClient | null) {
  serviceRoleClientOverride = client;
}

/**
 * Creates an administrative Supabase client using the service role key.
 * Used exclusively for server-side webhook processing and privileged entitlement updates.
 */
export function getServiceRoleClient(): SupabaseClient {
  if (serviceRoleClientOverride) {
    return serviceRoleClientOverride;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'mock-service-role-key-secret';

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Server-side check for whether a user possesses an active 30-day pass.
 * Queries public.entitlements for status = 'active' and expires_at > now().
 */
export async function hasActivePass(
  userId: string,
  client?: SupabaseClient
): Promise<boolean> {
  if (!userId) return false;

  const supabase = client ?? getServiceRoleClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('entitlements')
    .select('id, expires_at, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', now)
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }

  return true;
}

/**
 * Retrieves the full entitlement status for a user, including days remaining.
 */
export async function getUserEntitlement(
  userId: string,
  client?: SupabaseClient
): Promise<UserEntitlementStatus> {
  if (!userId) {
    return { hasActivePass: false, daysRemaining: 0, entitlement: null };
  }

  const supabase = client ?? getServiceRoleClient();
  const { data, error } = await supabase
    .from('entitlements')
    .select('*')
    .eq('user_id', userId)
    .order('expires_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return { hasActivePass: false, daysRemaining: 0, entitlement: null };
  }

  const entitlement = data[0] as EntitlementRow;
  const nowMs = Date.now();
  const expiresMs = new Date(entitlement.expires_at).getTime();
  const isActive = entitlement.status === 'active' && expiresMs > nowMs;

  const daysRemaining = isActive
    ? Math.max(1, Math.ceil((expiresMs - nowMs) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    hasActivePass: isActive,
    daysRemaining,
    entitlement,
  };
}

/**
 * Records a Stripe event ID into the idempotency ledger (public.stripe_events).
 * Returns true if newly inserted, or false if the event was already processed (duplicate).
 */
export async function recordStripeEvent(
  eventId: string,
  eventType: string,
  client?: SupabaseClient
): Promise<boolean> {
  const supabase = client ?? getServiceRoleClient();

  // Check if event already exists
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing) {
    return false; // Already processed, duplicate event
  }

  const { error } = await supabase.from('stripe_events').insert({
    event_id: eventId,
    type: eventType,
  });

  if (error) {
    // Unique violation error code (23505) in PostgreSQL
    if (error.code === '23505' || error.message?.includes('duplicate key')) {
      return false;
    }
    throw new Error(`Failed to record stripe event: ${error.message}`);
  }

  return true;
}

/**
 * Provisions a 30-day all-access pass entitlement for a user upon completed checkout.
 */
export async function provisionPassEntitlement(
  params: {
    userId: string;
    stripeSessionId: string;
    startsAt?: Date;
    expiresAt?: Date;
  },
  client?: SupabaseClient
): Promise<EntitlementRow> {
  const supabase = client ?? getServiceRoleClient();

  const starts = params.startsAt ?? new Date();
  const expires =
    params.expiresAt ?? new Date(starts.getTime() + 30 * 24 * 60 * 60 * 1000);

  const newRow = {
    user_id: params.userId,
    kind: 'pass_30d',
    starts_at: starts.toISOString(),
    expires_at: expires.toISOString(),
    stripe_session_id: params.stripeSessionId,
    status: 'active',
  };

  const { data, error } = await supabase
    .from('entitlements')
    .insert(newRow)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to provision pass entitlement: ${error.message}`);
  }

  return data as EntitlementRow;
}

/**
 * Revokes an entitlement upon refund or dispute creation.
 */
export async function revokeEntitlement(
  params: {
    stripeSessionId?: string;
    userId?: string;
    status: 'refunded' | 'disputed';
  },
  client?: SupabaseClient
): Promise<number> {
  const supabase = client ?? getServiceRoleClient();

  let query = supabase
    .from('entitlements')
    .update({ status: params.status });

  if (params.stripeSessionId) {
    query = query.eq('stripe_session_id', params.stripeSessionId);
  } else if (params.userId) {
    query = query.eq('user_id', params.userId).eq('status', 'active');
  } else {
    throw new Error('revokeEntitlement requires either stripeSessionId or userId');
  }

  const { data, error } = await query.select();

  if (error) {
    throw new Error(`Failed to revoke entitlement: ${error.message}`);
  }

  return data ? data.length : 0;
}
