import { z } from 'zod';
import { ResumeSchema } from '@/types/resume';

export const JdKeywordSchema = z.object({
  term: z.string().min(1),
  aliases: z.array(z.string()).max(5),
  category: z.enum(['hard_skill', 'tool', 'method', 'qualification', 'domain']),
  importance: z.enum(['required', 'preferred']),
});
export type JdKeyword = z.infer<typeof JdKeywordSchema>;

export const JdAnalysisSchema = z.object({
  job_title: z.string(),
  years_experience: z.number().int().nullable(),
  education: z.string().nullable(),
  keywords: z.array(JdKeywordSchema).max(40),
});
export type JdAnalysis = z.infer<typeof JdAnalysisSchema>;

export const BulletVariantStyleSchema = z.enum([
  'conservative',
  'metric_focused',
  'leadership_focused',
  'scope_focused',
]);
export type BulletVariantStyle = z.infer<typeof BulletVariantStyleSchema>;

export const BulletVariantSchema = z.object({
  style: BulletVariantStyleSchema,
  text: z.string().min(40).max(260),
  keywords_used: z.array(z.string()),
});
export type BulletVariant = z.infer<typeof BulletVariantSchema>;

export const PlaceholderItemSchema = z.object({
  token: z.string(),
  question: z.string(),
});
export type PlaceholderItem = z.infer<typeof PlaceholderItemSchema>;

export const BulletResultSchema = z.object({
  variants: z.array(BulletVariantSchema).length(3),
  placeholders_needed: z.array(PlaceholderItemSchema),
});
export type BulletResult = z.infer<typeof BulletResultSchema>;

export const BulletOptimizeInputSchema = z.object({
  rawBullet: z.string().min(10, 'Bullet must be at least 10 characters'),
  roleTitle: z.string().default(''),
  targetKeywords: z.array(z.string()).default([]),
  userFacts: z.string().optional(),
  isCurrentRole: z.boolean().default(false),
});
export type BulletOptimizeInput = z.infer<typeof BulletOptimizeInputSchema>;

export const ResumeParserOutputSchema = ResumeSchema.extend({
  warnings: z.array(z.string()).max(20).default([]),
  low_confidence_paths: z.array(z.string()).max(50).default([]),
});
export type ResumeParserOutput = z.infer<typeof ResumeParserOutputSchema>;

export const SUMMARY_MAX = 600; // mirrors ResumeSchema
export const EXPERIENCE_BULLETS_MAX = 8; // mirrors ResumeSchema
export const PROJECT_BULLETS_MAX = 5; // mirrors ResumeSchema
export const LINKS_MAX = 5; // mirrors ResumeSchema
export const BULLET_CHARS_MAX = 300; // mirrors ResumeSchema

export const ReviewFlagReasonSchema = z.enum(['EXCEEDS_LENGTH_LIMIT', 'UNSLOTTED_CONTENT']);
export type ReviewFlagReason = z.infer<typeof ReviewFlagReasonSchema>;

export const ReviewFlagSchema = z.object({
  path: z.string(),
  reason: ReviewFlagReasonSchema,
  message: z.string().optional(),
  excerpt: z.string().nullable().optional(),
});
export type ReviewFlag = z.infer<typeof ReviewFlagSchema>;

// Format validation moves to the provenance guard (T-023)
export const ResumeDraftDateSchema = z.string().nullable();
export type ResumeDraftDate = z.infer<typeof ResumeDraftDateSchema>;

export const ResumeDraftLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});
export type ResumeDraftLink = z.infer<typeof ResumeDraftLinkSchema>;

export const ResumeImportDraftBasicsSchema = z.object({
  fullName: z.string().nullable(),
  headline: ResumeSchema.shape.basics.shape.headline,
  email: z.string().nullable(),
  phone: z.string().nullable().optional(),
  location: ResumeSchema.shape.basics.shape.location,
  links: z.array(ResumeDraftLinkSchema).default([]),
});
export type ResumeImportDraftBasics = z.infer<typeof ResumeImportDraftBasicsSchema>;

