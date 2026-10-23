'use client';

import React, { useState, useEffect } from 'react';
import type { BulletResult, BulletVariant } from '@/lib/ai/schemas';

export interface BulletImproverModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBullet: string;
  roleTitle?: string;
  isCurrentRole?: boolean;
  onApply: (finalBulletText: string) => void;
}

export function BulletImproverModal({
  isOpen,
  onClose,
  initialBullet,
  roleTitle = '',
  isCurrentRole = false,
  onApply,
}: BulletImproverModalProps) {
  const [rawBullet, setRawBullet] = useState(initialBullet);
  const [userFacts, setUserFacts] = useState('');
  const [targetKeywordsText, setTargetKeywordsText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulletResult | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(0);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleGenerate = async (
    bulletToOptimize = rawBullet,
    facts = userFacts,
    keywords = targetKeywordsText
  ) => {

    const trimmed = bulletToOptimize.trim();
    if (trimmed.length < 10) {
      setError('Bullet text must be at least 10 characters long to optimize.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const parsedKeywords = keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      const response = await fetch('/api/ai/bullet-optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawBullet: trimmed,
          roleTitle: roleTitle.trim(),
          targetKeywords: parsedKeywords,
          userFacts: facts.trim() || undefined,
          isCurrentRole,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details?.[0] || 'Optimization failed');
      }

      const data: BulletResult = await response.json();
      setResult(data);
      setSelectedVariantIndex(0);

      // Initialize placeholder values
      const initialPlaceholders: Record<string, string> = {};
      data.placeholders_needed.forEach((item) => {
        initialPlaceholders[item.token] = '';
      });
      setPlaceholderValues(initialPlaceholders);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate bullet improvements';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Replaces bracketed tokens in variant text with user-supplied figures.
   */
  const interpolateVariantText = (variantText: string): string => {
    let resolved = variantText;
    for (const [token, value] of Object.entries(placeholderValues)) {
      if (value.trim()) {
        resolved = resolved.split(token).join(value.trim());
      }
    }
    return resolved;
  };

  const handleApplyVariant = (variant: BulletVariant) => {
    const finalText = interpolateVariantText(variant.text);
    onApply(finalText);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="bullet-improver-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="bullet-improver-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-sm font-bold">
              ✨
            </span>
            <div>
              <h2 id="modal-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Truth-Bound Bullet Improver
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Rewrites duties into achievements following Google XYZ: Accomplished [X], measured by [Y], by doing [Z].
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-bullet-modal"
            onClick={onClose}
            aria-label="Close modal"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-md transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Input Section */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Original Bullet Text <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                data-testid="modal-raw-bullet-input"
                value={rawBullet}
                onChange={(e) => setRawBullet(e.target.value)}
                placeholder="e.g. Built microservices and optimized slow queries"
                className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Verified Facts & Numbers <span className="text-zinc-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  data-testid="modal-user-facts-input"
                  value={userFacts}
                  onChange={(e) => setUserFacts(e.target.value)}
                  placeholder="e.g. reduced latency by 35%, team of 4"
                  className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Target Keywords <span className="text-zinc-400 font-normal">(Comma separated)</span>
                </label>
                <input
                  type="text"
                  data-testid="modal-keywords-input"
                  value={targetKeywordsText}
                  onChange={(e) => setTargetKeywordsText(e.target.value)}
                  placeholder="e.g. TypeScript, Redis, PostgreSQL"
                  className="w-full text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-1">
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                Role context: {roleTitle ? `"${roleTitle}"` : 'Not specified'} ({isCurrentRole ? 'Current' : 'Past'})
              </span>

              <button
                type="button"
                data-testid="generate-improvements-btn"
                disabled={isLoading || rawBullet.trim().length < 10}
                onClick={() => handleGenerate()}
                className="text-xs font-medium px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
              >
                {isLoading ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                    <span>Optimizing...</span>
                  </>
                ) : (
                  <>
                    <span>✨ Generate Variants</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              data-testid="bullet-modal-error"
              className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          {/* Placeholder Fill-in Section */}
          {result && result.placeholders_needed.length > 0 && (
            <div
              data-testid="placeholders-panel"
              className="p-3.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2.5"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                <span>⚠️ Missing Metrics Detected:</span>
                <span className="font-normal text-amber-800 dark:text-amber-300">
                  AI will never invent numbers. Supply real figures to complete your bullet:
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {result.placeholders_needed.map((p, idx) => (
                  <div key={idx} className="space-y-1">
                    <label className="block text-[11px] font-medium text-amber-900 dark:text-amber-300">
                      <span className="font-mono font-bold bg-amber-200 dark:bg-amber-900/60 px-1 py-0.5 rounded text-[10px] mr-1">
                        {p.token}
                      </span>
                      {p.question}
                    </label>
                    <input
                      type="text"
                      data-testid={`placeholder-input-${p.token}`}
                      value={placeholderValues[p.token] || ''}
                      onChange={(e) =>
                        setPlaceholderValues((prev) => ({
                          ...prev,
                          [p.token]: e.target.value,
                        }))
                      }
                      placeholder="e.g. 35%"
                      className="w-full text-xs bg-white dark:bg-zinc-800 border border-amber-300 dark:border-amber-700 rounded-md px-2.5 py-1.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Variants Selection Section */}
          {result && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Recommended Achievement Variants (Select One)
              </h3>

              <div className="space-y-3">
                {result.variants.map((variant, vIdx) => {
                  const resolvedText = interpolateVariantText(variant.text);
                  const isSelected = selectedVariantIndex === vIdx;

                  const badgeStyles: Record<string, { label: string; bg: string; text: string }> = {
                    conservative: {
                      label: 'Conservative',
                      bg: 'bg-zinc-100 dark:bg-zinc-800',
                      text: 'text-zinc-700 dark:text-zinc-300',
                    },
                    metric_focused: {
                      label: 'Metric Focused',
                      bg: 'bg-emerald-100 dark:bg-emerald-950/60',
                      text: 'text-emerald-700 dark:text-emerald-300',
                    },
                    leadership_focused: {
                      label: 'Leadership Focused',
                      bg: 'bg-purple-100 dark:bg-purple-950/60',
                      text: 'text-purple-700 dark:text-purple-300',
                    },
                    scope_focused: {
                      label: 'Scope Focused',
                      bg: 'bg-blue-100 dark:bg-blue-950/60',
                      text: 'text-blue-700 dark:text-blue-300',
                    },
                  };

                  const badge = badgeStyles[variant.style] || {
                    label: variant.style,
                    bg: 'bg-zinc-100 dark:bg-zinc-800',
                    text: 'text-zinc-700 dark:text-zinc-300',
                  };

                  return (
                    <div
                      key={vIdx}
                      data-testid={`variant-card-${vIdx}`}
                      onClick={() => setSelectedVariantIndex(vIdx)}
                      className={`p-4 rounded-lg border cursor-pointer transition relative space-y-2.5 ${
                        isSelected
                          ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50/80 dark:bg-zinc-800/60 ring-1 ring-zinc-900 dark:ring-zinc-100'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {variant.keywords_used.map((kw, kwIdx) => (
                            <span
                              key={kwIdx}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono"
                            >
                              {kw}
                            </span>
                          ))}
                          <button
                            type="button"
                            data-testid={`apply-variant-${vIdx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApplyVariant(variant);
                            }}
                            className="text-xs font-semibold px-2.5 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition ml-2"
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      <p
                        data-testid={`variant-text-${vIdx}`}
                        className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed font-normal"
                      >
                        {resolvedText}
                      </p>

                      <div className="flex justify-between items-center text-[10px] text-zinc-400 dark:text-zinc-500 pt-1">
                        <span>{resolvedText.split(/\s+/).filter(Boolean).length} words</span>
                        <span>{resolvedText.length} / 260 chars</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            Cancel
          </button>

          {result && (
            <button
              type="button"
              data-testid="modal-apply-selected-btn"
              onClick={() => handleApplyVariant(result.variants[selectedVariantIndex])}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition"
            >
              Apply Selected Variant
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
