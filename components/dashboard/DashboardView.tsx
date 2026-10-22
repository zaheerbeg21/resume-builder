'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuotaBadge } from './QuotaBadge';
import { ResumeCard, type ResumeCardData } from './ResumeCard';
import { EmptyDashboard } from './EmptyDashboard';
import { CreateResumeDialog } from './CreateResumeDialog';

export interface DashboardViewProps {
  initialResumes: ResumeCardData[];
  userEmail?: string;
}

export const MAX_RESUMES = 5;

/**
 * DashboardView renders the client-interactive resume dashboard including
 * header, quota indicator, creation modal, and empty / grid states.
 */
export function DashboardView({ initialResumes, userEmail }: DashboardViewProps) {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeCardData[]>(initialResumes);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const resumeCount = resumes.length;
  const isQuotaReached = resumeCount >= MAX_RESUMES;

  const handleDeleteResume = (deletedId: string) => {
    setResumes((prev) => prev.filter((r) => r.id !== deletedId));
    router.refresh();
  };

  const handleCreatedResume = (newResume: ResumeCardData) => {
    setResumes((prev) => [newResume, ...prev]);
    router.refresh();
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Dashboard Top Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1
            data-testid="dashboard-title"
            className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            My Resumes
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Build, target, and maintain your ATS-locked single-column resumes.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <QuotaBadge count={resumeCount} max={MAX_RESUMES} />

          <button
            type="button"
            onClick={() => {
              if (!isQuotaReached) {
                setIsCreateOpen(true);
              }
            }}
            disabled={isQuotaReached}
            data-testid="create-resume-header-btn"
            aria-disabled={isQuotaReached}
            title={
              isQuotaReached
                ? 'Resume limit reached (5 of 5). Delete a resume to create a new one.'
                : 'Create a new resume'
            }
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-zinc-400 ${
              isQuotaReached
                ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed opacity-60'
                : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white cursor-pointer'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            <span>Create New Resume</span>
          </button>
        </div>
      </header>

      {/* Main Content Area: Grid vs Empty State */}
      <main>
        {resumeCount === 0 ? (
          <EmptyDashboard onCreateClick={() => setIsCreateOpen(true)} />
        ) : (
          <div
            data-testid="resumes-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {resumes.map((resume) => (
              <ResumeCard
                key={resume.id}
                resume={resume}
                onDelete={handleDeleteResume}
              />
            ))}
          </div>
        )}
      </main>

      {/* Creation Modal */}
      <CreateResumeDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        userEmail={userEmail}
        onCreated={handleCreatedResume}
      />
    </div>
  );
}
