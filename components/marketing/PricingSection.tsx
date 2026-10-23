import React from 'react';
import Link from 'next/link';

export function PricingSection() {
  return (
    <section id="pricing" className="py-16 sm:py-24 bg-zinc-50/50 dark:bg-zinc-900/40 border-t border-zinc-200/80 dark:border-zinc-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-4">
            <span>Pay Per Job Hunt — Not Forever</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Simple, Honest Pricing
          </h2>
          <p className="mt-3 text-base sm:text-lg text-zinc-600 dark:text-zinc-400">
            No recurring subscription traps. No sneaky auto-renewals. Pay once when you are actively interviewing, and keep your resumes forever.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-12 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Free Tier Card */}
          <div
            data-testid="pricing-card-free"
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 flex flex-col justify-between shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Free Forever
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  $0
                </span>
              </div>

              <h3 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                Free Tier
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Perfect for crafting, targeting, and previewing your resume before applying.
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50">$0</span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400 ml-1">USD</span>
              </div>

              {/* Feature List */}
              <ul className="mt-8 space-y-3.5 text-sm text-zinc-700 dark:text-zinc-300">
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>Guided ATS resume editor (up to 5 resumes)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>2 locked ATS templates (Standard & Classic)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>Live React-PDF preview with 100% pagination fidelity</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>Full keyword match score & evidence breakdown</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>1 clean PDF export included</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>5 AI bullet optimizations per day</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
              <Link
                href="/register"
                data-testid="pricing-cta-free"
                className="w-full block py-3 px-4 rounded-xl text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Start Free
              </Link>
            </div>
          </div>

          {/* 30-Day Job Hunt Pass Card */}
          <div
            data-testid="pricing-card-pass"
            className="relative rounded-2xl border-2 border-emerald-500 dark:border-emerald-400 bg-white dark:bg-zinc-900 p-8 flex flex-col justify-between shadow-lg shadow-emerald-500/5 dark:shadow-emerald-500/10"
          >
            {/* Recommended Badge */}
            <div className="absolute -top-3.5 right-6 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold tracking-wide shadow-xs uppercase">
              Most Popular
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  One-Time Payment
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                  No Auto-Renew
                </span>
              </div>

              <h3 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                30-Day Job Hunt Pass
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Everything you need for a focused job search. Unlimited exports and generous AI bullet refinement.
              </p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-zinc-900 dark:text-zinc-50">$19</span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400 ml-1">/ 30 days (flat fee)</span>
              </div>

              {/* Feature List */}
              <ul className="mt-8 space-y-3.5 text-sm text-zinc-700 dark:text-zinc-300">
                <li className="flex items-center gap-2.5 font-medium">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>Unlimited ATS-verified PDF exports</span>
                </li>
                <li className="flex items-center gap-2.5 font-medium">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>300 AI bullet optimizations (high fair-use cap)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>Truth-bound AI: zero invented numbers or facts</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>Unlimited JD targeting & keyword cache</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>Resumes stay editable forever after pass ends</span>
                </li>
                <li className="flex items-center gap-2.5 font-semibold text-emerald-800 dark:text-emerald-300">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                  <span>Zero subscription traps: never auto-renews</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
              <Link
                href="/register"
                data-testid="pricing-cta-pass"
                className="w-full block py-3.5 px-4 rounded-xl text-center text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 transition-colors shadow-sm"
              >
                Get 30-Day Pass ($19)
              </Link>
            </div>
          </div>
        </div>

        {/* Philosophy Callout */}
        <div className="mt-12 max-w-3xl mx-auto p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
          <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Why $19 for 30 days instead of a monthly subscription?
          </h4>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Most active job searches take between 3 and 6 weeks. Typical competitors bill $29 to $49 per month on recurring subscriptions, counting on job seekers forgetting to cancel once they receive an offer. We believe in honest billing: one flat $19 charge gives you full access for your job hunt.
          </p>
        </div>
      </div>
    </section>
  );
}
