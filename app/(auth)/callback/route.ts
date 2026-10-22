import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/db/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const returnTo = searchParams.get('returnTo') || '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Validate relative returnTo path to prevent open redirect vulnerabilities
      const target =
        returnTo.startsWith('/') && !returnTo.startsWith('//')
          ? returnTo
          : '/dashboard';
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  // If code exchange failed or no code was provided, redirect to login with error query
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
