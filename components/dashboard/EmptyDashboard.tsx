import React from 'react';

export interface EmptyDashboardProps {
  onCreateClick: () => void;
}

/**
 * Clean empty state displayed when the user has not yet created any resumes.
 */
export function EmptyDashboard({ onCreateClick }: EmptyDashboardProps) {
  return (
    <div
      data-testid="empty-dashboard"
      className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 my-6"
    >
      <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shadow-sm mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8"
          aria-hidden="true"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
        No resumes yet
      </h2>

      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
        Build an ATS-optimized resume that parses cleanly and passes keyword matching. Real-text single-column layouts guarantee 100% parse-back fidelity.
      </p>

      <button
        type="button"
        onClick={onCreateClick}
        data-testid="empty-dashboard-create-btn"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 cursor-pointer"
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
        <span>Create Your First Resume</span>
      </button>
    </div>
  );
}
