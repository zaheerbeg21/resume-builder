'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/db/supabase-client';
import { OAuthButtons } from './OAuthButtons';
import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  sanitizeReturnTo,
} from './validation';

interface RegisterFormProps {
  initialReturnTo?: string;
}

export function RegisterForm({ initialReturnTo }: RegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryReturnTo = searchParams?.get('returnTo') || initialReturnTo;
  const returnTo = sanitizeReturnTo(queryReturnTo);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailBlur = () => {
    setEmailError(validateEmail(email));
  };

  const handlePasswordBlur = () => {
    setPasswordError(validatePassword(password));
  };

  const handleConfirmBlur = () => {
    setConfirmError(validateConfirmPassword(password, confirmPassword));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    const confirmErr = validateConfirmPassword(password, confirmPassword);

    setEmailError(emailErr);
    setPasswordError(passwordErr);
    setConfirmError(confirmErr);

    if (emailErr || passwordErr || confirmErr) {
      return;
    }

    try {
      setIsLoading(true);
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const emailRedirectTo = `${origin}/callback?returnTo=${encodeURIComponent(returnTo)}`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        setIsLoading(false);
        setFormError(error.message);
        return;
      }

      setIsLoading(false);

      if (data.session) {
        // Immediate login / no email confirmation requirement
        if (typeof window !== 'undefined') {
          window.location.assign(returnTo);
        } else {
          router.push(returnTo);
        }
      } else {
        // Confirmation email dispatched
        setSuccessMessage(
          'Registration successful! Please check your email inbox to verify your account before signing in.'
        );
      }
    } catch (err: unknown) {
      setIsLoading(false);
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setFormError(message);
    }
  };

  const loginHref = returnTo !== '/dashboard'
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/login';

  return (
    <div className="w-full space-y-6">
      {formError && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/40 dark:border-red-900/50 dark:text-red-300"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
            <span>{formError}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-3.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg dark:bg-emerald-950/40 dark:border-emerald-900/50 dark:text-emerald-300"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      <OAuthButtons returnTo={returnTo} onError={setFormError} disabled={isLoading} />

      <div className="relative flex items-center justify-center">
        <div className="border-t border-slate-200 dark:border-neutral-800 w-full" />
        <span className="bg-white dark:bg-neutral-900 px-3 text-xs uppercase tracking-wider text-slate-500 dark:text-neutral-400 font-medium">
          Or register with email
        </span>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="register-email"
            className="block text-sm font-medium text-slate-700 dark:text-neutral-200 mb-1"
          >
            Email address
          </label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            onBlur={handleEmailBlur}
            disabled={isLoading}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'register-email-error' : undefined}
            placeholder="you@example.com"
            className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white dark:bg-neutral-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 transition-colors focus:outline-none focus:ring-2 ${
              emailError
                ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                : 'border-slate-300 dark:border-neutral-700 focus:ring-slate-900 dark:focus:ring-neutral-400'
            }`}
          />
          {emailError && (
            <p id="register-email-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {emailError}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="register-password"
            className="block text-sm font-medium text-slate-700 dark:text-neutral-200 mb-1"
          >
            Password (min 8 characters)
          </label>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(null);
            }}
            onBlur={handlePasswordBlur}
            disabled={isLoading}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? 'register-password-error' : undefined}
            placeholder="••••••••"
            className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white dark:bg-neutral-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 transition-colors focus:outline-none focus:ring-2 ${
              passwordError
                ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                : 'border-slate-300 dark:border-neutral-700 focus:ring-slate-900 dark:focus:ring-neutral-400'
            }`}
          />
          {passwordError && (
            <p id="register-password-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {passwordError}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="register-confirm-password"
            className="block text-sm font-medium text-slate-700 dark:text-neutral-200 mb-1"
          >
            Confirm Password
          </label>
          <input
            id="register-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (confirmError) setConfirmError(null);
            }}
            onBlur={handleConfirmBlur}
            disabled={isLoading}
            aria-invalid={Boolean(confirmError)}
            aria-describedby={confirmError ? 'register-confirm-error' : undefined}
            placeholder="••••••••"
            className={`w-full px-3.5 py-2 text-sm rounded-lg border bg-white dark:bg-neutral-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 transition-colors focus:outline-none focus:ring-2 ${
              confirmError
                ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                : 'border-slate-300 dark:border-neutral-700 focus:ring-slate-900 dark:focus:ring-neutral-400'
            }`}
          />
          {confirmError && (
            <p id="register-confirm-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {confirmError}
            </p>
          )}
        </div>

        <button
          type="submit"
          id="register-submit-button"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-slate-800 dark:hover:bg-neutral-100 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 dark:focus:ring-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-xs"
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin h-4 w-4 text-white dark:text-neutral-900"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Creating account...</span>
            </>
          ) : (
            <span>Create account</span>
          )}
        </button>
      </form>

      <div className="text-center text-sm text-slate-600 dark:text-neutral-400">
        Already have an account?{' '}
        <Link
          href={loginHref}
          className="font-medium text-slate-900 dark:text-white hover:underline focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-neutral-400 rounded-sm"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
