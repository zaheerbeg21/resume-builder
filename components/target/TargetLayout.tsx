'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Resume } from '@/types/resume';
import type { JdAnalysis } from '@/lib/ai/schemas';
import { scoreResume, type MatchResult } from '@/lib/scoring/match';
import { MatchScoreCard } from './MatchScoreCard';
import { JdInputForm } from './JdInputForm';
import { KeywordCoverageList } from './KeywordCoverageList';
import { MissingKeywordsList } from './MissingKeywordsList';

export interface TargetLayoutProps {
  resumeId: string;
  initialResume: Resume;
  initialTitle: string;
}

/**
 * Computes deterministic ATS format score (0.0 to 1.0) based on resume completeness.
 */
export function computeResumeFormatScore(resume: Resume): number {
  let score = 0;

  // 1. Contact essentials (0.35)
  if (resume.basics.fullName.trim() && resume.basics.email.trim()) {
    score += 0.35;
  }

  // 2. Experience presence & structure (0.35)
  if (resume.experience.length > 0) {
    const hasValidRoles = resume.experience.every(
      (e) => e.company.trim() && e.title.trim() && (e.start || e.current)
    );
    if (hasValidRoles) score += 0.35;
    else score += 0.2;
  } else {
    // If no experience, check if education exists
    if (resume.education.length > 0) score += 0.2;
  }

  // 3. Skills categorized (0.15)
  if (resume.skills.length > 0 && resume.skills.some((g) => g.items.length > 0)) {
    score += 0.15;
  }

  // 4. Bullets validity & no overflowing bullets (0.15)
  const allBullets = [
    ...resume.experience.flatMap((e) => e.bullets),
    ...resume.projects.flatMap((p) => p.bullets),
  ];
  if (allBullets.length > 0) {
    const hasCleanBullets = allBullets.every((b) => b.length > 0 && b.length <= 300);
    if (hasCleanBullets) score += 0.15;
    else score += 0.05;
  } else {
    score += 0.1;
  }

  return Math.min(1.0, Math.max(0.1, Number(score.toFixed(2))));
}

export function TargetLayout({ resumeId, initialResume, initialTitle }: TargetLayoutProps) {
  const [resume, setResume] = useState<Resume>(initialResume);
  const [analysis, setAnalysis] = useState<JdAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [addingKeyword, setAddingKeyword] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mutationSuccessMsg, setMutationSuccessMsg] = useState<string | null>(null);

  // Compute format score and run pure scoreResume()
  const matchResult: MatchResult | null = useMemo(() => {
    if (!analysis) return null;
    const formatScore = computeResumeFormatScore(resume);
    return scoreResume(resume, analysis, formatScore);
  }, [resume, analysis]);

  // Handle JD Analyze API call
  const handleAnalyze = async (jdText: string) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    setMutationSuccessMsg(null);

    try {
      const res = await fetch('/api/jd/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jdText,
          resumeId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details?.[0] || 'Failed to analyze job description');
      }

      const data: JdAnalysis = await res.json();
      setAnalysis(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred during analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle 1-click Add to Skills mutation
  const handleAddSkill = async (keyword: string) => {
    setAddingKeyword(keyword);
    setErrorMessage(null);
    setMutationSuccessMsg(null);

    try {
      // 1. Clone resume and append keyword
      const updatedResume: Resume = JSON.parse(JSON.stringify(resume));

      if (updatedResume.skills.length === 0) {
        updatedResume.skills.push({
          group: 'Technical Skills',
          items: [keyword],
        });
      } else {
        // Find existing group or add to first group
        const targetGroup = updatedResume.skills[0];
        if (!targetGroup.items.some((i) => i.toLowerCase() === keyword.toLowerCase())) {
          targetGroup.items.push(keyword);
        }
      }

      // 2. Persist update to database via PUT /api/resumes/[id]
      const res = await fetch(`/api/resumes/${resumeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: updatedResume,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to save updated skills to resume');
      }

      // 3. Update local state to trigger reactive scoreResume() re-calculation
      setResume(updatedResume);
      setMutationSuccessMsg(`"${keyword}" was added to your Skills and your Match Score has been updated.`);

      // Auto-clear success message after 4s
      setTimeout(() => setMutationSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add skill');
    } finally {
      setAddingKeyword(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/resumes/${resumeId}/edit`}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              <span aria-hidden="true">←</span> Back to Editor
            </Link>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              JD Target & Match
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <h1 className="text-sm font-semibold truncate max-w-xs sm:max-w-md">{initialTitle}</h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/resumes/${resumeId}/edit`}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              Resume Editor
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Global notification banner */}
        {mutationSuccessMsg && (
          <div
            role="status"
            className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 text-xs font-medium flex items-center justify-between animate-fadeIn"
          >
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <span>{mutationSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setMutationSuccessMsg(null)}
              className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-100 text-xs font-semibold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input Form */}
        <section aria-label="Job description input">
          <JdInputForm
            onAnalyze={handleAnalyze}
            isLoading={isAnalyzing}
            error={errorMessage}
          />
        </section>

        {/* Match Results (when analyzed) */}
        {analysis && matchResult && (
          <div className="space-y-6">
            {/* Scorecard */}
            <section aria-label="Match score card">
              <MatchScoreCard
                score={matchResult.score}
                breakdown={matchResult.breakdown}
                jobTitle={analysis.job_title}
              />
            </section>

            {/* Target Job Requirements Overview Card */}
            <section
              aria-label="Target job overview"
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500 mr-1.5 font-medium">Target Role:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{analysis.job_title}</span>
                </div>
                {analysis.years_experience !== null && (
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500 mr-1.5 font-medium">Experience:</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {analysis.years_experience}+ years
                    </span>
                  </div>
                )}
                {analysis.education && (
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500 mr-1.5 font-medium">Education:</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{analysis.education}</span>
                  </div>
                )}
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500 mr-1.5 font-medium">Total Keywords:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {analysis.keywords.length} identified
                  </span>
                </div>
              </div>
            </section>

            {/* Two-Column Grid: Missing Keywords & Keyword Coverage List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Missing Keywords Column */}
              <section aria-label="Missing keywords">
                <MissingKeywordsList
                  keywords={matchResult.keywords}
                  resumeId={resumeId}
                  onAddSkill={handleAddSkill}
                  addingKeyword={addingKeyword}
                />
              </section>

              {/* Matched Keyword Coverage Column */}
              <section aria-label="Matched keyword coverage">
                <KeywordCoverageList keywords={matchResult.keywords} />
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
