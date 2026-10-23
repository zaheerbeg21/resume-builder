'use client';

import React from 'react';

export interface MatchScoreCardProps {
  score: number;
  breakdown: {
    coverage: number;
    title: number;
    format: number;
  };
  jobTitle?: string;
}

export function getScoreGrade(score: number): {
  grade: string;
  label: string;
  badgeClass: string;
} {
  if (score >= 85) {
    return {
      grade: 'A',
      label: 'Strong Match',
      badgeClass:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    };
  }
  if (score >= 70) {
    return {
      grade: 'B',
      label: 'Good Match',
      badgeClass:
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
    };
  }
  if (score >= 50) {
    return {
      grade: 'C',
      label: 'Fair Match',
      badgeClass:
        'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    };
  }
  return {
    grade: 'D',
    label: 'Needs Targeting',
    badgeClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  };
}

export function MatchScoreCard({ score, breakdown, jobTitle }: MatchScoreCardProps) {
  const { grade, label, badgeClass } = getScoreGrade(score);

  // Compute percentage fills
  const coveragePct = Math.min(100, Math.max(0, (breakdown.coverage / 80) * 100));
  const titlePct = Math.min(100, Math.max(0, (breakdown.title / 10) * 100));
  const formatPct = Math.min(100, Math.max(0, (breakdown.format / 10) * 100));

  return (
    <div
      data-testid="match-score-card"
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Keyword Match Score
          </span>
          {jobTitle && (
            <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mt-0.5 truncate max-w-sm">
              Target: <span className="font-semibold text-zinc-950 dark:text-zinc-50">{jobTitle}</span>
            </h3>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            data-testid="match-score-grade"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeClass}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
            Grade {grade} • {label}
          </span>
          <div className="flex items-baseline gap-1">
            <span
              data-testid="match-score-value"
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100"
            >
              {score}
            </span>
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">/ 100</span>
          </div>
        </div>
      </div>

      {/* 3-part breakdown */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Coverage: /80 */}
        <div
          data-testid="breakdown-coverage"
          className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-zinc-100 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Keyword Coverage</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {breakdown.coverage} <span className="text-zinc-400 font-normal">/ 80 pts</span>
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${coveragePct}%` }}
              aria-label={`Coverage ${breakdown.coverage} of 80`}
            />
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            Weighted by section relevance (Experience 1.0, Projects 0.9, Skills 0.7, Summary 0.5)
          </p>
        </div>

        {/* Title Alignment: /10 */}
        <div
          data-testid="breakdown-title"
          className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-zinc-100 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">Title Alignment</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {breakdown.title} <span className="text-zinc-400 font-normal">/ 10 pts</span>
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${titlePct}%` }}
              aria-label={`Title alignment ${breakdown.title} of 10`}
            />
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            Matches JD job title against headline and latest role
          </p>
        </div>

        {/* Format Lint: /10 */}
        <div
          data-testid="breakdown-format"
          className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 border border-zinc-100 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-zinc-600 dark:text-zinc-300">ATS Format Lint</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {breakdown.format} <span className="text-zinc-400 font-normal">/ 10 pts</span>
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${formatPct}%` }}
              aria-label={`Format score ${breakdown.format} of 10`}
            />
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            Clean single-column parsing, standard sections & valid dates
          </p>
        </div>
      </div>
    </div>
  );
}
