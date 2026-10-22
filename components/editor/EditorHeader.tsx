'use client';

import React from 'react';
import Link from 'next/link';
import { useResumeStore } from '@/lib/stores/resume-store';

export interface EditorHeaderProps {
  onManualSave?: () => void;
}

export function EditorHeader({ onManualSave }: EditorHeaderProps) {
  const title = useResumeStore((state) => state.title);
  const setTitle = useResumeStore((state) => state.setTitle);
  const template = useResumeStore((state) => state.template);
  const setTemplate = useResumeStore((state) => state.setTemplate);
  const isDirty = useResumeStore((state) => state.isDirty);
  const saveStatus = useResumeStore((state) => state.saveStatus);
  const saveError = useResumeStore((state) => state.saveError);

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Back Link & Title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors shrink-0"
            aria-label="Back to dashboard"
          >
            <span aria-hidden="true" className="mr-1">←</span> Dashboard
          </Link>

          <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">|</span>

          <div className="relative flex-1 max-w-md">
            <input
              id="resume-title-input"
              data-testid="editor-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resume Title"
              className="w-full text-base sm:text-lg font-semibold bg-transparent text-zinc-900 dark:text-zinc-100 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-zinc-500 dark:focus:border-zinc-500 rounded px-2 py-0.5 outline-none transition-colors"
              title="Click to rename resume"
            />
          </div>
        </div>

        {/* Right: Template Selector & Autosave Status */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0 justify-between sm:justify-end">
          {/* Template Switcher */}
          <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300">
            <span className="px-1.5 text-zinc-400 dark:text-zinc-500 hidden sm:inline">Template:</span>
            <button
              type="button"
              data-testid="template-standard-btn"
              onClick={() => setTemplate('standard')}
              className={`px-2.5 py-1 rounded transition-colors ${
                template === 'standard'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                  : 'hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              data-testid="template-classic-btn"
              onClick={() => setTemplate('classic')}
              className={`px-2.5 py-1 rounded transition-colors ${
                template === 'classic'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold'
                  : 'hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Classic
            </button>
          </div>

          {/* Autosave Status Indicator */}
          <div
            data-testid="autosave-status"
            className="flex items-center gap-1.5 text-xs font-medium min-w-[100px] justify-end"
          >
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center text-zinc-500 dark:text-zinc-400">
                <svg
                  className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-zinc-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
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
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Saving...
              </span>
            )}

            {saveStatus === 'saved' && (
              <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
                <svg
                  className="mr-1 h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2.5"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Saved
              </span>
            )}

            {saveStatus === 'idle' && isDirty && (
              <span className="inline-flex items-center text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500 mr-1.5" />
                Unsaved changes
              </span>
            )}

            {saveStatus === 'idle' && !isDirty && (
              <span className="text-zinc-400 dark:text-zinc-500">
                All changes saved
              </span>
            )}

            {saveStatus === 'error' && (
              <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <span title={saveError ?? 'Failed to save'}>Save error</span>
                {onManualSave && (
                  <button
                    type="button"
                    data-testid="retry-save-btn"
                    onClick={onManualSave}
                    className="underline hover:text-rose-700 dark:hover:text-rose-300 ml-1 text-xs"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
