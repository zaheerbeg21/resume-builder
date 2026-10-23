'use client';

import React, { useState, useMemo } from 'react';
import type { KeywordResult, Section } from '@/lib/scoring/match';

export interface KeywordCoverageListProps {
  keywords: KeywordResult[];
}

const SECTION_LABELS: Record<Section, { label: string; badgeClass: string }> = {
  experience: {
    label: 'Experience',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
  },
  skills: {
    label: 'Skills',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  },
  projects: {
    label: 'Projects',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  },
  summary: {
    label: 'Summary',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  },
};

type FilterTab = 'all' | 'experience' | 'skills' | 'projects' | 'summary';

export function KeywordCoverageList({ keywords }: KeywordCoverageListProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const matchedKeywords = useMemo(() => {
    return keywords.filter((k) => k.found);
  }, [keywords]);

  const filteredKeywords = useMemo(() => {
    return matchedKeywords.filter((k) => {
      const matchesSearch = k.term.toLowerCase().includes(searchTerm.toLowerCase().trim());
      if (!matchesSearch) return false;
      if (activeTab === 'all') return true;
      return k.sections.includes(activeTab);
    });
  }, [matchedKeywords, activeTab, searchTerm]);

  return (
    <div
      data-testid="keyword-coverage-list"
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Matched Keywords
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300">
              {matchedKeywords.length} of {keywords.length} matched
            </span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Keywords extracted from the JD found across your resume sections.
          </p>
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search keywords..."
            className="w-full sm:w-48 text-xs px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Section filter tabs */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
            activeTab === 'all'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          All Sections ({matchedKeywords.length})
        </button>
        {(['experience', 'skills', 'projects', 'summary'] as Section[]).map((sec) => {
          const count = matchedKeywords.filter((k) => k.sections.includes(sec)).length;
          return (
            <button
              key={sec}
              type="button"
              onClick={() => setActiveTab(sec)}
              className={`px-2.5 py-1 rounded-md font-medium capitalize transition-colors ${
                activeTab === sec
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {sec} ({count})
            </button>
          );
        })}
      </div>

      {/* Keywords list */}
      {filteredKeywords.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {matchedKeywords.length === 0
            ? 'No keywords matched yet. Paste a job description to run keyword match.'
            : 'No matched keywords found for the current search filter.'}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {filteredKeywords.map((kw) => (
            <li
              key={kw.term}
              data-testid={`keyword-item-${kw.term}`}
              className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              {/* Left: Term & Importance */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-emerald-500 shrink-0" aria-label="Matched">
                  ✓
                </span>
                <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {kw.term}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${
                    kw.importance === 'required'
                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                  }`}
                >
                  {kw.importance}
                </span>

                {/* Stuffing warning */}
                {kw.stuffed && (
                  <span
                    data-testid="stuffing-warning"
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                    title="Mentions > 4. Repeated mentions do not add score points and can look unnatural."
                  >
                    ⚠️ Stuffing warning ({kw.mentions}x)
                  </span>
                )}
              </div>

              {/* Right: Section Presence Badges & Mentions */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-1">
                  {kw.mentions} {kw.mentions === 1 ? 'mention' : 'mentions'} in:
                </span>
                {kw.sections.map((section) => (
                  <span
                    key={section}
                    data-testid={`section-badge-${section}`}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SECTION_LABELS[section].badgeClass}`}
                  >
                    {SECTION_LABELS[section].label}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
