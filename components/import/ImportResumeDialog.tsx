'use client';

import React, { useState, useRef } from 'react';
import type { ResumeParserOutput } from '@/lib/ai/schemas';
import { ImportReviewModal } from './ImportReviewModal';

export interface ImportResumeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (newResume: { id: string; title: string }) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function ImportResumeDialog({
  isOpen,
  onClose,
  onImportSuccess,
}: ImportResumeDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanAlert, setScanAlert] = useState<{ isScan: boolean; message: string } | null>(null);

  const [parsedData, setParsedData] = useState<ResumeParserOutput | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  if (!isOpen) return null;

  const resetState = () => {
    setSelectedFile(null);
    setPastedText('');
    setErrorMessage(null);
    setScanAlert(null);
    setIsLoading(false);
    setIsReviewOpen(false);
    setParsedData(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileValidation = (file: File): boolean => {
    setErrorMessage(null);
    setScanAlert(null);

    // Validate mime type or extension
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      setErrorMessage('Please select a valid PDF file (.pdf).');
      return false;
    }

    // Validate size (max 5 MB)
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('File size exceeds the 5 MB limit. Please upload a smaller PDF file.');
      return false;
    }

    setSelectedFile(file);
    return true;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileValidation(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleFileValidation(file);
    }
  };

  const handleParse = async () => {
    setErrorMessage(null);
    setScanAlert(null);
    setIsLoading(true);

    try {
      let res: Response;

      if (mode === 'upload') {
        if (!selectedFile) {
          throw new Error('Please select a PDF file to import.');
        }

        const formData = new FormData();
        formData.append('file', selectedFile);

        res = await fetch('/api/ai/parse-resume', {
          method: 'POST',
          body: formData,
        });
      } else {
        // Paste mode
        const trimmed = pastedText.trim();
        if (trimmed.length < 20) {
          throw new Error('Please enter at least 20 characters of resume text to parse.');
        }

        res = await fetch('/api/ai/parse-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        });
      }

      const data = await res.json().catch(() => null);

      if (res.status === 422 && data?.isScan) {
        setScanAlert({
          isScan: true,
          message:
            data.error ||
            'Extracted text is too short. Your file may be a scanned image or photo. Please enter your resume details manually or copy-paste text.',
        });
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || `Import failed with status ${res.status}.`);
      }

      // Success: open review screen
      setParsedData(data);
      setIsReviewOpen(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred during import.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        data-testid="import-resume-dialog"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      >
        <div
          className="w-full max-w-xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl"
          role="document"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 mb-5">
            <div>
              <h2
                id="import-dialog-title"
                data-testid="import-dialog-title"
                className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
              >
                Import Existing Resume
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Upload your PDF or copy-paste text to extract your experience and skills cleanly.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              aria-label="Close dialog"
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('upload');
                setErrorMessage(null);
                setScanAlert(null);
              }}
              data-testid="tab-upload-pdf"
              className={`pb-2 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                mode === 'upload'
                  ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Upload PDF
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('paste');
                setErrorMessage(null);
                setScanAlert(null);
              }}
              data-testid="tab-paste-text"
              className={`pb-2 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                mode === 'paste'
                  ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              Paste Text
            </button>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              data-testid="import-error-banner"
              className="p-3 mb-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2"
            >
              <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Scan Fallback Alert */}
          {scanAlert && (
            <div
              role="alert"
              data-testid="import-scan-fallback-alert"
              className="p-4 mb-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 space-y-2"
            >
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="font-semibold text-amber-900 dark:text-amber-200">
                    Scanned Document or Photo Detected
                  </h4>
                  <p className="mt-0.5 text-amber-800 dark:text-amber-300">{scanAlert.message}</p>
                </div>
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('paste');
                    setScanAlert(null);
                  }}
                  data-testid="switch-to-paste-btn"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
                >
                  Switch to Copy-Paste Text
                </button>
              </div>
            </div>
          )}

          {/* Mode 1: PDF File Drag & Drop */}
          {mode === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                data-testid="pdf-dropzone"
                className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                    : selectedFile
                    ? 'border-emerald-500/80 bg-emerald-50/20 dark:bg-emerald-950/10'
                    : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 bg-zinc-50/50 dark:bg-zinc-800/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileInputChange}
                  className="hidden"
                  data-testid="pdf-file-input"
                />

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className={`w-10 h-10 mb-2 ${
                    selectedFile
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>

                {selectedFile ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to analyze
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Drag and drop your PDF resume here, or <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      PDF files up to 5 MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode 2: Paste Text */}
          {mode === 'paste' && (
            <div className="space-y-3">
              <label htmlFor="paste-resume-textarea" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Paste Resume Text
              </label>
              <textarea
                id="paste-resume-textarea"
                rows={8}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste the full plain text of your resume here..."
                data-testid="paste-resume-textarea"
                className="w-full p-3 rounded-xl text-xs font-mono bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-zinc-400"
              />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Minimum 20 characters required. We extract contact info, experience, and skills without altering your factual history.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              data-testid="import-cancel-btn"
              className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleParse}
              disabled={isLoading || (mode === 'upload' && !selectedFile) || (mode === 'paste' && pastedText.trim().length < 20)}
              data-testid="import-parse-btn"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white transition-colors disabled:opacity-50 cursor-pointer shadow-xs focus:ring-2 focus:ring-zinc-400"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span>Extracting Resume...</span>
                </>
              ) : (
                <span>Extract & Review</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {isReviewOpen && parsedData && (
        <ImportReviewModal
          isOpen={isReviewOpen}
          onClose={() => {
            setIsReviewOpen(false);
            handleClose();
          }}
          parsedResume={parsedData}
          onSaved={(saved) => {
            if (onImportSuccess) {
              onImportSuccess(saved);
            }
            setIsReviewOpen(false);
            handleClose();
          }}
        />
      )}
    </>
  );
}
