'use client';

import React, { useState } from 'react';

export interface JdInputFormProps {
  onAnalyze: (jdText: string) => Promise<void>;
  isLoading: boolean;
  initialJdText?: string;
  error?: string | null;
}

const MIN_CHARS = 50;
const MAX_CHARS = 12000;

export function JdInputForm({
  onAnalyze,
  isLoading,
  initialJdText = '',
  error: serverError = null,
}: JdInputFormProps) {
  const [jdText, setJdText] = useState(initialJdText);
  const [localError, setLocalError] = useState<string | null>(null);

  const charCount = jdText.length;
  const isTooShort = charCount > 0 && charCount < MIN_CHARS;
  const isTooLong = charCount > MAX_CHARS;
  const canSubmit = charCount >= MIN_CHARS && charCount <= MAX_CHARS && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (charCount < MIN_CHARS) {
        setLocalError(`Please enter at least ${MIN_CHARS} characters (currently ${charCount}).`);
      } else if (charCount > MAX_CHARS) {
        setLocalError(`Job description exceeds maximum limit of ${MAX_CHARS.toLocaleString()} characters.`);
      }
      return;
    }
    setLocalError(null);
    await onAnalyze(jdText);
  };

  const handleClear = () => {
    setJdText('');
    setLocalError(null);
  };

  const displayError = localError || serverError;

  return (
    <form
      data-testid="jd-input-form"
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs"
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Target Job Description
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Paste the full job posting to extract requirements and measure keyword match.
          </p>
        </div>
        {charCount > 0 && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isLoading}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="relative mt-2">
        <textarea
          id="jd-textarea"
          data-testid="jd-textarea"
          rows={6}
          value={jdText}
          onChange={(e) => {
            setJdText(e.target.value);
            if (localError) setLocalError(null);
          }}
          disabled={isLoading}
          placeholder="Paste job description text here (e.g., role summary, responsibilities, required skills, preferred qualifications)..."
          className={`w-full rounded-lg border px-3.5 py-2.5 text-xs sm:text-sm font-mono leading-relaxed bg-zinc-50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none transition-colors resize-y ${
            isTooShort || isTooLong
              ? 'border-amber-400 dark:border-amber-600 focus:border-amber-500'
              : 'border-zinc-200 dark:border-zinc-700 focus:border-indigo-500 dark:focus:border-indigo-400'
          }`}
          aria-describedby="jd-char-counter jd-error-msg"
        />
      </div>

      {/* Footer controls: counter & submit */}
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            id="jd-char-counter"
            data-testid="jd-char-counter"
            className={`text-xs font-mono font-medium ${
              isTooShort || isTooLong
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars
          </span>
          {isTooShort && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              (need at least {MIN_CHARS})
            </span>
          )}
        </div>

        <button
          type="submit"
          id="run-match-btn"
          data-testid="run-match-btn"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:text-zinc-500 dark:disabled:text-zinc-600 transition-colors shadow-xs"
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-1 h-4 w-4 text-white"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Analyzing Job Description...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              Run Keyword Match
            </>
          )}
        </button>
      </div>

      {displayError && (
        <div
          id="jd-error-msg"
          data-testid="jd-error-msg"
          role="alert"
          className="mt-3 p-2.5 rounded-lg text-xs bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 flex items-start gap-2"
        >
          <span className="font-bold shrink-0">Error:</span>
          <span>{displayError}</span>
        </div>
      )}
    </form>
  );
}
