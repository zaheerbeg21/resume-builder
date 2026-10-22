'use client';

import React from 'react';
import { useResumeStore } from '@/lib/stores/resume-store';

export const MAX_SUMMARY_LENGTH = 600;

export function SummarySection() {
  const summary = useResumeStore((state) => state.resume.summary) || '';
  const updateSummary = useResumeStore((state) => state.updateSummary);

  const charCount = summary.length;
  const isNearLimit = charCount >= 550 && charCount < MAX_SUMMARY_LENGTH;
  const isAtLimit = charCount >= MAX_SUMMARY_LENGTH;

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 sm:p-6 shadow-xs">
      <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Professional Summary
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            A concise 2–4 sentence overview highlighting your experience and key domain strengths.
          </p>
        </div>

        {/* Live Character Counter */}
        <div
          data-testid="summary-counter"
          className={`text-xs font-mono font-medium self-end sm:self-auto px-2 py-1 rounded-md ${
            isAtLimit
              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-semibold'
              : isNearLimit
              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
          }`}
        >
          {`${charCount} / ${MAX_SUMMARY_LENGTH}`}
        </div>
      </div>

      <div className="relative">
        <textarea
          id="summary-textarea"
          data-testid="summary-textarea"
          rows={5}
          maxLength={MAX_SUMMARY_LENGTH}
          value={summary}
          onChange={(e) => updateSummary(e.target.value)}
          placeholder="e.g. Lead Software Engineer with 7+ years of experience designing fault-tolerant microservices and high-throughput data pipelines in cloud-native environments..."
          className="w-full text-sm leading-relaxed bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400 transition resize-y"
        />

        {isAtLimit && (
          <p
            data-testid="summary-limit-warning"
            className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium"
          >
            Maximum character limit of 600 reached.
          </p>
        )}
      </div>
    </section>
  );
}
