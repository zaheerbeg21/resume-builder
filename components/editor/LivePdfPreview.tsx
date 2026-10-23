'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { Resume } from '@/types/resume';
import { ResumeDocument } from '@/lib/pdf/templates/standard';
import { ClassicResumeDocument } from '@/lib/pdf/templates/classic';
import { registerFonts } from '@/lib/pdf/fonts';
import { useResumeStore } from '@/lib/stores/resume-store';

export interface LivePdfPreviewProps {
  resume: Resume;
  template?: string;
  className?: string;
}

/**
 * Skeleton component rendered while SSR is in progress or while the PDF module loads.
 */
export function PreviewSkeleton() {
  return (
    <div
      data-testid="pdf-preview-skeleton"
      className="w-full h-full flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-900 animate-pulse text-zinc-400 select-none"
    >
      <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin mb-3" />
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        Preparing preview canvas...
      </p>
      {/* Decorative skeleton lines representing resume sections */}
      <div className="w-3/4 max-w-xs space-y-2.5 mt-6 opacity-60">
        <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded mx-auto w-1/2" />
        <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded mx-auto w-3/4" />
        <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded mt-4" />
        <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded w-5/6" />
        <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded w-4/6" />
        <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded mt-4" />
        <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded w-full" />
      </div>
    </div>
  );
}

/**
 * Client-only PDF canvas loaded dynamically to prevent SSR / bundler evaluation on the server.
 */
const DynamicPdfCanvas = dynamic(
  () =>
    import('@react-pdf/renderer').then((mod) => {
      const CanvasComponent = ({
        resume,
        template,
      }: {
        resume: Resume;
        template?: string;
      }) => {
        const renderDoc = (r: Resume, t?: string) =>
          t === 'classic' ? (
            <ClassicResumeDocument resume={r} />
          ) : (
            <ResumeDocument resume={r} />
          );

        const [instance, updateInstance] = mod.usePDF({
          document: renderDoc(resume, template),
        });

        useEffect(() => {
          registerFonts();
        }, []);

        useEffect(() => {
          updateInstance(renderDoc(resume, template));
        }, [resume, template, updateInstance]);

        return (
          <div className="relative w-full h-full bg-white">
            {instance.loading && (
              <div
                data-testid="pdf-loading-spinner"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs transition-opacity duration-200"
              >
                <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin mb-2" />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Compiling PDF preview...
                </span>
              </div>
            )}
            {instance.error && (
              <div
                data-testid="pdf-error"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs"
              >
                <p className="font-semibold">Failed to render PDF preview</p>
                <p className="mt-1 text-[11px] text-red-500">
                  {typeof instance.error === 'string'
                    ? instance.error
                    : (instance.error as { message?: string })?.message ?? 'Unknown error'}
                </p>
              </div>
            )}
            {instance.url ? (
              <iframe
                data-testid="pdf-preview-iframe"
                src={`${instance.url}#toolbar=0&navpanes=0`}
                title="Resume PDF Preview"
                className="w-full h-full border-0 rounded bg-white shadow-xs"
              />
            ) : null}
          </div>
        );
      };
      return { default: CanvasComponent };
    }),
  {
    ssr: false,
    loading: () => <PreviewSkeleton />,
  }
);

export function LivePdfPreview({ resume, template, className = '' }: LivePdfPreviewProps) {
  const storeTemplate = useResumeStore((state) => state.template);
  const activeTemplate = template ?? storeTemplate ?? 'standard';
  const [zoom, setZoom] = useState<number>(1);
  const [isFitWidth, setIsFitWidth] = useState<boolean>(true);
  const [debouncedResume, setDebouncedResume] = useState<Resume>(resume);

  // Debounce resume updates by 400ms to avoid stuttering during rapid keystrokes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedResume(resume);
    }, 400);

    return () => clearTimeout(timer);
  }, [resume]);

  const handleZoomIn = () => {
    setIsFitWidth(false);
    setZoom((prev) => Math.min(2.0, Math.round((prev + 0.1) * 10) / 10));
  };

  const handleZoomOut = () => {
    setIsFitWidth(false);
    setZoom((prev) => Math.max(0.5, Math.round((prev - 0.1) * 10) / 10));
  };

  const handleResetZoom = () => {
    setIsFitWidth(false);
    setZoom(1.0);
  };

  const handleFitWidth = () => {
    setIsFitWidth(true);
    setZoom(1.0);
  };

  const candidateName = resume.basics?.fullName || 'Resume';

  return (
    <div
      data-testid="live-canvas-preview"
      className={`bg-zinc-200/70 dark:bg-zinc-900/70 border border-zinc-300 dark:border-zinc-800 rounded-xl p-4 sm:p-5 backdrop-blur-xs shadow-inner flex flex-col ${className}`}
    >
      {/* Top Toolbar: Document Info & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-300 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
            Live Document Preview
          </span>
          <span
            data-testid="preview-candidate-name"
            className="hidden sm:inline-block max-w-[160px] truncate text-zinc-500 dark:text-zinc-400 font-medium"
            title={candidateName}
          >
            • {candidateName}
          </span>
          <span className="text-[11px] bg-zinc-300/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded">
            US Letter
          </span>
        </div>

        {/* Zoom Controls */}
        <div
          data-testid="zoom-controls"
          className="flex items-center gap-1 bg-white/70 dark:bg-zinc-800/70 border border-zinc-300 dark:border-zinc-700 rounded-lg p-0.5 shadow-2xs"
        >
          <button
            type="button"
            data-testid="zoom-fit-width"
            onClick={handleFitWidth}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
              isFitWidth
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60'
            }`}
            title="Fit Width"
          >
            Fit Width
          </button>
          <button
            type="button"
            data-testid="zoom-reset"
            onClick={handleResetZoom}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
              !isFitWidth && zoom === 1.0
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60'
            }`}
            title="100% Zoom"
          >
            100%
          </button>
          <button
            type="button"
            data-testid="zoom-out"
            onClick={handleZoomOut}
            aria-label="Zoom Out"
            className="px-2 py-1 text-xs font-semibold rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors"
          >
            −
          </button>
          <span
            data-testid="zoom-level"
            className="px-1.5 text-[11px] font-mono text-zinc-700 dark:text-zinc-300 min-w-[36px] text-center"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            data-testid="zoom-in"
            onClick={handleZoomIn}
            aria-label="Zoom In"
            className="px-2 py-1 text-xs font-semibold rounded text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Viewport Container */}
      <div className="w-full flex-1 max-h-[calc(100vh-160px)] min-h-[500px] overflow-auto flex justify-center items-start rounded-lg bg-zinc-300/40 dark:bg-zinc-950/40 p-4">
        {/* US Letter Canvas Wrapper (Aspect Ratio: 8.5 / 11) */}
        <div
          data-testid="pdf-aspect-container"
          className="w-full max-w-[650px] aspect-[8.5/11] bg-white rounded shadow-xl overflow-hidden relative border border-zinc-300 dark:border-zinc-800 transition-transform duration-150 ease-out"
          style={{
            transform: isFitWidth ? 'none' : `scale(${zoom})`,
            transformOrigin: 'top center',
          }}
        >
          <DynamicPdfCanvas resume={debouncedResume} template={activeTemplate} />
        </div>
      </div>
    </div>
  );
}
