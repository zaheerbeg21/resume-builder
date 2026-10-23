'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { KeywordResult } from '@/lib/scoring/match';

export interface MissingKeywordsListProps {
  keywords: KeywordResult[];
  resumeId: string;
  onAddSkill: (keyword: string) => Promise<void>;
  addingKeyword?: string | null;
}

export function MissingKeywordsList({
  keywords,
  resumeId,
  onAddSkill,
  addingKeyword = null,
}: MissingKeywordsListProps) {
  const [confirmKeyword, setConfirmKeyword] = useState<string | null>(null);

  const missingRequired = keywords.filter((k) => !k.found && k.importance === 'required');
  const missingPreferred = keywords.filter((k) => !k.found && k.importance === 'preferred');

  const handleConfirmAdd = async (term: string) => {
    setConfirmKeyword(null);
    await onAddSkill(term);
  };

  return (
    <div
      data-testid="missing-keywords-list"
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Missing Keywords
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
              {missingRequired.length} Required Missing
            </span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Required keywords have 3x weight on your match score. Add them to skills or target them in bullets.
          </p>
        </div>
      </div>

      {/* Confirmation banner when user clicks Add */}
      {confirmKeyword && (
        <div className="my-3 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-indigo-900 dark:text-indigo-200 font-medium">
            Confirm: Do you have hands-on experience with <span className="font-bold">{confirmKeyword}</span>?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleConfirmAdd(confirmKeyword)}
              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
            >
              Yes, add to Skills
            </button>
            <button
              type="button"
              onClick={() => setConfirmKeyword(null)}
              className="px-2.5 py-1 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Missing Required list */}
      <div className="mt-3">
        <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
          High-Priority (Required by JD)
        </h4>

        {missingRequired.length === 0 ? (
          <div className="py-4 text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
            ✓ Excellent! All required keywords from the job description are present in your resume.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {missingRequired.map((kw) => {
              const isBusy = addingKeyword === kw.term;
              return (
                <li
                  key={kw.term}
                  data-testid={`missing-keyword-item-${kw.term}`}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-rose-500 font-bold shrink-0">✕</span>
                    <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {kw.term}
                    </span>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                      Required
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* One-click Add to Skills button */}
                    <button
                      type="button"
                      data-testid={`add-skill-btn-${kw.term}`}
                      disabled={isBusy}
                      onClick={() => setConfirmKeyword(kw.term)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900/60 disabled:opacity-50 transition-colors"
                      title="Add to skills section upon confirmation"
                    >
                      {isBusy ? (
                        <>Adding...</>
                      ) : (
                        <>
                          <span aria-hidden="true">+</span> Add to Skills
                        </>
                      )}
                    </button>

                    {/* Target in Bullet link */}
                    <Link
                      data-testid={`target-bullet-link-${kw.term}`}
                      href={`/resumes/${resumeId}/edit?targetKeyword=${encodeURIComponent(kw.term)}#experience`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-zinc-700 bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700 transition-colors"
                      title="Open editor to weave this keyword into an achievement bullet"
                    >
                      Target in Bullet →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Missing Preferred list */}
      {missingPreferred.length > 0 && (
        <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
            Secondary (Preferred / Nice to Have - {missingPreferred.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {missingPreferred.map((kw) => (
              <span
                key={kw.term}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
              >
                <span>{kw.term}</span>
                <button
                  type="button"
                  onClick={() => setConfirmKeyword(kw.term)}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold ml-1"
                  title="Add to skills"
                >
                  + Add
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
