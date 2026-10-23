import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  generateWebhookSignature,
  verifyWebhookSignature,
  createCheckoutSession,
  setMockStripeHandler,
  type StripeEvent,
  type StripeSessionObject,
} from '@/lib/billing/stripe';
import {
  hasActivePass,
  getUserEntitlement,
  recordStripeEvent,
  provisionPassEntitlement,
  revokeEntitlement,
  setServiceRoleClientForTesting,
  type EntitlementRow,
} from '@/lib/billing/entitlements';
import { POST as checkoutRoute } from '@/app/api/billing/checkout/route';
import { POST as webhookRoute } from '@/app/api/webhooks/stripe/route';
import { BillingView } from '@/components/billing/BillingView';
import * as supabaseServer from '@/lib/db/supabase-server';

// In-memory database simulation for unit testing
interface StripeEventRow {
  event_id: string;
  type: string;
  processed_at: string;
}

function createMockSupabase(initialEntitlements: EntitlementRow[] = []) {
  const entitlementsTable: EntitlementRow[] = [...initialEntitlements];
  const stripeEventsTable: StripeEventRow[] = [];

  const mockClient = {
    from: (table: string) => {
      if (table === 'entitlements') {
        return {
          select: () => {
            let filterUserId: string | null = null;
            let filterStatus: string | null = null;
            let filterGtExpiresAt: string | null = null;
            let orderAscending = false;
            let limitCount: number | null = null;

            const builder = {
              eq: (col: string, val: unknown) => {
                if (col === 'user_id') filterUserId = String(val);
                if (col === 'status') filterStatus = String(val);
                return builder;
              },
              gt: (col: string, val: unknown) => {
                if (col === 'expires_at') filterGtExpiresAt = String(val);
                return builder;
              },
              order: (_col: string, opts?: { ascending: boolean }) => {
                orderAscending = opts?.ascending ?? false;
                return builder;
              },
              limit: (cnt: number) => {
                limitCount = cnt;
                return builder;
              },
              then: (resolve: (val: { data: EntitlementRow[]; error: null }) => void) => {
                let res = [...entitlementsTable];
                if (filterUserId) res = res.filter((r) => r.user_id === filterUserId);
                if (filterStatus) res = res.filter((r) => r.status === filterStatus);
                if (filterGtExpiresAt) {
                  res = res.filter((r) => new Date(r.expires_at) > new Date(filterGtExpiresAt!));
                }
                res.sort((a, b) => {
                  const diff = new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
                  return orderAscending ? diff : -diff;
                });
                if (limitCount !== null) {
                  res = res.slice(0, limitCount);
                }
                resolve({ data: res, error: null });
              },
            };
            return builder;
          },
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const inserted: EntitlementRow = {
                  id: `ent_${Math.random().toString(36).substring(2, 9)}`,
                  user_id: String(row.user_id),
                  kind: String(row.kind),
                  starts_at: String(row.starts_at),
                  expires_at: String(row.expires_at),
                  stripe_session_id: row.stripe_session_id ? String(row.stripe_session_id) : null,
                  status: (row.status as EntitlementRow['status']) || 'active',
                };
                entitlementsTable.push(inserted);
                return { data: inserted, error: null };
              },
            }),
          }),
          update: (updates: Record<string, unknown>) => {
            let filterSessionId: string | null = null;
            let filterUserId: string | null = null;
            let filterStatus: string | null = null;

            const updateBuilder = {
              eq: (col: string, val: unknown) => {
                if (col === 'stripe_session_id') filterSessionId = String(val);
                if (col === 'user_id') filterUserId = String(val);
                if (col === 'status') filterStatus = String(val);
                return updateBuilder;
              },
              select: async () => {
                const matched: EntitlementRow[] = [];
                for (const row of entitlementsTable) {
                  let match = true;
                  if (filterSessionId && row.stripe_session_id !== filterSessionId) match = false;
                  if (filterUserId && row.user_id !== filterUserId) match = false;
                  if (filterStatus && row.status !== filterStatus) match = false;

                  if (match) {
                    if (updates.status) row.status = updates.status as EntitlementRow['status'];
                    matched.push({ ...row });
                  }
                }
                return { data: matched, error: null };
              },
            };
            return updateBuilder;
          },
        };
      }

      if (table === 'stripe_events') {
        return {
          select: () => ({
            eq: (_col: string, val: unknown) => ({
              maybeSingle: async () => {
                const found = stripeEventsTable.find((e) => e.event_id === val);
                return { data: found ?? null, error: null };
              },
            }),
          }),
          insert: async (record: { event_id: string; type: string }) => {
            const exists = stripeEventsTable.some((e) => e.event_id === record.event_id);
            if (exists) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              };
            }
            stripeEventsTable.push({
              event_id: record.event_id,
              type: record.type,
              processed_at: new Date().toISOString(),
            });
            return { data: record, error: null };
          },
        };
      }

      throw new Error(`Unhandled table in test mock: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { mockClient, entitlementsTable, stripeEventsTable };
}

describe('Stripe Billing & Entitlements Engine', () => {
  const TEST_SECRET = 'whsec_test_secret_for_unit_tests_123456';
  const USER_ID = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    vi.restoreAllMocks();
    setMockStripeHandler(null);
    setServiceRoleClientForTesting(null);
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_stripe_key';
    process.env.STRIPE_WEBHOOK_SECRET = TEST_SECRET;
  });

  describe('1. Webhook Signature Verification', () => {
    it('successfully verifies a valid HMAC-SHA256 signature', () => {
      const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
      const now = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(payload, TEST_SECRET, now);

      const parsed = verifyWebhookSignature(payload, signature, TEST_SECRET);
      expect(parsed.id).toBe('evt_1');
      expect(parsed.type).toBe('checkout.session.completed');
    });

    it('rejects tampered payload content', () => {
      const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
      const signature = generateWebhookSignature(payload, TEST_SECRET);
      const tamperedPayload = JSON.stringify({ id: 'evt_1', type: 'tampered.type' });

      expect(() => {
        verifyWebhookSignature(tamperedPayload, signature, TEST_SECRET);
      }).toThrow('Stripe webhook signature verification failed');
    });

    it('rejects an incorrect secret', () => {
      const payload = JSON.stringify({ id: 'evt_1' });
      const signature = generateWebhookSignature(payload, 'wrong_secret');

      expect(() => {
        verifyWebhookSignature(payload, signature, TEST_SECRET);
      }).toThrow('Stripe webhook signature verification failed');
    });

    it('rejects missing or malformed signature header', () => {
      const payload = JSON.stringify({ id: 'evt_1' });
      expect(() => {
        verifyWebhookSignature(payload, null, TEST_SECRET);
      }).toThrow('Missing stripe-signature header');

      expect(() => {
        verifyWebhookSignature(payload, 'invalid-format', TEST_SECRET);
      }).toThrow('Invalid stripe-signature header');
    });

    it('rejects signatures outside the 300s timestamp tolerance', () => {
      const payload = JSON.stringify({ id: 'evt_expired' });
      const staleTimestamp = Math.floor(Date.now() / 1000) - 350; // 350 seconds ago
      const signature = generateWebhookSignature(payload, TEST_SECRET, staleTimestamp);

      expect(() => {
        verifyWebhookSignature(payload, signature, TEST_SECRET, 300);
      }).toThrow(/timestamp outside tolerance zone/);
    });
  });

  describe('2. Idempotency & Stripe Events Ledger', () => {
    it('inserts new event and returns true, then returns false on duplicate event', async () => {
      const { mockClient } = createMockSupabase();

      const firstResult = await recordStripeEvent('evt_test_100', 'checkout.session.completed', mockClient);
      expect(firstResult).toBe(true);

      const secondResult = await recordStripeEvent('evt_test_100', 'checkout.session.completed', mockClient);
      expect(secondResult).toBe(false);
    });
  });

  describe('3. Entitlement Provisioning & Revocation', () => {
    it('provisions a 30-day active entitlement with correct expiry', async () => {
      const { mockClient, entitlementsTable } = createMockSupabase();
      const startTime = new Date();

      const record = await provisionPassEntitlement(
        {
          userId: USER_ID,
          stripeSessionId: 'cs_test_session_1',
          startsAt: startTime,
        },
        mockClient
      );

      expect(record.user_id).toBe(USER_ID);
      expect(record.status).toBe('active');
      expect(record.stripe_session_id).toBe('cs_test_session_1');

      const expectedExpiryMs = startTime.getTime() + 30 * 24 * 60 * 60 * 1000;
      expect(new Date(record.expires_at).getTime()).toBeCloseTo(expectedExpiryMs, -3);
      expect(entitlementsTable.length).toBe(1);
    });

    it('revokes entitlement on refund by stripeSessionId', async () => {
      const initial: EntitlementRow = {
        id: 'ent_1',
        user_id: USER_ID,
        kind: 'pass_30d',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        stripe_session_id: 'cs_session_refund_me',
        status: 'active',
      };
      const { mockClient, entitlementsTable } = createMockSupabase([initial]);

      const count = await revokeEntitlement(
        { stripeSessionId: 'cs_session_refund_me', status: 'refunded' },
        mockClient
      );

      expect(count).toBe(1);
      expect(entitlementsTable[0].status).toBe('refunded');
    });

    it('revokes entitlement on dispute by userId', async () => {
      const initial: EntitlementRow = {
        id: 'ent_2',
        user_id: USER_ID,
        kind: 'pass_30d',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        stripe_session_id: 'cs_dispute_me',
        status: 'active',
      };
      const { mockClient, entitlementsTable } = createMockSupabase([initial]);

      const count = await revokeEntitlement(
        { userId: USER_ID, status: 'disputed' },
        mockClient
      );

      expect(count).toBe(1);
      expect(entitlementsTable[0].status).toBe('disputed');
    });
  });

  describe('4. hasActivePass & getUserEntitlement', () => {
    it('returns true when user has active pass with future expiry', async () => {
      const futureDate = new Date(Date.now() + 15 * 86400000).toISOString();
      const { mockClient } = createMockSupabase([
        {
          id: 'ent_active',
          user_id: USER_ID,
          kind: 'pass_30d',
          starts_at: new Date().toISOString(),
          expires_at: futureDate,
          stripe_session_id: 'cs_1',
          status: 'active',
        },
      ]);

      const active = await hasActivePass(USER_ID, mockClient);
      expect(active).toBe(true);

      const status = await getUserEntitlement(USER_ID, mockClient);
      expect(status.hasActivePass).toBe(true);
      expect(status.daysRemaining).toBe(15);
    });

    it('returns false when pass is expired', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const { mockClient } = createMockSupabase([
        {
          id: 'ent_expired',
          user_id: USER_ID,
          kind: 'pass_30d',
          starts_at: new Date(Date.now() - 31 * 86400000).toISOString(),
          expires_at: pastDate,
          stripe_session_id: 'cs_2',
          status: 'active',
        },
      ]);

      const active = await hasActivePass(USER_ID, mockClient);
      expect(active).toBe(false);

      const status = await getUserEntitlement(USER_ID, mockClient);
      expect(status.hasActivePass).toBe(false);
      expect(status.daysRemaining).toBe(0);
    });

    it('returns false when pass is refunded or disputed', async () => {
      const futureDate = new Date(Date.now() + 10 * 86400000).toISOString();
      const { mockClient } = createMockSupabase([
        {
          id: 'ent_refunded',
          user_id: USER_ID,
          kind: 'pass_30d',
          starts_at: new Date().toISOString(),
          expires_at: futureDate,
          stripe_session_id: 'cs_3',
          status: 'refunded',
        },
      ]);

      const active = await hasActivePass(USER_ID, mockClient);
      expect(active).toBe(false);

      const status = await getUserEntitlement(USER_ID, mockClient);
      expect(status.hasActivePass).toBe(false);
    });

    it('returns false when user has no entitlements recorded', async () => {
      const { mockClient } = createMockSupabase([]);
      const active = await hasActivePass(USER_ID, mockClient);
      expect(active).toBe(false);

      const status = await getUserEntitlement(USER_ID, mockClient);
      expect(status.hasActivePass).toBe(false);
      expect(status.daysRemaining).toBe(0);
    });
  });

  describe('5. Checkout Route (/api/billing/checkout)', () => {
    it('returns 401 when user is not authenticated', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Unauthorized') }),
        },
      } as unknown as SupabaseClient);

      const request = new Request('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
      });

      const response = await checkoutRoute(request);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 200 with checkout URL when authenticated', async () => {
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: USER_ID, email: 'test@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClient);

      const request = new Request('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
      });

      const response = await checkoutRoute(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.url).toMatch(/https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
    });

    it('createCheckoutSession produces valid checkout session payload and honors mock handler', async () => {
      const session = await createCheckoutSession({
        userId: USER_ID,
        userEmail: 'user@example.com',
      });
      expect(session.id).toMatch(/^cs_test_/);
      expect(session.url).toContain(session.id);

      // Verify custom mock handler override
      setMockStripeHandler(async (params) => ({
        id: 'cs_custom_override',
        url: `https://checkout.stripe.com/override/${params.userId}`,
      }));

      const customSession = await createCheckoutSession({
        userId: USER_ID,
      });
      expect(customSession.id).toBe('cs_custom_override');
      expect(customSession.url).toContain(USER_ID);
    });
  });

  describe('6. Stripe Webhook Route (/api/webhooks/stripe)', () => {
    it('rejects requests without a signature with 400', async () => {
      const request = new Request('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({ id: 'evt_test' }),
      });

      const response = await webhookRoute(request);
      expect(response.status).toBe(400);
    });

    it('processes checkout.session.completed and provisions active pass', async () => {
      const { mockClient, entitlementsTable } = createMockSupabase();
      setServiceRoleClientForTesting(mockClient);

      const eventPayload: StripeEvent<StripeSessionObject> = {
        id: 'evt_checkout_done_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_session_xyz',
            client_reference_id: USER_ID,
            metadata: { userId: USER_ID },
            payment_status: 'paid',
          },
        },
      };

      const raw = JSON.stringify(eventPayload);
      const signature = generateWebhookSignature(raw, TEST_SECRET);

      const request = new Request('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
          'Content-Type': 'application/json',
        },
        body: raw,
      });

      const response = await webhookRoute(request);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.received).toBe(true);

      expect(entitlementsTable.length).toBe(1);
      expect(entitlementsTable[0].user_id).toBe(USER_ID);
      expect(entitlementsTable[0].status).toBe('active');
    });

    it('handles duplicate webhook events idempotently without double-provisioning', async () => {
      const { mockClient, entitlementsTable } = createMockSupabase();
      setServiceRoleClientForTesting(mockClient);

      const eventPayload: StripeEvent<StripeSessionObject> = {
        id: 'evt_duplicate_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_session_duplicate',
            client_reference_id: USER_ID,
          },
        },
      };

      const raw = JSON.stringify(eventPayload);
      const signature = generateWebhookSignature(raw, TEST_SECRET);

      // First webhook post
      const req1 = new Request('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: raw,
      });
      const res1 = await webhookRoute(req1);
      expect(res1.status).toBe(200);
      expect(entitlementsTable.length).toBe(1);

      // Duplicate webhook post
      const req2 = new Request('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: raw,
      });
      const res2 = await webhookRoute(req2);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.duplicate).toBe(true);

      // Must remain exactly 1 entitlement row
      expect(entitlementsTable.length).toBe(1);
    });

    it('handles charge.refunded by revoking entitlement', async () => {
      const initialPass: EntitlementRow = {
        id: 'ent_to_refund',
        user_id: USER_ID,
        kind: 'pass_30d',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        stripe_session_id: 'cs_refund_me',
        status: 'active',
      };
      const { mockClient, entitlementsTable } = createMockSupabase([initialPass]);
      setServiceRoleClientForTesting(mockClient);

      const refundPayload: StripeEvent = {
        id: 'evt_refund_1',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test_1',
            metadata: { sessionId: 'cs_refund_me' },
          },
        },
      };

      const raw = JSON.stringify(refundPayload);
      const signature = generateWebhookSignature(raw, TEST_SECRET);

      const request = new Request('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: raw,
      });

      const response = await webhookRoute(request);
      expect(response.status).toBe(200);
      expect(entitlementsTable[0].status).toBe('refunded');
    });
  });

  describe('7. BillingView UI Component', () => {
    it('renders active pass state with days remaining', () => {
      const html = renderToString(
        React.createElement(BillingView, {
          hasActivePass: true,
          daysRemaining: 23,
          expiresAt: '2026-11-15T00:00:00.000Z',
          userEmail: 'user@example.com',
        })
      );

      expect(html).toContain('Active Pass');
      expect(html).toContain('23 days remaining');
      expect(html).toContain('Unlimited ATS PDF Exports');
    });

    it('renders upgrade card with $19 trigger button when not active', () => {
      const html = renderToString(
        React.createElement(BillingView, {
          hasActivePass: false,
          daysRemaining: 0,
          expiresAt: null,
          userEmail: 'user@example.com',
        })
      );

      expect(html).toContain('Free Tier');
      expect(html).toContain('$19');
      expect(html).toContain('Get 30-Day Pass ($19)');
      expect(html).toContain('No recurring subscription');
    });

    it('renders success and canceled banners', () => {
      const successHtml = renderToString(
        React.createElement(BillingView, {
          hasActivePass: true,
          daysRemaining: 30,
          expiresAt: null,
          initialSuccess: true,
        })
      );
      expect(successHtml).toContain('Payment successful!');

      const canceledHtml = renderToString(
        React.createElement(BillingView, {
          hasActivePass: false,
          daysRemaining: 0,
          expiresAt: null,
          initialCanceled: true,
        })
      );
      expect(canceledHtml).toContain('Checkout canceled');
    });
  });
});
