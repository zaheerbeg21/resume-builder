'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useResumeStore } from '@/lib/stores/resume-store';

export interface EditorHeaderProps {
  onManualSave?: () => void;
}

interface ProblemBullet {
  section: string;
  title: string;
  bullet: string;
}

export function EditorHeader({ onManualSave }: EditorHeaderProps) {
  const resumeId = useResumeStore((state) => state.resumeId);
  const title = useResumeStore((state) => state.title);
  const setTitle = useResumeStore((state) => state.setTitle);
  const template = useResumeStore((state) => state.template);
  const setTemplate = useResumeStore((state) => state.setTemplate);
  const resume = useResumeStore((state) => state.resume);
  const isDirty = useResumeStore((state) => state.isDirty);
  const saveStatus = useResumeStore((state) => state.saveStatus);
  const saveError = useResumeStore((state) => state.saveError);

  const [isExporting, setIsExporting] = useState(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [problemBullets, setProblemBullets] = useState<ProblemBullet[]>([]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isErrorModalOpen) {
        setIsErrorModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isErrorModalOpen]);

  const handleDownloadPdf = async () => {
    if (!resumeId || isExporting) return;

    setIsExporting(true);
    setDiagnostics([]);
    setProblemBullets([]);

    try {
      const response = await fetch('/api/pdf/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId, template }),
      });

      if (response.status === 200) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        let filename = `${resume.basics?.fullName || 'Resume'}_Resume.pdf`;
        const disposition = response.headers.get('Content-Disposition');
        if (disposition && disposition.includes('filename=')) {
          const match = disposition.match(/filename="?([^";]+)"?/);
          if (match && match[1]) {
            filename = match[1];
          }
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        return;
      }

      if (response.status === 422) {
        const data = await response.json();
        const serverDiagnostics: string[] = data.diagnostics || [];
        setDiagnostics(serverDiagnostics);

        // Identify local bullets in the resume containing bracketed placeholders
        const placeholderRegex = /\[[A-Za-z0-9%_\s]+\]/;
        const foundBullets: ProblemBullet[] = [];

        resume.experience?.forEach((exp) => {
          exp.bullets?.forEach((b) => {
            if (placeholderRegex.test(b)) {
              foundBullets.push({
                section: 'Experience',
                title: `${exp.title || 'Role'} at ${exp.company || 'Company'}`,
                bullet: b,
              });
            }
          });
        });

        resume.projects?.forEach((proj) => {
          proj.bullets?.forEach((b) => {
            if (placeholderRegex.test(b)) {
              foundBullets.push({
                section: 'Projects',
                title: proj.name || 'Project',
                bullet: b,
              });
            }
          });
        });

        setProblemBullets(foundBullets);
        setIsErrorModalOpen(true);
        return;
      }

      // Other non-200 responses
      const errData = await response.json().catch(() => ({}));
      setDiagnostics([errData.error || `Export failed with status ${response.status}`]);
      setIsErrorModalOpen(true);
    } catch {
      setDiagnostics(['Network error occurred while generating PDF export. Please try again.']);
      setIsErrorModalOpen(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
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

          {/* Right: Template Selector, Autosave Status & Export Button */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0 justify-between sm:justify-end flex-wrap sm:flex-nowrap">
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

            {/* Primary Download PDF Button */}
            <button
              type="button"
              data-testid="download-pdf-btn"
              onClick={handleDownloadPdf}
              disabled={isExporting || !resumeId}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs shrink-0 cursor-pointer"
              title={!resumeId ? 'Please save the resume first' : 'Export and download ATS-ready PDF'}
            >
              {isExporting ? (
                <>
                  <svg
                    className="animate-spin -ml-0.5 h-3.5 w-3.5 text-current"
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
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Accessible Error Modal for Blocked Export */}
      {isErrorModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-error-modal-title"
          data-testid="export-error-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-6 overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 shrink-0">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h3
                  id="export-error-modal-title"
                  className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Export Blocked: ATS Pre-Flight Lint
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  ATS standards require unresolved bracketed placeholders (e.g.{' '}
                  <code className="text-rose-600 dark:text-rose-400 font-mono">[X%]</code>,{' '}
                  <code className="text-rose-600 dark:text-rose-400 font-mono">[N users]</code>) to be resolved before downloading.
                </p>
              </div>
            </div>

            {/* Bullets Requiring Attention */}
            {problemBullets.length > 0 && (
              <div className="mt-4 space-y-2 max-h-56 overflow-y-auto pr-1">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Bullets needing attention ({problemBullets.length}):
                </p>
                <div data-testid="problem-bullets-list" className="space-y-2">
                  {problemBullets.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60"
                    >
                      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                        <span>{item.section}</span>
                        <span className="truncate max-w-[200px]">{item.title}</span>
                      </div>
                      <p className="text-zinc-800 dark:text-zinc-200 font-normal">
                        {item.bullet}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diagnostics List */}
            {diagnostics.length > 0 && problemBullets.length === 0 && (
              <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Diagnostic Details:
                </p>
                <ul className="list-disc list-inside text-xs text-rose-600 dark:text-rose-400 space-y-1">
                  {diagnostics.map((diag, idx) => (
                    <li key={idx}>{diag}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Footer / Dismiss */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                data-testid="close-export-modal-btn"
                onClick={() => setIsErrorModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Close & Fix Bullets
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
