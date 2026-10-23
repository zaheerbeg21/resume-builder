'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-zinc-900 font-bold text-sm tracking-wider shadow-xs">
            RB
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-zinc-900 dark:text-zinc-50 text-base leading-tight tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              ATS Resume Builder
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 tracking-wide font-medium">
              Shows Its Work
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          <a
            href="#features"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Features
          </a>
          <a
            href="#ats-checker"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Free ATS Checker
          </a>
          <a
            href="#comparison"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Comparison
          </a>
          <a
            href="#pricing"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Pricing
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 text-sm font-semibold text-white bg-zinc-900 dark:bg-white dark:text-zinc-950 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-xs"
          >
            Build Free Resume
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          aria-label="Toggle mobile menu"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 pt-2 pb-6 space-y-3">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-700 dark:text-zinc-200"
          >
            Features
          </a>
          <a
            href="#ats-checker"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-700 dark:text-zinc-200"
          >
            Free ATS Checker
          </a>
          <a
            href="#comparison"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-700 dark:text-zinc-200"
          >
            Comparison
          </a>
          <a
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-700 dark:text-zinc-200"
          >
            Pricing
          </a>
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
            <Link
              href="/login"
              className="w-full py-2.5 text-center text-sm font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 rounded-lg"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="w-full py-2.5 text-center text-sm font-semibold text-white bg-zinc-900 dark:bg-white dark:text-zinc-950 rounded-lg"
            >
              Build Free Resume
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
