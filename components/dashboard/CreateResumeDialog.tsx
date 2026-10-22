'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ResumeCardData } from './ResumeCard';

export interface CreateResumeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  onCreated?: (newResume: ResumeCardData) => void;
}

export function CreateResumeDialog({
  isOpen,
  onClose,
  userEmail,
  onCreated,
}: CreateResumeDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<'standard' | 'classic'>('standard');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const resumeTitle = title.trim() || 'Untitled Resume';

    const payload = {
      title: resumeTitle,
      template,
      content: {
        basics: {
          fullName: 'Your Name',
          headline: '',
          email: userEmail && userEmail.includes('@') ? userEmail : 'candidate@example.com',
          links: [],
        },
        summary: '',
        experience: [],
        projects: [],
        education: [],
        skills: [],
      },
    };

    try {
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create resume. Please try again.');
      }

      if (onCreated && data) {
        onCreated(data);
      }

      onClose();
      router.push(`/resumes/${data.id}/edit`);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred while creating your resume'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-resume-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl"
        role="document"
      >
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2
              id="create-resume-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Create New Resume
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Choose a title and an ATS-optimized single-column template to get started.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close dialog"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            data-testid="create-resume-error"
            className="p-3 mb-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Resume Title Input */}
          <div>
            <label
              htmlFor="resume-title-input"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Resume Title
            </label>
            <input
              id="resume-title-input"
              data-testid="create-resume-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Senior Systems Engineer"
              disabled={isLoading}
              className="w-full px-3.5 py-2 rounded-lg text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Template Selection */}
          <div>
            <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Select Template
            </span>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Template options">
              {/* Standard Template Card */}
              <label
                data-testid="template-option-standard"
                className={`relative flex flex-col p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  template === 'standard'
                    ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/20 shadow-xs'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-sans font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                    Standard
                  </span>
                  <input
                    type="radio"
                    name="template"
                    value="standard"
                    checked={template === 'standard'}
                    onChange={() => setTemplate('standard')}
                    className="h-4 w-4 text-blue-600 border-zinc-300 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                  Modern sans-serif typography (Inter). Clean single-column layout optimized for modern ATS parsers.
                </p>
              </label>

              {/* Classic Template Card */}
              <label
                data-testid="template-option-classic"
                className={`relative flex flex-col p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  template === 'classic'
                    ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/20 shadow-xs'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-serif font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                    Classic
                  </span>
                  <input
                    type="radio"
                    name="template"
                    value="classic"
                    checked={template === 'classic'}
                    onChange={() => setTemplate('classic')}
                    className="h-4 w-4 text-blue-600 border-zinc-300 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                  Traditional serif typography. Elegant and authoritative layout ideal for executive and academic roles.
                </p>
              </label>
            </div>
          </div>

          {/* Dialog Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              data-testid="cancel-create-btn"
              className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading}
              data-testid="submit-create-btn"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors disabled:opacity-50 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
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
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Resume</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