export const ResumeImportDraftExperienceItemSchema = z.object({
  id: z.string(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  location: z.string().optional(),
  start: ResumeDraftDateSchema,
  end: ResumeDraftDateSchema,
  current: z.boolean().default(false),
  bullets: z.array(z.string()).default([]),
});
export type ResumeImportDraftExperienceItem = z.infer<typeof ResumeImportDraftExperienceItemSchema>;

export const ResumeImportDraftProjectItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().nullable().optional(),
  bullets: z.array(z.string()).default([]),
});
export type ResumeImportDraftProjectItem = z.infer<typeof ResumeImportDraftProjectItemSchema>;

export const ResumeImportDraftEducationItemSchema = z.object({
  id: z.string(),
  school: z.string().nullable(),
  degree: z.string().nullable(),
  start: ResumeDraftDateSchema,
  end: ResumeDraftDateSchema,
});
export type ResumeImportDraftEducationItem = z.infer<typeof ResumeImportDraftEducationItemSchema>;

export const ResumeImportDraftSchema = z.object({
  basics: ResumeImportDraftBasicsSchema,
  summary: z.string().default(''),
  experience: z.array(ResumeImportDraftExperienceItemSchema).default([]),
  projects: z.array(ResumeImportDraftProjectItemSchema).default([]),
  education: z.array(ResumeImportDraftEducationItemSchema).default([]),
  skills: ResumeSchema.shape.skills,
  warnings: z.array(z.string()).default([]),
  low_confidence_paths: z.array(z.string()).default([]),
  review_flags: z.array(ReviewFlagSchema).default([]),
});
export type ResumeImportDraft = z.infer<typeof ResumeImportDraftSchema>;

// Adds EXCEEDS_LENGTH_LIMIT flags (with path) for summary, experience bullet count, project bullet count, links count, and any bullet over BULLET_CHARS_MAX, and never truncates.
export function flagOverLimitContent(draft: ResumeImportDraft): ResumeImportDraft {
  const newFlags: ReviewFlag[] = [];

  if (draft.summary && draft.summary.length > SUMMARY_MAX) {
    newFlags.push({
      path: 'summary',
      reason: 'EXCEEDS_LENGTH_LIMIT',
    });
  }

  if (draft.basics.links && draft.basics.links.length > LINKS_MAX) {
    newFlags.push({
      path: 'basics.links',
      reason: 'EXCEEDS_LENGTH_LIMIT',
    });
  }

  draft.experience.forEach((exp, i) => {
    if (exp.bullets && exp.bullets.length > EXPERIENCE_BULLETS_MAX) {
      newFlags.push({
        path: `experience[${i}].bullets`,
        reason: 'EXCEEDS_LENGTH_LIMIT',
      });
    }
    exp.bullets?.forEach((bullet, j) => {
      if (bullet.length > BULLET_CHARS_MAX) {
        newFlags.push({
          path: `experience[${i}].bullets[${j}]`,
          reason: 'EXCEEDS_LENGTH_LIMIT',
        });
      }
    });
  });

  draft.projects.forEach((proj, i) => {
    if (proj.bullets && proj.bullets.length > PROJECT_BULLETS_MAX) {
      newFlags.push({
        path: `projects[${i}].bullets`,
        reason: 'EXCEEDS_LENGTH_LIMIT',
      });
    }
    proj.bullets?.forEach((bullet, j) => {
      if (bullet.length > BULLET_CHARS_MAX) {
        newFlags.push({
          path: `projects[${i}].bullets[${j}]`,
          reason: 'EXCEEDS_LENGTH_LIMIT',
        });
      }
    });
  });

  return {
    ...draft,
    review_flags: [...(draft.review_flags ?? []), ...newFlags],
  };
}



