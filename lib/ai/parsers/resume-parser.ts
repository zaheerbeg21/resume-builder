import { z } from 'zod';
import type { LlmProvider } from '@/lib/ai/provider';
import {
  ResumeImportDraftBasicsSchema,
  ResumeImportDraftEducationItemSchema,
  ResumeImportDraftExperienceItemSchema,
  ResumeImportDraftProjectItemSchema,
  ResumeImportDraftSchema,
  type ResumeImportDraft,
} from '@/lib/ai/schemas';
import type { ProvenanceReport } from '@/types/provenance';

export type ParseErrorCode = 'empty_input';

export class ParseError extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode, message: string = code) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

export const UnslottedItemSchema = z.object({
  label: z.string(),
  text: z.string(),
});
export type UnslottedItem = z.infer<typeof UnslottedItemSchema>;

export const ModelDraftSchema = z.object({
  basics: ResumeImportDraftBasicsSchema,
  summary: z.string().default(''),
  experience: z
    .array(ResumeImportDraftExperienceItemSchema.omit({ id: true }))
    .default([]),
  projects: z
    .array(ResumeImportDraftProjectItemSchema.omit({ id: true }))
    .default([]),
  education: z
    .array(ResumeImportDraftEducationItemSchema.omit({ id: true }))
    .default([]),
  skills: ResumeImportDraftSchema.shape.skills,
  unslotted: z.array(UnslottedItemSchema).default([]),
});
export type ModelDraft = z.infer<typeof ModelDraftSchema>;

export interface ParseResumeResult {
  draft: ResumeImportDraft;
  provenance: ProvenanceReport;
  model: string;
  latencyMs: number;
}

export async function parseResume(
  sourceText: string,
  provider: LlmProvider,
): Promise<ParseResumeResult> {
  void sourceText;
  void provider;
  throw new Error('not implemented');
}

