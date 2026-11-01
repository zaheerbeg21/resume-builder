import { z } from 'zod';
import { guardProvenance } from '@/lib/ai/guards/provenance';
import {
  ensureUrlScheme,
  hasEmailShapedTokenOnLine,
  hasPhoneShapedTokenOnLine,
} from '@/lib/ai/helpers/grammars';
import {
  RESUME_IMPORT_SYSTEM_PROMPT,
  buildResumePrompt,
} from '@/lib/ai/prompts/resume-import';
import type { LlmProvider } from '@/lib/ai/provider';
import {
  ResumeImportDraftBasicsSchema,
  ResumeImportDraftEducationItemSchema,
  ResumeImportDraftExperienceItemSchema,
  ResumeImportDraftProjectItemSchema,
  ResumeImportDraftSchema,
  flagOverLimitContent,
  type ResumeImportDraft,
  type ReviewFlag,
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

const ALLOWED_URL_SCHEME_REGEX = /^(?:https?:\/\/|mailto:)/i;

function collapseWhitespaceLower(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isModelDraftEmpty(modelDraft: ModelDraft): boolean {
  const { basics } = modelDraft;
  return (
    basics.fullName === null &&
    basics.headline.trim() === '' &&
    basics.email === null &&
    (basics.phone ?? null) === null &&
    (basics.location ?? '').trim() === '' &&
    basics.links.length === 0 &&
    modelDraft.summary.trim() === '' &&
    modelDraft.experience.length === 0 &&
    modelDraft.projects.length === 0 &&
    modelDraft.education.length === 0 &&
    modelDraft.skills.length === 0 &&
    modelDraft.unslotted.length === 0
  );
}

function normalizeAndValidateUrl(
  rawUrl: string | null | undefined,
  path: string,
  warnings: string[],
): string | null {
  if (rawUrl === null || rawUrl === undefined) {
    return null;
  }
  const withScheme = ensureUrlScheme(rawUrl);
  if (withScheme === '') {
    return null;
  }
  if (!ALLOWED_URL_SCHEME_REGEX.test(withScheme)) {
    warnings.push(`Dropped unsupported link scheme at ${path}.`);
    return null;
  }
  return withScheme;
}

export async function parseResume(
  sourceText: string,
  provider: LlmProvider,
): Promise<ParseResumeResult> {
  if (sourceText.trim().length === 0) {
    throw new ParseError('empty_input', 'Resume source text is empty.');
  }

  const generation = await provider.generateStructured({
    systemPrompt: RESUME_IMPORT_SYSTEM_PROMPT,
    prompt: buildResumePrompt(sourceText),
    schema: ModelDraftSchema,
  });

  const modelDraft = generation.data;
  const initialWarnings: string[] = [];
  const initialReviewFlags: ReviewFlag[] = [];

  if (isModelDraftEmpty(modelDraft)) {
    initialWarnings.push('Model returned no extractable content.');
  }

  const normalizedSource = collapseWhitespaceLower(sourceText);
  modelDraft.unslotted.forEach((item, index) => {
    const normalizedExcerpt = collapseWhitespaceLower(item.text);
    if (
      normalizedExcerpt.length > 0 &&
      normalizedSource.includes(normalizedExcerpt)
    ) {
      initialReviewFlags.push({
        path: `unslotted[${index}]`,
        reason: 'UNSLOTTED_CONTENT',
        excerpt: item.text,
      });
    } else {
      initialWarnings.push(
        `Dropped ungrounded unslotted content at unslotted[${index}].`,
      );
    }
  });

  const assembledDraft: ResumeImportDraft = {
    basics: {
      fullName: modelDraft.basics.fullName,
      headline: modelDraft.basics.headline,
      email: modelDraft.basics.email,
      phone: modelDraft.basics.phone ?? null,
      location: modelDraft.basics.location,
      links: modelDraft.basics.links.map((link) => ({
        label: link.label,
        url: link.url,
      })),
    },
    summary: modelDraft.summary,
    experience: modelDraft.experience.map((exp, idx) => ({
      ...exp,
      id: `exp-${idx + 1}`,
    })),
    projects: modelDraft.projects.map((proj, idx) => ({
      ...proj,
      id: `proj-${idx + 1}`,
    })),
    education: modelDraft.education.map((edu, idx) => ({
      ...edu,
      id: `edu-${idx + 1}`,
    })),
    skills: modelDraft.skills.map((group) => ({
      group: group.group,
      items: [...group.items],
    })),
    warnings: initialWarnings,
    low_confidence_paths: [],
    review_flags: initialReviewFlags,
  };

  const { draft: guardedDraft, report: provenance } = guardProvenance(
    assembledDraft,
    sourceText,
  );

  const flaggedDraft = flagOverLimitContent(guardedDraft);

  const postWarnings = [...flaggedDraft.warnings];
  const normalizedLinks = flaggedDraft.basics.links.map((link, idx) => ({
    label: link.label,
    url: normalizeAndValidateUrl(
      link.url,
      `basics.links[${idx}].url`,
      postWarnings,
    ),
  }));

  const normalizedProjects = flaggedDraft.projects.map((proj, idx) => ({
    ...proj,
    url: normalizeAndValidateUrl(
      proj.url,
      `projects[${idx}].url`,
      postWarnings,
    ),
  }));

  if (
    flaggedDraft.basics.email === null &&
    hasEmailShapedTokenOnLine(sourceText)
  ) {
    postWarnings.push(
      'Email-shaped text found in the source but no email was extracted.',
    );
  }

  if (
    (flaggedDraft.basics.phone ?? null) === null &&
    hasPhoneShapedTokenOnLine(sourceText)
  ) {
    postWarnings.push(
      'Phone-shaped text found in the source but no phone was extracted.',
    );
  }

  const finalDraft: ResumeImportDraft = {
    ...flaggedDraft,
    basics: {
      ...flaggedDraft.basics,
      links: normalizedLinks,
    },
    projects: normalizedProjects,
    warnings: postWarnings,
  };

  return {
    draft: finalDraft,
    provenance,
    model: generation.model,
    latencyMs: generation.latencyMs,
  };
}
