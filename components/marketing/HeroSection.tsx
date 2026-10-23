import React from 'react';
import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28 bg-gradient-to-b from-zinc-50/80 via-white to-white dark:from-zinc-950 dark:via-zinc-900/50 dark:to-zinc-950">
      {/* Background glow decoration */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center -z-10 pointer-events-none"
      >
        <div className="w-[45rem] h-[22rem] bg-emerald-500/10 dark:bg-emerald-500/5 blur-[120px] rounded-full transform -translate-y-12" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Positioning Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300 text-xs font-semibold mb-8 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Zero Hallucinations. 100% Clean ATS Parsing.</span>
        </div>

        {/* Primary Headline */}
        <h1
          data-testid="hero-headline"
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 max-w-4xl mx-auto leading-[1.1]"
        >
          The resume builder that{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 dark:from-emerald-400 dark:via-teal-400 dark:to-cyan-400">
            shows its work.
          </span>
        </h1>

        {/* Subtitle */}
        <p
          data-testid="hero-subtitle"
          className="mt-6 text-lg sm:text-xl text-zinc-600 dark:text-zinc-300 max-w-2xl mx-auto font-normal leading-relaxed"
        >
          Export real-text, single-column PDFs that parse cleanly through every ATS. Score your resume against any job description with explainable evidence, and optimize bullets with honest AI that never invents facts or metrics.
        </p>

        {/* CTA Button Group */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
          <Link
            href="/register"
            data-testid="hero-cta-register"
            className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-white bg-zinc-900 dark:bg-white dark:text-zinc-950 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all shadow-md hover:shadow-lg transform active:scale-[0.99] text-center"
          >
            Build Free Resume
          </Link>
          <a
            href="#ats-checker"
            data-testid="hero-cta-checker"
            className="w-full sm:w-auto px-6 py-3.5 text-base font-medium text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all text-center"
          >
            Try Free ATS Checker ↓
          </a>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Already have an account?</span>
          <Link
            href="/login"
            data-testid="hero-cta-login"
            className="font-medium text-zinc-900 dark:text-zinc-200 underline hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            Sign In &rarr;
          </Link>
        </div>

        {/* Feature Badges Grid */}
        <div className="mt-16 pt-10 border-t border-zinc-200/60 dark:border-zinc-800/60 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
          <div className="p-4 rounded-xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-xs">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
              <span>100% ATS Verified</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Single-column, real-text PDFs with embedded fonts. Zero tables or icons.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-xs">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
              <span>Honest AI Engine</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Google XYZ method. Never invents metrics or digits you didn’t provide.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-xs">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
              <span>Explainable Score</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Deterministic 80/10/10 math with keyword evidence. No proprietary black boxes.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-xs">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
              <span>No Subscriptions</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              $19 30-day job hunt pass. Zero auto-renewal, zero cancellation friction.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
