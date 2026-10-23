import React from 'react';

interface ComparisonRow {
  dimension: string;
  rezi: string;
  jobscan: string;
  resumeWorded: string;
  reactiveResume: string;
  us: string;
}

const COMPARISON_DATA: ComparisonRow[] = [
  {
    dimension: 'Pricing Model',
    rezi: '$29+/mo subscription with cancellation friction',
    jobscan: '$49+/mo recurring plan with scan limits',
    resumeWorded: '$49/mo expensive subscription upsell',
    reactiveResume: 'Free, but requires technical self-hosting',
    us: '$19 one-time 30-day pass. Zero auto-renewal.',
  },
  {
    dimension: 'Score Transparency',
    rezi: 'Proprietary score hard to interpret',
    jobscan: 'Opaque percentage nudging keyword stuffing',
    resumeWorded: 'Arbitrary score without inline editor',
    reactiveResume: 'No job targeting or match scoring',
    us: 'Deterministic 80/10/10 math with line-by-line evidence.',
  },
  {
    dimension: 'AI Bullet Quality',
    rezi: 'Generic AI phrasing with little context',
    jobscan: 'Checks only; no bullet improver',
    resumeWorded: 'Generic tips without structured rewrite',
    reactiveResume: 'No AI writing assistance',
    us: 'Google XYZ format. Strictly 0 invented facts or metrics.',
  },
  {
    dimension: 'Preview & PDF Fidelity',
    rezi: 'HTML preview often mismatches PDF export',
    jobscan: 'N/A (scanner only, not a builder)',
    resumeWorded: 'N/A (scanner and audit feedback only)',
    reactiveResume: 'Preview and PDF engine can paginate differently',
    us: 'Identical React-PDF engine for preview and export (100% match).',
  },
  {
    dimension: 'Keyword Stuffing Handling',
    rezi: 'Allows repetitive mentions',
    jobscan: 'Incentivizes stuffing to inflate score',
    resumeWorded: 'Basic word count checks',
    reactiveResume: 'None',
    us: 'Anti-stuffing guard: >4 mentions get zero extra credit.',
  },
  {
    dimension: 'ATS Parsing Safety',
    rezi: 'Varying template layouts',
    jobscan: 'Checks text, but does not format PDFs',
    resumeWorded: 'No PDF export included',
    reactiveResume: 'Multi-column templates that fail ATS parsers',
    us: 'Locked single-column templates with embedded Inter & Classic fonts.',
  },
];

export function ComparisonTable() {
  return (
    <section id="comparison" className="py-16 sm:py-24 bg-white dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-4">
            <span>Honest Breakdown</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            How We Compare
          </h2>
          <p className="mt-3 text-base sm:text-lg text-zinc-600 dark:text-zinc-400">
            Most resume builders trap you with recurring subscriptions and black-box scoring. Here is exactly how we compare to the alternatives.
          </p>
        </div>

        {/* Desktop Comparison Table */}
        <div className="mt-12 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <table
            data-testid="comparison-table"
            className="w-full text-left border-collapse min-w-[760px]"
          >
            <thead>
              <tr className="bg-zinc-50/90 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800 text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <th className="py-4 px-5 font-bold w-1/5">Dimension</th>
                <th className="py-4 px-4 font-semibold text-zinc-700 dark:text-zinc-300">Rezi</th>
                <th className="py-4 px-4 font-semibold text-zinc-700 dark:text-zinc-300">Jobscan</th>
                <th className="py-4 px-4 font-semibold text-zinc-700 dark:text-zinc-300">Resume Worded</th>
                <th className="py-4 px-4 font-semibold text-zinc-700 dark:text-zinc-300">Reactive Resume</th>
                <th className="py-4 px-5 font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40 border-l border-emerald-200 dark:border-emerald-800">
                  Our Builder (MVP)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs sm:text-sm">
              {COMPARISON_DATA.map((row, idx) => (
                <tr
                  key={row.dimension}
                  className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 transition-colors ${
                    idx % 2 === 0 ? 'bg-white dark:bg-zinc-950' : 'bg-zinc-50/30 dark:bg-zinc-900/20'
                  }`}
                >
                  <td className="py-4 px-5 font-semibold text-zinc-900 dark:text-zinc-100">
                    {row.dimension}
                  </td>
                  <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 leading-snug">
                    {row.rezi}
                  </td>
                  <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 leading-snug">
                    {row.jobscan}
                  </td>
                  <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 leading-snug">
                    {row.resumeWorded}
                  </td>
                  <td className="py-4 px-4 text-zinc-600 dark:text-zinc-400 leading-snug">
                    {row.reactiveResume}
                  </td>
                  <td className="py-4 px-5 font-medium text-emerald-900 dark:text-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 border-l border-emerald-200 dark:border-emerald-800 leading-snug">
                    <span className="flex items-start gap-1.5">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">&#10003;</span>
                      <span>{row.us}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Small Screen Card Summaries */}
        <div className="mt-8 grid grid-cols-1 md:hidden gap-4">
          <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20">
            <h3 className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">
              The Antidote to Subscription Traps
            </h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              One $19 payment gives you 30 days of unlimited exports and AI bullet refinement. No automatic recurring charges, ever.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
