import type { Resume } from '@/types/resume';
import type { JdAnalysis } from '@/lib/ai/schemas';

export type Section = 'experience' | 'projects' | 'skills' | 'summary';

export const SECTION_WEIGHT: Record<Section, number> = {
  experience: 1,
  projects: 0.9,
  skills: 0.7,
  summary: 0.5,
};

export const IMPORTANCE_WEIGHT = {
  required: 3,
  preferred: 1,
} as const;

export const STUFFING_LIMIT = 4;

// Keeps c++, c#, node.js; everything else becomes a separator.
export const KEEP = /[a-z0-9+#.]/;

export function stem(t: string): string {
  if (t.length <= 3 || /[+#.]/.test(t)) return t;
  for (const suf of ['ing', 'ed', 'es', 's']) {
    if (t.endsWith(suf) && t.length - suf.length >= 3) return t.slice(0, -suf.length);
  }
  return t;
}

export function tokenize(s: string): string[] {
  let out = '';
  for (const ch of s.toLowerCase()) out += KEEP.test(ch) ? ch : ' ';
  return out
    .split(' ')
    .map((t) => t.replace(/^[.]+|[.]+$/g, ''))
    .filter(Boolean)
    .map(stem);
}

export function countPhrase(tokens: string[], phrase: string[]): number {
  if (phrase.length === 0) return 0;
  let count = 0;
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j] !== phrase[j]) {
        ok = false;
        break;
      }
    }
    if (ok) count++;
  }
  return count;
}

export interface KeywordResult {
  term: string;
  importance: 'required' | 'preferred';
  found: boolean;
  sections: Section[];
  mentions: number;
  stuffed: boolean;
}

export interface MatchResult {
  score: number;
  breakdown: { coverage: number; title: number; format: number };
  keywords: KeywordResult[];
  missingRequired: string[];
}

export function scoreResume(resume: Resume, jd: JdAnalysis, formatScore01: number): MatchResult {
  const corpus: Record<Section, string[]> = {
    experience: tokenize(resume.experience.flatMap((e) => [e.title, ...e.bullets]).join(' ')),
    projects: tokenize(resume.projects.flatMap((p) => [p.name, ...p.bullets]).join(' ')),
    skills: tokenize(resume.skills.flatMap((g) => g.items).join(' ')),
    summary: tokenize(resume.basics.headline + ' ' + resume.summary),
  };

  let earned = 0;
  let possible = 0;
  const keywords: KeywordResult[] = [];

  for (const kw of jd.keywords) {
    const forms = [kw.term, ...kw.aliases].map(tokenize).filter((f) => f.length > 0);
    const weight = IMPORTANCE_WEIGHT[kw.importance];
    possible += weight;

    const sections: Section[] = [];
    let mentions = 0;
    let best = 0;
    for (const name of Object.keys(corpus) as Section[]) {
      const n = forms.reduce((sum, f) => sum + countPhrase(corpus[name], f), 0);
      if (n > 0) {
        sections.push(name);
        mentions += n;
        best = Math.max(best, SECTION_WEIGHT[name]);
      }
    }
    earned += weight * best;
    keywords.push({
      term: kw.term,
      importance: kw.importance,
      found: best > 0,
      sections,
      mentions,
      stuffed: mentions > STUFFING_LIMIT,
    });
  }

  const coverage = possible === 0 ? 0 : earned / possible;

  const jdTitle = tokenize(jd.job_title);
  const myTitles = tokenize([resume.basics.headline, resume.experience[0]?.title ?? ''].join(' '));
  const overlap = jdTitle.filter((t) => myTitles.includes(t)).length;
  const title = jdTitle.length === 0 ? 0 : overlap / jdTitle.length;

  const score = Math.round(80 * coverage + 10 * title + 10 * formatScore01);
  return {
    score,
    breakdown: {
      coverage: Math.round(80 * coverage),
      title: Math.round(10 * title),
      format: Math.round(10 * formatScore01),
    },
    keywords,
    missingRequired: keywords
      .filter((k) => !k.found && k.importance === 'required')
      .map((k) => k.term),
  };
}

export type MatchBreakdown = MatchResult['breakdown'];
