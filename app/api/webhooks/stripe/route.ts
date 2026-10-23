import { NextResponse } from 'next/server';
import {
  verifyWebhookSignature,
  type StripeEvent,
  type StripeSessionObject,
  type StripeChargeObject,
} from '@/lib/billing/stripe';
import {
  recordStripeEvent,
  provisionPassEntitlement,
  revokeEntitlement,
} from '@/lib/billing/entitlements';

/**
 * POST /api/webhooks/stripe
 * Stripe webhook receiver.
 * - Verifies raw request signature using STRIPE_WEBHOOK_SECRET.
 * - Idempotency guard: records event.id in stripe_events, skips if duplicate.
 * - On checkout.session.completed: creates active 30-day pass in entitlements.
 * - On charge.refunded / charge.dispute.created: revokes entitlement ('refunded'/'disputed').
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET is not configured' },
      { status: 500 }
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: 'Could not read request body' },
      { status: 400 }
    );
  }

  const signatureHeader = request.headers.get('stripe-signature');

  let event: StripeEvent;
  try {
    event = verifyWebhookSignature(rawBody, signatureHeader, secret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Idempotency check: insert event_id into public.stripe_events
  try {
    const isNewEvent = await recordStripeEvent(event.id, event.type);
    if (!isNewEvent) {
      // Event has already been processed successfully; return 200 immediately
      return NextResponse.json(
        { received: true, duplicate: true },
        { status: 200 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Idempotency failure';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Handle specific Stripe lifecycle events
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as unknown as StripeSessionObject;
        const userId =
          session.client_reference_id || session.metadata?.userId;

        if (userId) {
          await provisionPassEntitlement({
            userId,
            stripeSessionId: session.id,
          });
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as unknown as StripeChargeObject;
        const sessionId =
          charge.metadata?.sessionId || charge.metadata?.stripe_session_id;
        const userId =
          charge.client_reference_id || charge.metadata?.userId;

        await revokeEntitlement({
          stripeSessionId: sessionId,
          userId,
          status: 'refunded',
        });
        break;
      }

      case 'charge.dispute.created': {
        const charge = event.data.object as unknown as StripeChargeObject;
        const sessionId =
          charge.metadata?.sessionId || charge.metadata?.stripe_session_id;
        const userId =
          charge.client_reference_id || charge.metadata?.userId;

        await revokeEntitlement({
          stripeSessionId: sessionId,
          userId,
          status: 'disputed',
        });
        break;
      }

      default:
        // Other events acknowledged without side-effects
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Webhook handler execution failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
