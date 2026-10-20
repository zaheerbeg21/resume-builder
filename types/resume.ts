import { z } from 'zod';

export const YearMonth = z.string().regex(/^[0-9]{4}(-(0[1-9]|1[0-2]))?$/).nullable();
export type YearMonth = z.infer<typeof YearMonth>;

export const ResumeSchema = z.object({
  basics: z.object({
    fullName: z.string().min(1),
    headline: z.string().default(''),
    email: z.email(),
    phone: z.string().optional(),
    location: z.string().optional(),
    links: z.array(z.object({ label: z.string(), url: z.url() })).max(5).default([]),
  }),
  summary: z.string().max(600).default(''),
  experience: z.array(z.object({
    id: z.string(),
    company: z.string(),
    title: z.string(),
    location: z.string().optional(),
    start: YearMonth,
    end: YearMonth,
    current: z.boolean().default(false),
    bullets: z.array(z.string().max(300)).max(8),
  })).default([]),
  projects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.url().optional(),
    bullets: z.array(z.string().max(300)).max(5),
  })).default([]),
  education: z.array(z.object({
    id: z.string(),
    school: z.string(),
    degree: z.string(),
    start: YearMonth,
    end: YearMonth,
  })).default([]),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })).default([]),
});

export type Resume = z.infer<typeof ResumeSchema>;
