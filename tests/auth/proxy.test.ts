import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy, config } from '../../proxy';
import { GET as authCallbackHandler } from '../../app/(auth)/callback/route';
import * as ssr from '@supabase/ssr';
import * as supabaseServer from '@/lib/db/supabase-server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
  createBrowserClient: vi.fn(),
}));

interface MockCookie {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

describe('Next.js 16 Proxy Convention & Route Protection (T-006)', () => {
  let mockGetUser: ReturnType<typeof vi.fn>;
  let mockSetAllCookies: (cookies: MockCookie[]) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });

    vi.mocked(ssr.createServerClient).mockImplementation((_url, _key, options) => {
      mockSetAllCookies = (cookies: MockCookie[]) => {
        if (options && 'cookies' in options && options.cookies && 'setAll' in options.cookies) {
          (options.cookies as { setAll?: (c: MockCookie[]) => void }).setAll?.(cookies);
        }
      };

      return {
        auth: {
          getUser: mockGetUser,
        },
      } as unknown as ReturnType<typeof ssr.createServerClient>;
    });
  });

  describe('Config Matcher Validation', () => {
    it('defines the correct matcher array covering protected and auth routes', () => {
      expect(config.matcher).toBeDefined();
      expect(config.matcher).toEqual([
        '/dashboard/:path*',
        '/resumes/:path*',
        '/billing/:path*',
        '/login',
        '/register',
      ]);
    });
  });

  describe('Unauthenticated Request Handling', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
    });

    it('redirects unauthenticated requests to /dashboard with 307 and returnTo query', async () => {
      const request = new NextRequest('http://localhost:3000/dashboard');
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toBeDefined();

      const redirectUrl = new URL(location!);
      expect(redirectUrl.pathname).toBe('/login');
      expect(redirectUrl.searchParams.get('returnTo')).toBe('/dashboard');
    });

    it('redirects nested protected paths /resumes/edit-123 with preserved returnTo', async () => {
      const request = new NextRequest('http://localhost:3000/resumes/edit-123');
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/login');
      expect(redirectUrl.searchParams.get('returnTo')).toBe('/resumes/edit-123');
    });

    it('redirects /billing with 307 to login', async () => {
      const request = new NextRequest('http://localhost:3000/billing');
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/login');
      expect(redirectUrl.searchParams.get('returnTo')).toBe('/billing');
    });

    it('preserves query parameters in returnTo', async () => {
      const request = new NextRequest('http://localhost:3000/resumes?template=standard&sort=date');
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/login');
      expect(redirectUrl.searchParams.get('returnTo')).toBe('/resumes?template=standard&sort=date');
    });

    it('allows unauthenticated requests to pass through to /login without redirect', async () => {
      const request = new NextRequest('http://localhost:3000/login');
      const response = await proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('allows unauthenticated requests to pass through to /register without redirect', async () => {
      const request = new NextRequest('http://localhost:3000/register');
      const response = await proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('Authenticated Request Handling', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'mock-user-uuid',
            email: 'user@example.com',
          },
        },
        error: null,
      });
    });

    it('allows authenticated requests to pass through to /dashboard', async () => {
      const request = new NextRequest('http://localhost:3000/dashboard');
      const response = await proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('allows authenticated requests to pass through to /resumes/123/edit', async () => {
      const request = new NextRequest('http://localhost:3000/resumes/123/edit');
      const response = await proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('allows authenticated requests to pass through to /billing', async () => {
      const request = new NextRequest('http://localhost:3000/billing');
      const response = await proxy(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('redirects authenticated requests visiting /login to /dashboard', async () => {
      const request = new NextRequest('http://localhost:3000/login');
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/dashboard');
    });

    it('redirects authenticated requests visiting /register to /dashboard', async () => {
      const request = new NextRequest('http://localhost:3000/register');
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/dashboard');
    });
  });

  describe('Session Cookie Refresh Handling in Proxy', () => {
    it('sets refreshed session cookies on the response', async () => {
      mockGetUser.mockImplementation(async () => {
        mockSetAllCookies([
          {
            name: 'sb-access-token',
            value: 'refreshed-token-123',
            options: { path: '/', httpOnly: true },
          },
        ]);
        return {
          data: { user: { id: 'user-1', email: 'user@example.com' } },
          error: null,
        };
      });

      const request = new NextRequest('http://localhost:3000/dashboard');
      const response = await proxy(request);

      expect(response.status).toBe(200);
      const setCookie = response.cookies.get('sb-access-token');
      expect(setCookie).toBeDefined();
      expect(setCookie?.value).toBe('refreshed-token-123');
    });
  });

  describe('Auth Callback Route Handler (app/(auth)/callback/route.ts)', () => {
    let mockExchangeCodeForSession: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockExchangeCodeForSession = vi.fn();
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue({
        auth: {
          exchangeCodeForSession: mockExchangeCodeForSession,
        },
      } as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>);
    });

    it('exchanges code for session and redirects to default /dashboard on success', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });

      const request = new NextRequest('http://localhost:3000/callback?code=valid-auth-code');
      const response = await authCallbackHandler(request);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-auth-code');
      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/dashboard');
    });

    it('exchanges code for session and redirects to safe returnTo destination', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });

      const request = new NextRequest(
        'http://localhost:3000/callback?code=valid-code&returnTo=/resumes/target-456'
      );
      const response = await authCallbackHandler(request);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-code');
      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/resumes/target-456');
    });

    it('prevents open redirect vulnerabilities when returnTo has external domain', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });

      const request = new NextRequest(
        'http://localhost:3000/callback?code=valid-code&returnTo=https://evil.com/phishing'
      );
      const response = await authCallbackHandler(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.origin).toBe('http://localhost:3000');
      expect(redirectUrl.pathname).toBe('/dashboard');
    });

    it('prevents protocol-relative open redirect when returnTo starts with //', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ error: null });

      const request = new NextRequest(
        'http://localhost:3000/callback?code=valid-code&returnTo=//attacker.com'
      );
      const response = await authCallbackHandler(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.origin).toBe('http://localhost:3000');
      expect(redirectUrl.pathname).toBe('/dashboard');
    });

    it('redirects to /login with error query when code exchange fails', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        error: new Error('Invalid authorization code'),
      });

      const request = new NextRequest('http://localhost:3000/callback?code=expired-code');
      const response = await authCallbackHandler(request);

      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/login');
      expect(redirectUrl.searchParams.get('error')).toBe('auth_callback_failed');
    });

    it('redirects to /login with error query when code query parameter is missing', async () => {
      const request = new NextRequest('http://localhost:3000/callback');
      const response = await authCallbackHandler(request);

      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
      expect(response.status).toBe(307);
      const redirectUrl = new URL(response.headers.get('location')!);
      expect(redirectUrl.pathname).toBe('/login');
      expect(redirectUrl.searchParams.get('error')).toBe('auth_callback_failed');
    });
  });
});
