'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface BillingViewProps {
  hasActivePass: boolean;
  daysRemaining: number;
  expiresAt: string | null;
  userEmail?: string;
  initialSuccess?: boolean;
  initialCanceled?: boolean;
}

export function BillingView({
  hasActivePass,
  daysRemaining,
  expiresAt,
  userEmail,
  initialSuccess = false,
  initialCanceled = false,
}: BillingViewProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formattedExpiresAt = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleCheckout = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start checkout session');
      }

      const { url } = (await response.json()) as { url: string };
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned from server');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Navigation Breadcrumb / Back */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="mr-1">&larr;</span> Back to Dashboard
        </Link>
      </div>

      {/* Page Header */}
      <div className="pb-6 mb-8 border-b border-zinc-200 dark:border-zinc-800">
        <h1
          data-testid="billing-title"
          className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Billing & Access Pass
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
          Transparent, pay-per-search pricing. One $19 payment unlocks 30 days of unlimited exports and AI optimizations.
        </p>
        {userEmail && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            Account: {userEmail}
          </p>
        )}
      </div>

      {/* Notifications */}
      {initialSuccess && (
        <div
          data-testid="success-banner"
          className="mb-8 p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 text-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">&#10003;</span>
            <div>
              <p className="font-semibold">Payment successful!</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Your 30-Day All-Access Pass is now active. All exports and AI tools are fully unlocked.
              </p>
            </div>
          </div>
        </div>
      )}

      {initialCanceled && (
        <div
          data-testid="canceled-banner"
          className="mb-8 p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm"
        >
          <p className="font-semibold">Checkout canceled</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            You were not charged. You can upgrade whenever you are ready to export your resumes.
          </p>
        </div>
      )}

      {errorMessage && (
        <div
          data-testid="error-banner"
          className="mb-8 p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 text-sm"
        >
          <p className="font-semibold">Error initiating checkout</p>
          <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
            {errorMessage}
          </p>
        </div>
      )}

      {/* Active Pass State */}
      {hasActivePass ? (
        <div
          data-testid="active-pass-card"
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 p-6 sm:p-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-emerald-500/20">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                  Active Pass
                </span>
                <span
                  data-testid="days-remaining-badge"
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  {`${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-bold text-zinc-900 dark:text-zinc-50">
                30-Day All-Access Pass
              </h2>
              {formattedExpiresAt && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Expires on <span className="font-semibold">{formattedExpiresAt}</span>.
                </p>
              )}
            </div>

            <div className="text-right">
              <span className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50">$19</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1">/ 30 days</span>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                No auto-renewal
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Unlimited ATS PDF Exports
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Single-column ATS verified exports with embedded Inter and Classic Serif fonts.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Full JD Keyword Match & Targeting
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Match analysis, section breakdown, and 1-click verified skill additions.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Truth-Bound AI Bullet Improver
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Google XYZ format bullet optimization with zero hallucinated metrics.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Permanent Resume Access
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Your resumes remain editable forever, even after your 30-day pass ends.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Upgrade Card State */
        <div
          data-testid="upgrade-card"
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-6 sm:p-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                  Free Tier
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                30-Day All-Access Pass
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 max-w-xl">
                One flat payment for 30 days of high-velocity job applications. No recurring subscription, no auto-renew traps.
              </p>
            </div>

            <div className="flex flex-col items-start sm:items-end">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50">
                  $19
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">USD</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                One-time payment • 30 days access
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <span className="text-zinc-900 dark:text-zinc-100 font-bold">&#10003;</span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                <strong>Unlimited ATS PDF Exports:</strong> Download clean single-column resumes validated with pdf-parse v2.
              </span>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-zinc-900 dark:text-zinc-100 font-bold">&#10003;</span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                <strong>Target Job Description Matching:</strong> Score resumes against real JDs and catch missing keywords.
              </span>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-zinc-900 dark:text-zinc-100 font-bold">&#10003;</span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                <strong>AI Bullet Improver:</strong> Rephrase bullets with Google XYZ pattern and strict zero-hallucination guards.
              </span>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-zinc-900 dark:text-zinc-100 font-bold">&#10003;</span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                <strong>No Hidden Subscriptions:</strong> Pass expires automatically after 30 days. Your resumes stay editable forever.
              </span>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center sm:text-left">
              Secure checkout processed by Stripe. 100% money-back guarantee if an export fails ATS parsing.
            </div>

            <button
              type="button"
              data-testid="checkout-button"
              disabled={loading}
              onClick={handleCheckout}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? 'Opening Checkout...' : 'Get 30-Day Pass ($19)'}
            </button>
          </div>
        </div>
      )}

      {/* Terms & Transparency Notes */}
      <div className="mt-12 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
        <h4 className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">
          Pass Terms & Transparency
        </h4>
        <p>
          • <strong>Duration:</strong> Exactly 30 days from purchase. We do not automatically charge your card when it expires.
        </p>
        <p>
          • <strong>After Expiry:</strong> All your resumes, data, and edits remain intact and accessible in your account forever. Only PDF downloads and higher-tier AI quotas lock until another pass is acquired.
        </p>
        <p>
          • <strong>Refund Policy:</strong> If our ATS PDF fails extraction on any enterprise applicant tracking system (Workday, Greenhouse, Lever, Taleo), email support for a full prompt refund.
        </p>
      </div>
    </div>
  );
}
