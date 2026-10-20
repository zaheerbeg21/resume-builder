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
