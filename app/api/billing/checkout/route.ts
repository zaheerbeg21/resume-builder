import { NextResponse } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';
import { createCheckoutSession } from '@/lib/billing/stripe';

/**
 * POST /api/billing/checkout
 * Authenticates user session, creates a one-time $19 30-day pass Stripe Checkout Session,
 * and returns { url: session.url }.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const origin =
      request.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';

    const session = await createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      appUrl: origin,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
