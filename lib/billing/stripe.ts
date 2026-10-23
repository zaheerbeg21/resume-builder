import crypto from 'node:crypto';

export interface StripeCheckoutSessionParams {
  userId: string;
  userEmail?: string;
  appUrl?: string;
}

export interface StripeCheckoutSessionResult {
  id: string;
  url: string;
}

export interface StripeEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  data: {
    object: T;
  };
  created?: number;
}

export interface StripeSessionObject {
  id: string;
  client_reference_id?: string | null;
  customer_email?: string | null;
  payment_status?: string;
  status?: string;
  metadata?: Record<string, string>;
}

export interface StripeChargeObject {
  id: string;
  payment_intent?: string | null;
  customer?: string | null;
  status?: string;
  metadata?: Record<string, string>;
  client_reference_id?: string | null;
}

// Configurable mock handler for unit test overrides
let mockCheckoutHandler:
  | ((params: StripeCheckoutSessionParams) => Promise<StripeCheckoutSessionResult>)
  | null = null;

export function setMockStripeHandler(
  handler: ((params: StripeCheckoutSessionParams) => Promise<StripeCheckoutSessionResult>) | null
) {
  mockCheckoutHandler = handler;
}

/**
 * Creates a Stripe Checkout Session for the one-time $19 30-day pass.
 * Strictly one-time payment (mode: 'payment', no recurring subscription).
 */
export async function createCheckoutSession(
  params: StripeCheckoutSessionParams
): Promise<StripeCheckoutSessionResult> {
  if (mockCheckoutHandler) {
    return mockCheckoutHandler(params);
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl =
    params.appUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000';

  // Fallback for offline unit test execution without hitting live Stripe API
  if (!stripeSecretKey || stripeSecretKey.startsWith('sk_test_dummy') || stripeSecretKey.startsWith('sk_test_mock')) {
    const mockSessionId = `cs_test_${crypto.randomUUID()}`;
    return {
      id: mockSessionId,
      url: `https://checkout.stripe.com/c/pay/${mockSessionId}`,
    };
  }

  const formData = new URLSearchParams();
  formData.append('mode', 'payment');
  formData.append('payment_method_types[0]', 'card');
  formData.append('line_items[0][price_data][currency]', 'usd');
  formData.append('line_items[0][price_data][product_data][name]', '30-Day All-Access Pass');
  formData.append(
    'line_items[0][price_data][product_data][description]',
    '30 days of unlimited ATS PDF exports, JD targeting, and AI bullet optimizations'
  );
  formData.append('line_items[0][price_data][unit_amount]', '1900'); // $19.00 USD
  formData.append('line_items[0][quantity]', '1');
  formData.append('client_reference_id', params.userId);
  formData.append('metadata[userId]', params.userId);
  formData.append('success_url', `${appUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`);
  formData.append('cancel_url', `${appUrl}/billing?canceled=true`);

  if (params.userEmail) {
    formData.append('customer_email', params.userEmail);
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Stripe API error: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as { id: string; url: string };
  return {
    id: data.id,
    url: data.url,
  };
}

/**
 * Computes a standard Stripe HMAC-SHA256 signature header for testing & verification.
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

/**
 * Verifies raw request signature using STRIPE_WEBHOOK_SECRET.
 * Enforces constant-time comparison and timestamp tolerance (default 300s).
 */
export function verifyWebhookSignature<T = Record<string, unknown>>(
  payload: string,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds: number = 300
): StripeEvent<T> {
  if (!signatureHeader) {
    throw new Error('Missing stripe-signature header');
  }

  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  const parts = signatureHeader.split(',');
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.trim().split('=');
    if (key === 't' && value) {
      timestamp = parseInt(value, 10);
    } else if (key === 'v1' && value) {
      signatures.push(value);
    }
  }

  if (timestamp === null || Number.isNaN(timestamp)) {
    throw new Error('Invalid stripe-signature header: missing or invalid timestamp');
  }

  if (signatures.length === 0) {
    throw new Error('Invalid stripe-signature header: no v1 signature present');
  }

  // Tolerance check against replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    throw new Error(`Webhook timestamp outside tolerance zone (${toleranceSeconds}s)`);
  }

  const signedPayload = `${timestamp}.${payload}`;
  const computedHash = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const computedBuffer = Buffer.from(computedHash, 'utf8');

  let signatureValid = false;
  for (const signature of signatures) {
    const sigBuffer = Buffer.from(signature, 'utf8');
    if (sigBuffer.length === computedBuffer.length && crypto.timingSafeEqual(sigBuffer, computedBuffer)) {
      signatureValid = true;
      break;
    }
  }

  if (!signatureValid) {
    throw new Error('Stripe webhook signature verification failed');
  }

  try {
    return JSON.parse(payload) as StripeEvent<T>;
  } catch {
    throw new Error('Failed to parse webhook JSON payload');
  }
}
