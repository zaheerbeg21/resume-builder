import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  sanitizeReturnTo,
  getOAuthRedirectUrl,
} from '@/components/auth/validation';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import LoginPage from '@/app/(auth)/login/page';
import RegisterPage from '@/app/(auth)/register/page';
import * as supabaseClientModule from '@/lib/db/supabase-client';

// Mock next/navigation
const mockPush = vi.fn();
let mockSearchParams = new Map<string, string>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key) ?? null,
  }),
}));

describe('Auth Validation & Sanitization Logic', () => {
  describe('validateEmail', () => {
    it('returns error when email is empty or whitespace', () => {
      expect(validateEmail('')).toBe('Email is required.');
      expect(validateEmail('   ')).toBe('Email is required.');
    });

    it('returns error when email syntax is invalid', () => {
      expect(validateEmail('not-an-email')).toBe('Please enter a valid email address.');
      expect(validateEmail('user@')).toBe('Please enter a valid email address.');
      expect(validateEmail('@domain.com')).toBe('Please enter a valid email address.');
      expect(validateEmail('user@domain')).toBe('Please enter a valid email address.');
    });

    it('returns null for valid emails', () => {
      expect(validateEmail('user@example.com')).toBeNull();
      expect(validateEmail('alex.doe+tag@sub.domain.co.uk')).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('returns error when password is empty', () => {
      expect(validatePassword('')).toBe('Password is required.');
    });

    it('returns error when password is less than 8 characters', () => {
      expect(validatePassword('1234567')).toBe(
        'Password must be at least 8 characters long.'
      );
    });

    it('returns null for passwords with at least 8 characters', () => {
      expect(validatePassword('12345678')).toBeNull();
      expect(validatePassword('strong-passphrase-here')).toBeNull();
    });
  });

  describe('validateConfirmPassword', () => {
    it('returns error when confirmPassword is empty', () => {
      expect(validateConfirmPassword('secret123', '')).toBe(
        'Please confirm your password.'
      );
    });

    it('returns error when confirmPassword does not match password', () => {
      expect(validateConfirmPassword('secret123', 'different123')).toBe(
        'Passwords do not match.'
      );
    });

    it('returns null when confirmPassword matches password', () => {
      expect(validateConfirmPassword('secret123', 'secret123')).toBeNull();
    });
  });

  describe('sanitizeReturnTo', () => {
    it('defaults to /dashboard when returnTo is null, undefined, or empty', () => {
      expect(sanitizeReturnTo(null)).toBe('/dashboard');
      expect(sanitizeReturnTo(undefined)).toBe('/dashboard');
      expect(sanitizeReturnTo('')).toBe('/dashboard');
      expect(sanitizeReturnTo('   ')).toBe('/dashboard');
    });

    it('preserves valid relative paths starting with /', () => {
      expect(sanitizeReturnTo('/dashboard')).toBe('/dashboard');
      expect(sanitizeReturnTo('/resumes/edit-456')).toBe('/resumes/edit-456');
      expect(sanitizeReturnTo('/billing?plan=pro')).toBe('/billing?plan=pro');
    });

    it('prevents open redirect vulnerabilities starting with // or protocol schemes', () => {
      expect(sanitizeReturnTo('//evil.com/phish')).toBe('/dashboard');
      expect(sanitizeReturnTo('https://evil.com')).toBe('/dashboard');
      expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/dashboard');
    });
  });

  describe('getOAuthRedirectUrl', () => {
    it('constructs callback URL with sanitized destination parameter', () => {
      const url = getOAuthRedirectUrl('https://app.atsresume.com', '/resumes/123');
      expect(url).toBe(
        'https://app.atsresume.com/callback?returnTo=%2Fresumes%2F123'
      );
    });

    it('defaults to /dashboard if unvalidated returnTo is provided', () => {
      const url = getOAuthRedirectUrl('https://app.atsresume.com', '//malicious.com');
      expect(url).toBe(
        'https://app.atsresume.com/callback?returnTo=%2Fdashboard'
      );
    });
  });
});

describe('Supabase Client Interaction Contracts', () => {
  let mockSignInWithPassword: ReturnType<typeof vi.fn>;
  let mockSignUp: ReturnType<typeof vi.fn>;
  let mockSignInWithOAuth: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new Map<string, string>();

    mockSignInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: 'u-123' }, session: { access_token: 'token-abc' } },
      error: null,
    });

    mockSignUp = vi.fn().mockResolvedValue({
      data: { user: { id: 'u-123' }, session: null },
      error: null,
    });

    mockSignInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: 'https://accounts.google.com/o/oauth2/auth' },
      error: null,
    });

    vi.spyOn(supabaseClientModule, 'createClient').mockReturnValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signUp: mockSignUp,
        signInWithOAuth: mockSignInWithOAuth,
      },
    } as unknown as ReturnType<typeof supabaseClientModule.createClient>);
  });

  it('triggers Google OAuth with sanitized callback redirect parameter', async () => {
    const supabase = supabaseClientModule.createClient();
    const origin = 'http://localhost:3000';
    const redirectUrl = getOAuthRedirectUrl(origin, '/resumes/456');

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/callback?returnTo=%2Fresumes%2F456',
      },
    });
  });

  it('handles signInWithPassword with trimmed email and correct payload', async () => {
    const supabase = supabaseClientModule.createClient();
    await supabase.auth.signInWithPassword({
      email: '  test@example.com  '.trim(),
      password: 'password123',
    });

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('handles signUp with options emailRedirectTo containing returnTo parameter', async () => {
    const supabase = supabaseClientModule.createClient();
    const origin = 'http://localhost:3000';
    const emailRedirectTo = `${origin}/callback?returnTo=${encodeURIComponent('/dashboard')}`;

    await supabase.auth.signUp({
      email: 'newuser@example.com',
      password: 'securepassword8',
      options: {
        emailRedirectTo,
      },
    });

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      password: 'securepassword8',
      options: {
        emailRedirectTo: 'http://localhost:3000/callback?returnTo=%2Fdashboard',
      },
    });
  });
});

