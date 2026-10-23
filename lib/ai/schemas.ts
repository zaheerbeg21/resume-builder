import { z } from 'zod';

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

