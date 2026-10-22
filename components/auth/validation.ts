import { z } from 'zod';

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validates email address syntax using Zod 4 z.email().
 */
export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return 'Email is required.';
  }

  const result = z.email().safeParse(trimmed);
  if (!result.success) {
    return 'Please enter a valid email address.';
  }

  return null;
}

/**
 * Validates password meets the minimum requirement of 8 characters.
 */
export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Password is required.';
  }

  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  return null;
}

/**
 * Validates that confirmPassword matches password.
 */
export function validateConfirmPassword(
  password: string,
  confirmPassword: string
): string | null {
  if (!confirmPassword) {
    return 'Please confirm your password.';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }

  return null;
}

/**
 * Validates and sanitizes the returnTo URL to prevent open redirect vulnerabilities.
 * Only allows relative paths starting with a single leading slash.
 */
export function sanitizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) return '/dashboard';

  const trimmed = returnTo.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  return '/dashboard';
}

/**
 * Formats the OAuth redirect URL with the sanitized returnTo query.
 */
export function getOAuthRedirectUrl(origin: string, returnTo?: string | null): string {
  const target = sanitizeReturnTo(returnTo);
  return `${origin}/callback?returnTo=${encodeURIComponent(target)}`;
}
