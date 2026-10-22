import React from 'react';

export interface QuotaBadgeProps {
  count: number;
  max?: number;
  className?: string;
}

/**
 * Visual badge displaying resume count against the 5-resume quota limit.
 * Applies a warning style when the quota is reached (count >= max).
 */
export function QuotaBadge({ count, max = 5, className = '' }: QuotaBadgeProps) {
  const isLimitReached = count >= max;

  return (
    <span
      data-testid="quota-badge"
      data-quota-reached={isLimitReached ? 'true' : 'false'}
      role="status"
      aria-label={`${count} of ${max} resumes created${isLimitReached ? ' - quota reached' : ''}`}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        isLimitReached
          ? 'bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700'
          : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          isLimitReached ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
        }`}
      />
      <span>
        {`${count} / ${max} resumes created`}
      </span>
      {isLimitReached && (
        <span className="font-semibold text-[10px] uppercase tracking-wider ml-0.5">
          (Max)
        </span>
      )}
    </span>
  );
}