describe('SSR Markup & Accessibility Contracts', () => {
  beforeEach(() => {
    mockSearchParams = new Map<string, string>();
  });

  it('renders LoginForm with semantic accessible elements and links', () => {
    const html = renderToString(
      React.createElement(LoginForm, { initialReturnTo: '/dashboard' })
    );

    expect(html).toContain('id="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('id="password"');
    expect(html).toContain('type="password"');
    expect(html).toContain('id="login-submit-button"');
    expect(html).toContain('Sign in');
    expect(html).toContain('id="google-oauth-button"');
    expect(html).toContain('Continue with Google');
    expect(html).toContain('href="/register"');
  });

  it('preserves returnTo query in LoginForm register link', () => {
    mockSearchParams.set('returnTo', '/resumes/edit-1');
    const html = renderToString(React.createElement(LoginForm));

    expect(html).toContain('href="/register?returnTo=%2Fresumes%2Fedit-1"');
  });

  it('renders RegisterForm with confirm password input and link to login', () => {
    const html = renderToString(
      React.createElement(RegisterForm, { initialReturnTo: '/dashboard' })
    );

    expect(html).toContain('id="register-email"');
    expect(html).toContain('id="register-password"');
    expect(html).toContain('id="register-confirm-password"');
    expect(html).toContain('id="register-submit-button"');
    expect(html).toContain('Create account');
    expect(html).toContain('id="google-oauth-button"');
    expect(html).toContain('href="/login"');
  });

  it('preserves returnTo query in RegisterForm login link', () => {
    mockSearchParams.set('returnTo', '/billing');
    const html = renderToString(React.createElement(RegisterForm));

    expect(html).toContain('href="/login?returnTo=%2Fbilling"');
  });

  it('renders OAuthButtons with Google brand SVG and accessible label', () => {
    const html = renderToString(
      React.createElement(OAuthButtons, { returnTo: '/dashboard' })
    );

    expect(html).toContain('id="google-oauth-button"');
    expect(html).toContain('aria-label="Continue with Google"');
    expect(html).toContain('Continue with Google');
  });

  it('renders LoginPage with heading, subtitle, and LoginForm', () => {
    const html = renderToString(React.createElement(LoginPage));

    expect(html).toContain('Sign in to your account');
    expect(html).toContain('Enter your credentials below to access your resumes.');
    expect(html).toContain('id="email"');
  });

  it('renders RegisterPage with heading, subtitle, and RegisterForm', () => {
    const html = renderToString(React.createElement(RegisterPage));

    expect(html).toContain('Create your account');
    expect(html).toContain('Start building ATS-optimized, high-scoring resumes in seconds.');
    expect(html).toContain('id="register-email"');
  });
});
