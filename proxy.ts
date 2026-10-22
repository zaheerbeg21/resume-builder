import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'mock-anon-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname === '/register';
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/resumes') ||
    pathname.startsWith('/billing');

  if (!user && isProtectedRoute) {
    const returnTo = request.nextUrl.pathname + request.nextUrl.search;
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnTo', returnTo);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthRoute) {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/resumes/:path*', '/billing/:path*', '/login', '/register'],
};
