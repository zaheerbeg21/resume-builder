import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-zinc-100 dark:border-zinc-800/80">
          {/* Brand & Mission */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-zinc-900 font-bold text-xs tracking-wider">
                RB
              </div>
              <span className="font-bold text-zinc-900 dark:text-zinc-50 text-base">
                ATS Resume Builder
              </span>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 max-w-sm leading-relaxed">
              The resume builder that shows its work. Single-column, ATS-locked PDFs, deterministic keyword scoring, and honest AI that never hallucinates facts.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Built for high-signal job seekers</span>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Product
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <a href="#ats-checker" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Live ATS Checker
                </a>
              </li>
              <li>
                <a href="#comparison" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Competitor Matrix
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  $19 30-Day Pass
                </a>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Resume Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Account & Trust */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Account
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link href="/register" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Create Account
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Sign In
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Privacy Policy & Data Integrity Statement */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <p
            data-testid="footer-privacy-statement"
            className="text-center md:text-left leading-relaxed max-w-3xl"
          >
            <strong>Privacy & Integrity Statement:</strong> We never sell your data or log resume content. All resumes are strictly protected by PostgreSQL Row-Level Security (RLS) and encrypted storage.
          </p>
          <p className="text-center md:text-right shrink-0">
            &copy; {new Date().getFullYear()} ATS Resume Builder. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
