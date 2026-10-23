import React from 'react';
import type { Metadata } from 'next';
import {
  Navbar,
  HeroSection,
  FreeAtsChecker,
  ComparisonTable,
  PricingSection,
  Footer,
} from '@/components/marketing';

export const metadata: Metadata = {
  title: 'ATS Resume Builder | The Resume Builder That Shows Its Work',
  description:
    'Export real-text single-column PDFs that parse cleanly through every ATS. Live interactive keyword score breakdown, truth-bound AI, and honest $19 one-time pricing.',
};

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans selection:bg-emerald-500/20 selection:text-emerald-900 dark:selection:text-emerald-200">
      {/* Top Sticky Header */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <HeroSection />

        {/* Feature Highlights Section */}
        <section id="features" className="py-16 sm:py-20 bg-white dark:bg-zinc-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Core Architectural Pillars
              </span>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                Engineered for 100% ATS Fidelity
              </h2>
              <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
                Antiquated ATS scanners mangle tables, multi-column layouts, graphics, and custom fonts. We engineered our entire builder from the ground up to guarantee flawless readability.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold mb-5">
                  1
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  Real-Text Single Column
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Exported PDFs are strictly single-column with embedded static fonts (Inter & Classic Serif). Zero tables, zero canvas elements, zero parsing traps.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold mb-5">
                  2
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  Deterministic Math, Not Guesswork
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  No mysterious proprietary black boxes. Our score breakdown is pure, repeatable math: 80% Keyword Coverage, 10% Job Title Alignment, and 10% Format Linting.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold mb-5">
                  3
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  Truth-Bound Google XYZ AI
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Our AI bullet optimizer writes using Google’s proven XYZ pattern. It enforces strict digit guards so the LLM never invents numbers, metrics, or credentials.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Free ATS Checker Sandbox */}
        <FreeAtsChecker />

        {/* Competitor Comparison Matrix */}
        <ComparisonTable />

        {/* Transparent $19 Pricing Section */}
        <PricingSection />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
