import type { ResumeImportDraft } from '@/lib/ai/schemas';
import type { ProvenanceReport } from '@/types/provenance';

export const CONTAINMENT_THRESHOLD = 0.85; // starting value, tuned on corpus
export const SHORT_FIELD_WORD_LIMIT = 6; // starting value, tuned on corpus
export const NGRAM_SIZE_STANDARD = 3; // starting value, tuned on corpus
export const NGRAM_SIZE_SHORT = 2; // starting value, tuned on corpus
export const SPATIAL_WINDOW_LINES = 4; // starting value, tuned on corpus

export function guardProvenance(
  draft: ResumeImportDraft,
  sourceText: string
): { draft: ResumeImportDraft; report: ProvenanceReport } {
  void draft;
  void sourceText;
  throw new Error('not implemented');
}
