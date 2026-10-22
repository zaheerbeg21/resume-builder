'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export interface ResumeCardData {
  id: string;
  title: string;
  template: string;
  updated_at?: string;
  created_at?: string;
}

export interface ResumeCardProps {
  resume: ResumeCardData;
  onDelete?: (id: string) => void;
}

function formatDate(isoString?: string): string {
  if (!isoString) return 'Recently';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Recently';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

/**
 * ResumeCard displays title, template badge, last-updated timestamp,
 * and actions to edit, target a job, or delete.
 */
export function ResumeCard({ resume, onDelete }: ResumeCardProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const templateDisplay =
    resume.template?.toLowerCase() === 'classic' ? 'Classic' : 'Standard';

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/resumes/${resume.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to delete resume');
      }

      setIsDeleteModalOpen(false);
      onDelete?.(resume.id);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'An unexpected error occurred while deleting'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div
        data-testid={`resume-card-${resume.id}`}
        className="group relative flex flex-col justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 shadow-xs hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200"
      >
        <div>
          {/* Top metadata row: Template badge & Date */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <span
              data-testid="template-badge"
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tracking-wide border ${
                templateDisplay === 'Classic'
                  ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 font-serif'
                  : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 font-sans'
              }`}
            >
              {templateDisplay}
            </span>

            <span
              data-testid="last-updated-date"
              className="text-xs text-zinc-500 dark:text-zinc-400"
            >
              {`Updated ${formatDate(resume.updated_at)}`}
            </span>
          </div>

          {/* Title */}
          <h3
            data-testid="resume-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1 mb-4"
            title={resume.title}
          >
            {resume.title || 'Untitled Resume'}
          </h3>
        </div>

        {/* Action buttons */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link
              href={`/resumes/${resume.id}/edit`}
              data-testid="edit-resume-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.05 10.476a.75.75 0 0 0-.2.383l-.8 3.5a.75.75 0 0 0 .902.902l3.5-.8a.75.75 0 0 0 .383-.2l7.963-7.963a1.75 1.75 0 0 0 0-2.475l-.31-.31Zm-2.02 1.05 1.272 1.272-1.06 1.06-1.272-1.272 1.06-1.06Zm-1.768 1.768 1.272 1.272-6.55 6.55-1.517.347.347-1.517 6.448-6.652Z" />
              </svg>
              <span>Edit</span>
            </Link>

            <Link
              href={`/resumes/${resume.id}/target`}
              data-testid="target-job-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                <path
                  fillRule="evenodd"
                  d="M1.75 8a6.25 6.25 0 1 1 11.458 3.42l1.62 1.621a.75.75 0 1 1-1.06 1.06l-1.62-1.62A6.25 6.25 0 0 1 1.75 8Zm6.25-4.75a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Target Job</span>
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            data-testid="delete-resume-btn"
            aria-label={`Delete resume ${resume.title}`}
            className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.074l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.074l.275-5.5a.75.75 0 0 1 .786-.713Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isDeleteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl"
            role="document"
          >
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-500 mb-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-950/50">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h2
                id="delete-dialog-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
              >
                Delete Resume
              </h2>
            </div>

            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                &ldquo;{resume.title}&rdquo;
              </span>
              ? This action cannot be undone.
            </p>

            {deleteError && (
              <div
                role="alert"
                className="p-3 mb-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300"
              >
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setIsDeleteModalOpen(false);
                    setDeleteError(null);
                  }
                }}
                disabled={isDeleting}
                data-testid="cancel-delete-btn"
                className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                data-testid="confirm-delete-btn"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {isDeleting ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8z"
                      />
                    </svg>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Resume</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
