/**
 * Baseline evaluation script for Stage 1 plain-text resume parsing.
 *
 * Field comparison contract:
 * - Empty string ('') and null are equivalent for basics.headline, basics.location, and summary.
 * - For company, title, school, and degree (as well as other nullable string fields), an empty
 *   string ('') counts as null.
 * - Dates (start, end) are compared as written (exact match after trimming).
 * - Link labels (basics.links[i].label) are ignored; only basics.links[i].url is compared.
 * - id, warnings, and low_confidence_paths are ignored in field accuracy scoring.
 * - In string comparison, only a hyphen between two letters followed by one space is affected:
 *   'word- word' and 'word-word' are treated as equal on both sides.
 * - review_flags with reason UNSLOTTED_CONTENT are compared by content coverage, not by item:
 *   the whitespace-split words of all expected excerpts and of all actual excerpts are collected
 *   (case-folded, private-use and other-symbol glyphs removed, separator punctuation replaced
 *   with space while keeping $ % + # & @ /) and compared as multisets.
 *   The whole unslotted set counts as ONE field per fixture: correct when no expected word is
 *   missing and no actual word is surplus; wrong otherwise; also null when every expected word
 *   is missing. The missing-word and surplus-word counts are printed on a separate line per fixture
 *   ('unslotted missing=N surplus=M') and never added to the totals. Item grouping and order do not matter.
 *   EXCEEDS_LENGTH_LIMIT flags are matched by path and ignored unless listed in expected.
 * - A null (or equivalent empty string) counts as wrong only when the expected value is non-null.
 * - Expected '' (or null) vs actual non-empty is counted as wrong (e.g. negative-control fixtures).
 * - Extra array items in actual beyond expected length count as wrong at their index path and are
 *   also listed in surplusPaths.
 * - Never logs resume text, extracted values, warning text, or API keys.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveGeminiModel } from '../lib/ai/config';
import { parseResume } from '../lib/ai/parsers/resume-parser';
import type { LlmProvider } from '../lib/ai/provider';
import { GeminiProvider } from '../lib/ai/providers/gemini';
import { ResumeImportDraftSchema, type ResumeImportDraft } from '../lib/ai/schemas';

const FIXTURES_DIR = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'eval',
  'resumes',
);
const DEFAULT_PAUSE_BETWEEN_CALLS_MS = 4500;
const DEFAULT_ABORT_AFTER = 3;

interface ExpectedBasics {
  fullName?: string | null;
  headline?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: Array<{ label?: string; url?: string | null }>;
}

interface ExpectedExperienceItem {
  company?: string | null;
  title?: string | null;
  location?: string | null;
  start?: string | null;
  end?: string | null;
  current?: boolean;
  bullets?: string[];
}

interface ExpectedProjectItem {
  name?: string | null;
  url?: string | null;
  bullets?: string[];
}

interface ExpectedEducationItem {
  school?: string | null;
  degree?: string | null;
  start?: string | null;
  end?: string | null;
}

interface ExpectedSkillGroup {
  group?: string;
  items?: string[];
}

interface ExpectedReviewFlag {
  path: string;
  reason: 'EXCEEDS_LENGTH_LIMIT' | 'UNSLOTTED_CONTENT';
  message?: string;
  excerpt?: string | null;
}

interface ExpectedDraft {
  basics?: ExpectedBasics;
  summary?: string | null;
  experience?: ExpectedExperienceItem[];
  projects?: ExpectedProjectItem[];
  education?: ExpectedEducationItem[];
  skills?: ExpectedSkillGroup[];
  review_flags?: ExpectedReviewFlag[];
}

type PathOutcome = 'correct' | 'wrong' | 'wrong_null' | 'surplus';
type FailureCategory =
  | 'timeout'
  | 'api_429'
  | 'api_503'
  | 'api_other'
  | 'empty_response'
  | 'schema_validation'
  | 'empty_input'
  | 'other';

interface FixtureEvalMetrics {
  fixture: string;
  failed: boolean;
  failureCategory?: FailureCategory;
  errorSummary?: string;
  total: number;
  correct: number;
  wrong: number;
  nullCount: number;
  unslottedMissing: number;
  unslottedSurplus: number;
  latencyMs: number;
  model?: string;
  wrongPaths: string[];
  nullPaths: string[];
  surplusPaths: string[];
  provenanceNulledPaths: string[];
  provenanceDecoupledRoles: string[];
  warningsCount: number;
  pathOutcomes: Map<string, PathOutcome>;
}

interface ProviderErrorLike {
  name?: string;
  kind: string;
  provider: unknown;
  status?: number;
}

interface ParseErrorLike {
  name?: string;
  code: string;
}

function isProviderErrorLike(err: unknown): err is ProviderErrorLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    'kind' in err &&
    typeof (err as { kind?: unknown }).kind === 'string' &&
    'provider' in err
  );
}

function isParseErrorLike(err: unknown): err is ParseErrorLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  );
}

function classifyFailure(err: unknown): FailureCategory {
  if (isProviderErrorLike(err)) {
    if (err.kind === 'timeout') {
      return 'timeout';
    }
    if (err.kind === 'api') {
      if (err.status === 429) {
        return 'api_429';
      }
      if (err.status === 503) {
        return 'api_503';
      }
      return 'api_other';
    }
    if (err.kind === 'empty_response') {
      return 'empty_response';
    }
    if (err.kind === 'schema_validation') {
      return 'schema_validation';
    }
  }
  if (isParseErrorLike(err) && err.code === 'empty_input') {
    return 'empty_input';
  }
  return 'other';
}

function formatErrorOneLine(err: unknown): {
  name: string;
  firstLine: string;
  extra: string;
} {
  if (isProviderErrorLike(err)) {
    const name =
      typeof err.name === 'string' && err.name.length > 0
        ? err.name
        : 'ProviderError';
    const statusText = typeof err.status === 'number' ? err.status : 'none';
    return {
      name,
      firstLine: `kind=${err.kind} status=${statusText}`,
      extra: '',
    };
  }
  if (isParseErrorLike(err)) {
    const name =
      typeof err.name === 'string' && err.name.length > 0
        ? err.name
        : 'ParseError';
    return {
      name,
      firstLine: `code=${err.code}`,
      extra: '',
    };
  }

  const errObj =
    typeof err === 'object' && err !== null
      ? (err as { name?: unknown; message?: unknown })
      : null;
  const name =
    errObj && typeof errObj.name === 'string' && errObj.name.length > 0
      ? errObj.name
      : 'NonErrorThrown';
  const rawMessage =
    errObj && typeof errObj.message === 'string'
      ? errObj.message
      : typeof err === 'string'
        ? err
        : 'unhandled error';
  const firstLine = (rawMessage.split(/\r?\n/)[0] ?? '').trim();

  return { name, firstLine, extra: '' };
}

function parseRunsArg(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--runs' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isInteger(parsed) && parsed >= 1) {
        return parsed;
      }
    } else if (arg.startsWith('--runs=')) {
      const parsed = Number.parseInt(arg.slice('--runs='.length), 10);
      if (Number.isInteger(parsed) && parsed >= 1) {
        return parsed;
      }
    }
  }
  return 1;
}

function parsePauseMsArg(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pause-ms' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isInteger(parsed) && parsed >= 0) {
        return parsed;
      }
    } else if (arg.startsWith('--pause-ms=')) {
      const parsed = Number.parseInt(arg.slice('--pause-ms='.length), 10);
      if (Number.isInteger(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }
  return DEFAULT_PAUSE_BETWEEN_CALLS_MS;
}

function parseOnlyArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      return argv[i + 1].trim();
    }
    if (arg.startsWith('--only=')) {
      const val = arg.slice('--only='.length).trim();
      return val.length > 0 ? val : null;
    }
  }
  return null;
}

function filterFixturesByOnly(files: string[], only: string | null): string[] {
  if (!only) {
    return files;
  }
  const clean = only.trim();
  const targetStem = clean.endsWith('.txt')
    ? clean.slice(0, -'.txt'.length)
    : clean;
  return files.filter(
    (f) =>
      f.slice(0, -'.txt'.length) === targetStem ||
      f.slice(0, -'.txt'.length).toLowerCase() === targetStem.toLowerCase(),
  );
}

function parseAbortAfterArg(argv: string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--abort-after' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isInteger(parsed) && parsed >= 1) {
        return parsed;
      }
    } else if (arg.startsWith('--abort-after=')) {
      const parsed = Number.parseInt(arg.slice('--abort-after='.length), 10);
      if (Number.isInteger(parsed) && parsed >= 1) {
        return parsed;
      }
    }
  }
  return DEFAULT_ABORT_AFTER;
}

function hasSelfCheckArg(argv: string[]): boolean {
  return argv.includes('--self-check');
}

function normalizeStringValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.replace(/(\p{L})- (?=\p{L})/gu, '$1-');
}

function normalizeReviewFlagExcerpt(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const collapsed = value.trim().replace(/\s+/g, ' ');
  return collapsed.length === 0 ? null : collapsed;
}

// Same categories the parser drops before its unslotted grounding check (T-024 step 3a).
const BULLET_GLYPH_REGEX = /[\p{Co}\p{So}]/gu;

// Same separator punctuation the parser replaces with space (T-024 step 3c).
const SEPARATOR_PUNCTUATION_REGEX =
  /[,;:.\p{Pd}()\[\]{}'"`\u2018\u2019\u201C\u201D\u2212]/gu;

function unslottedWords(
  flags: { reason: string; excerpt?: string | null }[],
): string[] {
  return flags
    .filter((f) => f.reason === 'UNSLOTTED_CONTENT')
    .flatMap((f) =>
      (f.excerpt ?? '')
        .replace(BULLET_GLYPH_REGEX, '')
        .replace(SEPARATOR_PUNCTUATION_REGEX, ' ')
        .toLowerCase()
        .split(/\s+/),
    )
    .filter((w) => w.length > 0);
}

class FieldAccumulator {
  total = 0;
  correct = 0;
  wrong = 0;
  nullCount = 0;
  readonly wrongPaths: string[] = [];
  readonly nullPaths: string[] = [];
  readonly surplusPaths: string[] = [];
  readonly pathOutcomes = new Map<string, PathOutcome>();

  compareString(
    fieldPath: string,
    expectedRaw: string | null | undefined,
    actualRaw: string | null | undefined,
  ): void {
    const expected = normalizeStringValue(expectedRaw);
    const actual = normalizeStringValue(actualRaw);
    this.total += 1;

    if (expected === null) {
      if (actual === null) {
        this.correct += 1;
        this.pathOutcomes.set(fieldPath, 'correct');
      } else {
        this.wrong += 1;
        this.wrongPaths.push(fieldPath);
        this.pathOutcomes.set(fieldPath, 'wrong');
      }
      return;
    }

    if (actual === null) {
      this.wrong += 1;
      this.nullCount += 1;
      this.wrongPaths.push(fieldPath);
      this.nullPaths.push(fieldPath);
      this.pathOutcomes.set(fieldPath, 'wrong_null');
      return;
    }

    if (actual === expected) {
      this.correct += 1;
      this.pathOutcomes.set(fieldPath, 'correct');
    } else {
      this.wrong += 1;
      this.wrongPaths.push(fieldPath);
      this.pathOutcomes.set(fieldPath, 'wrong');
    }
  }

  compareBoolean(
    fieldPath: string,
    expectedRaw: boolean | undefined,
    actualRaw: boolean | null | undefined,
  ): void {
    const expected = expectedRaw ?? false;
    this.total += 1;

    if (actualRaw === null || actualRaw === undefined) {
      this.wrong += 1;
      this.nullCount += 1;
      this.wrongPaths.push(fieldPath);
      this.nullPaths.push(fieldPath);
      this.pathOutcomes.set(fieldPath, 'wrong_null');
      return;
    }

    if (actualRaw === expected) {
      this.correct += 1;
      this.pathOutcomes.set(fieldPath, 'correct');
    } else {
      this.wrong += 1;
      this.wrongPaths.push(fieldPath);
      this.pathOutcomes.set(fieldPath, 'wrong');
    }
  }

  recordSurplus(indexPath: string): void {
    this.total += 1;
    this.wrong += 1;
    this.wrongPaths.push(indexPath);
    this.surplusPaths.push(indexPath);
    this.pathOutcomes.set(indexPath, 'surplus');
  }
}

function compareStringArray(
  acc: FieldAccumulator,
  basePath: string,
  expectedItems: string[],
  actualItems: string[],
): void {
  for (let i = 0; i < expectedItems.length; i++) {
    acc.compareString(
      `${basePath}[${i}]`,
      expectedItems[i],
      i < actualItems.length ? actualItems[i] : null,
    );
  }
  for (let i = expectedItems.length; i < actualItems.length; i++) {
    acc.recordSurplus(`${basePath}[${i}]`);
  }
}

function evaluateDraft(
  fixture: string,
  expected: ExpectedDraft,
  actual: ResumeImportDraft,
  provenanceNulledPaths: string[],
  provenanceDecoupledRoles: string[],
  latencyMs: number,
  model: string,
): FixtureEvalMetrics {
  const acc = new FieldAccumulator();

  const expBasics = expected.basics ?? {};
  const actBasics = actual.basics;

  acc.compareString('basics.fullName', expBasics.fullName, actBasics.fullName);
  acc.compareString('basics.headline', expBasics.headline, actBasics.headline);
  acc.compareString('basics.email', expBasics.email, actBasics.email);
  acc.compareString('basics.phone', expBasics.phone, actBasics.phone ?? null);
  acc.compareString(
    'basics.location',
    expBasics.location,
    actBasics.location ?? null,
  );

  const expLinks = expBasics.links ?? [];
  const actLinks = actBasics.links ?? [];
  for (let i = 0; i < expLinks.length; i++) {
    acc.compareString(
      `basics.links[${i}].url`,
      expLinks[i]?.url,
      i < actLinks.length ? actLinks[i]?.url : null,
    );
  }
  for (let i = expLinks.length; i < actLinks.length; i++) {
    acc.recordSurplus(`basics.links[${i}]`);
  }

  acc.compareString('summary', expected.summary, actual.summary);

  const expExperience = expected.experience ?? [];
  const actExperience = actual.experience ?? [];
  for (let i = 0; i < expExperience.length; i++) {
    const expRole = expExperience[i];
    const actRole = i < actExperience.length ? actExperience[i] : undefined;
    const prefix = `experience[${i}]`;

    acc.compareString(`${prefix}.company`, expRole.company, actRole?.company);
    acc.compareString(`${prefix}.title`, expRole.title, actRole?.title);
    acc.compareString(
      `${prefix}.location`,
      expRole.location,
      actRole?.location ?? null,
    );
    acc.compareString(`${prefix}.start`, expRole.start, actRole?.start);
    acc.compareString(`${prefix}.end`, expRole.end, actRole?.end);
    acc.compareBoolean(`${prefix}.current`, expRole.current, actRole?.current);
    compareStringArray(
      acc,
      `${prefix}.bullets`,
      expRole.bullets ?? [],
      actRole?.bullets ?? [],
    );
  }
  for (let i = expExperience.length; i < actExperience.length; i++) {
    acc.recordSurplus(`experience[${i}]`);
  }

  const expProjects = expected.projects ?? [];
  const actProjects = actual.projects ?? [];
  for (let i = 0; i < expProjects.length; i++) {
    const expProj = expProjects[i];
    const actProj = i < actProjects.length ? actProjects[i] : undefined;
    const prefix = `projects[${i}]`;

    acc.compareString(`${prefix}.name`, expProj.name, actProj?.name);
    acc.compareString(`${prefix}.url`, expProj.url, actProj?.url ?? null);
    compareStringArray(
      acc,
      `${prefix}.bullets`,
      expProj.bullets ?? [],
      actProj?.bullets ?? [],
    );
  }
  for (let i = expProjects.length; i < actProjects.length; i++) {
    acc.recordSurplus(`projects[${i}]`);
  }

  const expEducation = expected.education ?? [];
  const actEducation = actual.education ?? [];
  for (let i = 0; i < expEducation.length; i++) {
    const expEdu = expEducation[i];
    const actEdu = i < actEducation.length ? actEducation[i] : undefined;
    const prefix = `education[${i}]`;

    acc.compareString(`${prefix}.school`, expEdu.school, actEdu?.school);
    acc.compareString(`${prefix}.degree`, expEdu.degree, actEdu?.degree);
    acc.compareString(`${prefix}.start`, expEdu.start, actEdu?.start);
    acc.compareString(`${prefix}.end`, expEdu.end, actEdu?.end);
  }
  for (let i = expEducation.length; i < actEducation.length; i++) {
    acc.recordSurplus(`education[${i}]`);
  }

  const expSkills = expected.skills ?? [];
  const actSkills = actual.skills ?? [];
  for (let i = 0; i < expSkills.length; i++) {
    const expGroup = expSkills[i];
    const actGroup = i < actSkills.length ? actSkills[i] : undefined;
    const prefix = `skills[${i}]`;

    acc.compareString(`${prefix}.group`, expGroup.group, actGroup?.group);
    compareStringArray(
      acc,
      `${prefix}.items`,
      expGroup.items ?? [],
      actGroup?.items ?? [],
    );
  }
  for (let i = expSkills.length; i < actSkills.length; i++) {
    acc.recordSurplus(`skills[${i}]`);
  }

  const expFlags = expected.review_flags ?? [];
  const actFlags = actual.review_flags ?? [];
  const consumedActualFlags = new Set<number>();
  const expectsLengthLimitFlags = expFlags.some(
    (f) => f.reason === 'EXCEEDS_LENGTH_LIMIT',
  );

  for (let i = 0; i < expFlags.length; i++) {
    const expFlag = expFlags[i];
    const flagPath = `review_flags[${i}]`;
    const expPathTrimmed = expFlag.path.trim();
    const expExcerptNormalized = normalizeReviewFlagExcerpt(expFlag.excerpt);

    if (expFlag.reason === 'EXCEEDS_LENGTH_LIMIT') {
      const matchIdx = actFlags.findIndex(
        (af, idx) =>
          !consumedActualFlags.has(idx) &&
          af.reason === 'EXCEEDS_LENGTH_LIMIT' &&
          af.path.trim() === expPathTrimmed,
      );
      if (matchIdx === -1) {
        acc.total += 1;
        acc.wrong += 1;
        acc.nullCount += 1;
        acc.wrongPaths.push(flagPath);
        acc.nullPaths.push(flagPath);
        acc.pathOutcomes.set(flagPath, 'wrong_null');
      } else {
        consumedActualFlags.add(matchIdx);
        if (expFlag.excerpt !== undefined) {
          acc.compareString(
            flagPath,
            expExcerptNormalized,
            normalizeReviewFlagExcerpt(actFlags[matchIdx].excerpt),
          );
        } else {
          acc.total += 1;
          acc.correct += 1;
          acc.pathOutcomes.set(flagPath, 'correct');
        }
      }
    }
  }

  let surplusFlagIdx = expFlags.length;
  for (let idx = 0; idx < actFlags.length; idx++) {
    if (consumedActualFlags.has(idx)) {
      continue;
    }
    if (actFlags[idx].reason === 'EXCEEDS_LENGTH_LIMIT' && expectsLengthLimitFlags) {
      acc.recordSurplus(`review_flags[${surplusFlagIdx}]`);
      surplusFlagIdx += 1;
    }
  }

  // UNSLOTTED_CONTENT: content coverage as ONE field per fixture.
  const actualWordCounts = new Map<string, number>();
  for (const w of unslottedWords(actFlags)) {
    actualWordCounts.set(w, (actualWordCounts.get(w) ?? 0) + 1);
  }
  let missingWords = 0;
  const expectedWords = unslottedWords(expFlags);
  for (const w of expectedWords) {
    const count = actualWordCounts.get(w) ?? 0;
    if (count > 0) {
      actualWordCounts.set(w, count - 1);
    } else {
      missingWords += 1;
    }
  }
  let surplusWords = 0;
  for (const count of actualWordCounts.values()) {
    surplusWords += count;
  }

  acc.total += 1;
  if (missingWords === 0 && surplusWords === 0) {
    acc.correct += 1;
    acc.pathOutcomes.set('review_flags', 'correct');
  } else {
    acc.wrong += 1;
    acc.wrongPaths.push('review_flags');
    if (expectedWords.length > 0 && missingWords === expectedWords.length) {
      acc.nullCount += 1;
      acc.nullPaths.push('review_flags');
      acc.pathOutcomes.set('review_flags', 'wrong_null');
    } else {
      acc.pathOutcomes.set('review_flags', 'wrong');
    }
  }

  return {
    fixture,
    failed: false,
    total: acc.total,
    correct: acc.correct,
    wrong: acc.wrong,
    nullCount: acc.nullCount,
    unslottedMissing: missingWords,
    unslottedSurplus: surplusWords,
    latencyMs,
    model,
    wrongPaths: acc.wrongPaths,
    nullPaths: acc.nullPaths,
    surplusPaths: acc.surplusPaths,
    provenanceNulledPaths,
    provenanceDecoupledRoles,
    warningsCount: actual.warnings.length,
    pathOutcomes: acc.pathOutcomes,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function samePathSet(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) {
    return false;
  }
  for (const item of setA) {
    if (!setB.has(item)) {
      return false;
    }
  }
  return true;
}

function findSwapTwinBaseName(stem: string): string | null {
  if (stem.endsWith('.swap')) {
    return stem.slice(0, -'.swap'.length);
  }
  if (stem.endsWith('-swap')) {
    return stem.slice(0, -'-swap'.length);
  }
  if (stem.endsWith('_swap')) {
    return stem.slice(0, -'_swap'.length);
  }
  return null;
}

function expectedToDraft(expected: ExpectedDraft): ResumeImportDraft {
  return ResumeImportDraftSchema.parse({
    basics: {
      fullName: expected.basics?.fullName ?? null,
      headline: expected.basics?.headline ?? '',
      email: expected.basics?.email ?? null,
      phone: expected.basics?.phone ?? null,
      location: expected.basics?.location ?? '',
      links: (expected.basics?.links ?? []).map((l) => ({
        label: l.label ?? '',
        url: l.url ?? null,
      })),
    },
    summary: expected.summary ?? '',
    experience: (expected.experience ?? []).map((exp, idx) => ({
      id: `exp-${idx + 1}`,
      company: exp.company ?? null,
      title: exp.title ?? null,
      location: exp.location ?? '',
      start: exp.start ?? null,
      end: exp.end ?? null,
      current: exp.current ?? false,
      bullets: exp.bullets ?? [],
    })),
    projects: (expected.projects ?? []).map((proj, idx) => ({
      id: `proj-${idx + 1}`,
      name: proj.name ?? null,
      url: proj.url ?? null,
      bullets: proj.bullets ?? [],
    })),
    education: (expected.education ?? []).map((edu, idx) => ({
      id: `edu-${idx + 1}`,
      school: edu.school ?? null,
      degree: edu.degree ?? null,
      start: edu.start ?? null,
      end: edu.end ?? null,
    })),
    skills: (expected.skills ?? []).map((sg) => ({
      group: sg.group ?? '',
      items: sg.items ?? [],
    })),
    warnings: [],
    low_confidence_paths: [],
    review_flags: (expected.review_flags ?? []).map((rf) => ({
      path: rf.path,
      reason: rf.reason,
      ...(rf.message !== undefined ? { message: rf.message } : {}),
      ...(rf.excerpt !== undefined ? { excerpt: rf.excerpt } : {}),
    })),
  });
}

function runSwapInvarianceCheck(results: FixtureEvalMetrics[]): void {
  try {
    const byStem = new Map(results.map((r) => [r.fixture, r]));
    for (const res of results) {
      const baseName = findSwapTwinBaseName(res.fixture);
      if (!baseName) {
        continue;
      }
      const baseRes = byStem.get(baseName);
      if (!baseRes) {
        continue;
      }
      if (baseRes.failed || res.failed) {
        console.log(
          `[swap-invariance] base=${baseName} twin=${res.fixture} status=SKIPPED`,
        );
        continue;
      }
      const sameWrong = samePathSet(baseRes.wrongPaths, res.wrongPaths);
      const sameNull = samePathSet(baseRes.nullPaths, res.nullPaths);
      const status = sameWrong && sameNull ? 'PASS' : 'FAIL';
      console.log(
        `[swap-invariance] base=${baseName} twin=${res.fixture} status=${status} sameWrongPaths=${sameWrong} sameNullPaths=${sameNull}`,
      );
    }
  } catch (err: unknown) {
    const { name, firstLine } = formatErrorOneLine(err);
    console.error(`[step=runSwapInvarianceCheck] threw ${name}: ${firstLine}`);
    throw err;
  }
}

async function runSinglePass(
  runIndex: number,
  totalRuns: number,
  txtFiles: string[],
  provider: LlmProvider | null,
  configuredModel: string,
  pauseMs: number,
  selfCheck: boolean,
  abortAfter: number = DEFAULT_ABORT_AFTER,
): Promise<{ results: FixtureEvalMetrics[]; aborted: boolean }> {
  const results: FixtureEvalMetrics[] = [];
  let consecutiveDegraded = 0;
  let aborted = false;

  if (totalRuns > 1) {
    console.log(`\n=== Run ${runIndex + 1} of ${totalRuns} ===`);
  }

  for (let idx = 0; idx < txtFiles.length; idx++) {
    const txtFile = txtFiles[idx];
    const stem = txtFile.slice(0, -'.txt'.length);
    const txtPath = path.join(FIXTURES_DIR, txtFile);
    const expectedPath = path.join(FIXTURES_DIR, `${stem}.expected.json`);

    if (!selfCheck && pauseMs > 0 && (idx > 0 || runIndex > 0)) {
      await sleep(pauseMs);
    }

    try {
      const [sourceText, expectedRaw] = await Promise.all([
        fs.readFile(txtPath, 'utf8'),
        fs.readFile(expectedPath, 'utf8'),
      ]);
      const expected = JSON.parse(expectedRaw) as ExpectedDraft;

      let metrics: FixtureEvalMetrics;
      if (selfCheck) {
        const selfDraft = expectedToDraft(expected);
        metrics = evaluateDraft(
          stem,
          expected,
          selfDraft,
          [],
          [],
          0,
          configuredModel,
        );
      } else {
        if (!provider) {
          throw new Error('LlmProvider instance is required');
        }
        const parsed = await parseResume(sourceText, provider);
        metrics = evaluateDraft(
          stem,
          expected,
          parsed.draft,
          parsed.provenance.nulledPaths,
          parsed.provenance.decoupledRoles,
          parsed.latencyMs,
          parsed.model,
        );
      }

      results.push(metrics);
      consecutiveDegraded = 0;

      console.log(
        `[fixture=${stem}] total=${metrics.total} correct=${metrics.correct} wrong=${metrics.wrong} null=${metrics.nullCount} latencyMs=${metrics.latencyMs} warningsCount=${metrics.warningsCount} wrongPaths=${JSON.stringify(metrics.wrongPaths)} nullPaths=${JSON.stringify(metrics.nullPaths)} surplusPaths=${JSON.stringify(metrics.surplusPaths)} provenance.nulledPaths=${JSON.stringify(metrics.provenanceNulledPaths)} provenance.decoupledRoles=${JSON.stringify(metrics.provenanceDecoupledRoles)}`,
      );
      console.log(
        `unslotted missing=${metrics.unslottedMissing} surplus=${metrics.unslottedSurplus}`,
      );
    } catch (err: unknown) {
      const { name, firstLine, extra } = formatErrorOneLine(err);
      const failureCategory = classifyFailure(err);
      const errorSummary = `${name}${extra ? ` (${extra})` : ''}: ${firstLine}`;
      console.log(`[fixture=${stem}] FAILED ${errorSummary}`);
      results.push({
        fixture: stem,
        failed: true,
        failureCategory,
        errorSummary,
        total: 0,
        correct: 0,
        wrong: 0,
        nullCount: 0,
        unslottedMissing: 0,
        unslottedSurplus: 0,
        latencyMs: 0,
        wrongPaths: [],
        nullPaths: [],
        surplusPaths: [],
        provenanceNulledPaths: [],
        provenanceDecoupledRoles: [],
        warningsCount: 0,
        pathOutcomes: new Map(),
      });

      if (failureCategory === 'timeout' || failureCategory === 'api_503') {
        consecutiveDegraded += 1;
        if (consecutiveDegraded >= abortAfter) {
          aborted = true;
          break;
        }
      } else {
        consecutiveDegraded = 0;
      }
    }
  }

  if (aborted) {
    console.log('aborted: API degraded');
    reportFailureCounts([results]);
    return { results, aborted: true };
  }

  const totalFields = results.reduce((sum, r) => sum + r.total, 0);
  const totalCorrect = results.reduce((sum, r) => sum + r.correct, 0);
  const totalWrong = results.reduce((sum, r) => sum + r.wrong, 0);
  const totalNull = results.reduce((sum, r) => sum + r.nullCount, 0);
  const failedFixturesList = results
    .filter((r) => r.failed)
    .map((r) => r.fixture);
  const totalLatency = results.reduce((sum, r) => sum + r.latencyMs, 0);
  const modelName = results.find((r) => r.model)?.model ?? configuredModel;

  console.log(
    `[summary${totalRuns > 1 ? ` run=${runIndex + 1}` : ''}] model=${modelName} fixtures=${results.length} failedFixtures=${failedFixturesList.length} total=${totalFields} correct=${totalCorrect} wrong=${totalWrong} null=${totalNull} latencyMs=${totalLatency}`,
  );

  runSwapInvarianceCheck(results);

  console.log(
    `[final${totalRuns > 1 ? ` run=${runIndex + 1}` : ''}] fixturesRun=${results.length} failed=${failedFixturesList.length} noResultFixtures=${JSON.stringify(failedFixturesList)}`,
  );

  return { results, aborted: false };
}

function reportMultiRunDiffs(allRuns: FixtureEvalMetrics[][]): void {
  try {
    if (allRuns.length <= 1) {
      return;
    }
    const fixtures = allRuns[0].map((r) => r.fixture);
    console.log('\n=== Multi-Run Stability Check ===');
    for (const fixture of fixtures) {
      const fixtureRuns = allRuns
        .map((run) => run.find((r) => r.fixture === fixture))
        .filter((r): r is FixtureEvalMetrics => r !== undefined);
      const successfulRuns = fixtureRuns.filter((r) => !r.failed);

      const allPaths = new Set<string>();
      for (const run of successfulRuns) {
        for (const p of run.pathOutcomes.keys()) {
          allPaths.add(p);
        }
      }

      const differingPaths: string[] = [];
      if (successfulRuns.length >= 2) {
        for (const p of allPaths) {
          const outcomes = new Set(
            successfulRuns.map((r) => r.pathOutcomes.get(p) ?? 'absent'),
          );
          if (outcomes.size > 1) {
            differingPaths.push(p);
          }
        }
      }

      console.log(
        `[multi-run fixture=${fixture}] resultsProduced=${successfulRuns.length}/${fixtureRuns.length} differingPaths=${JSON.stringify(differingPaths)}`,
      );
    }
  } catch (err: unknown) {
    const { name, firstLine } = formatErrorOneLine(err);
    console.error(`[step=reportMultiRunDiffs] threw ${name}: ${firstLine}`);
    throw err;
  }
}

function reportFailureCounts(
  allRuns: FixtureEvalMetrics[][],
): Record<FailureCategory, number> {
  const counts: Record<FailureCategory, number> = {
    timeout: 0,
    api_429: 0,
    api_503: 0,
    api_other: 0,
    empty_response: 0,
    schema_validation: 0,
    empty_input: 0,
    other: 0,
  };
  for (const run of allRuns) {
    for (const r of run) {
      if (r.failed) {
        const cat = r.failureCategory ?? 'other';
        counts[cat] += 1;
      }
    }
  }
  console.log(
    `[failure-counts] timeout=${counts.timeout} api_429=${counts.api_429} api_503=${counts.api_503} api_other=${counts.api_other} empty_response=${counts.empty_response} schema_validation=${counts.schema_validation} empty_input=${counts.empty_input} other=${counts.other}`,
  );
  return counts;
}

async function runSelfCheckFailureProbe(
  configuredModel: string,
  allTxtFiles: string[],
): Promise<void> {
  const expectedRaw = await fs.readFile(
    path.join(FIXTURES_DIR, '06-extra-sections.expected.json'),
    'utf8',
  );
  const expected = JSON.parse(expectedRaw) as ExpectedDraft;
  const probe = (label: string, mutate: (d: ResumeImportDraft) => void) => {
    const draft = expectedToDraft(expected);
    mutate(draft);
    const m = evaluateDraft(label, expected, draft, [], [], 0, configuredModel);
    console.log(
      `[${label}] total=${m.total} correct=${m.correct} wrong=${m.wrong} null=${m.nullCount} surplus=${m.surplusPaths.length} wrongPaths=${JSON.stringify(m.wrongPaths)} surplusPaths=${JSON.stringify(m.surplusPaths)}`,
    );
    console.log(
      `unslotted missing=${m.unslottedMissing} surplus=${m.unslottedSurplus}`,
    );
    return m;
  };
  const unslottedExcerpts = (expected.review_flags ?? [])
    .filter((f) => f.reason === 'UNSLOTTED_CONTENT')
    .map((f) => f.excerpt ?? '');
  if (unslottedExcerpts.length < 2) {
    throw new Error('Self-check fixture needs at least two UNSLOTTED_CONTENT flags');
  }
  const withUnslotted = (d: ResumeImportDraft, excerpts: string[]) => {
    d.review_flags = [
      ...d.review_flags.filter((f) => f.reason !== 'UNSLOTTED_CONTENT'),
      ...excerpts.map((excerpt, i) => ({
        path: `unslotted[${i}]`,
        reason: 'UNSLOTTED_CONTENT' as const,
        excerpt,
      })),
    ];
  };
  const groupedExcerpt = unslottedExcerpts.join('\n');
  const expectPerfect = (m: FixtureEvalMetrics, label: string) => {
    if (
      m.wrong !== 0 ||
      m.nullCount !== 0 ||
      m.surplusPaths.length !== 0 ||
      m.correct !== m.total ||
      m.unslottedMissing !== 0 ||
      m.unslottedSurplus !== 0
    ) {
      throw new Error(
        `Expected ${label} probe to score 100% but got correct=${m.correct}/${m.total} wrong=${m.wrong} missing=${m.unslottedMissing} surplus=${m.unslottedSurplus}`,
      );
    }
  };

  // Same words in one grouped item, and split one word per item in reverse order: both 100%.
  const grouped = probe('self-check-unslotted-grouped', (d) =>
    withUnslotted(d, [groupedExcerpt]),
  );
  expectPerfect(grouped, 'grouped');

  const split = probe('self-check-unslotted-split', (d) =>
    withUnslotted(d, groupedExcerpt.split(/\s+/).filter(Boolean).reverse()),
  );
  expectPerfect(split, 'split');

  const newline = probe('self-check-unslotted-newline', (d) =>
    withUnslotted(d, unslottedExcerpts.map((e) => e.replace(' ', '\n  '))),
  );
  expectPerfect(newline, 'newline');

  const removedWord = probe('self-check-unslotted-removed-word', (d) =>
    withUnslotted(d, [groupedExcerpt.replace(/\s*\S+$/, '')]),
  );
  if (
    removedWord.wrong !== 1 ||
    removedWord.unslottedMissing !== 1 ||
    removedWord.unslottedSurplus !== 0 ||
    removedWord.total !== grouped.total ||
    removedWord.wrongPaths[0] !== 'review_flags'
  ) {
    throw new Error(
      `Expected removed-word probe wrong=1 with missing=1 (total=${grouped.total}) but got wrong=${removedWord.wrong} missing=${removedWord.unslottedMissing} surplus=${removedWord.unslottedSurplus} total=${removedWord.total}`,
    );
  }

  const addedWord = probe('self-check-unslotted-added-word', (d) =>
    withUnslotted(d, [`${groupedExcerpt} extraword`]),
  );
  if (
    addedWord.wrong !== 1 ||
    addedWord.unslottedSurplus !== 1 ||
    addedWord.unslottedMissing !== 0 ||
    addedWord.total !== grouped.total ||
    addedWord.wrongPaths[0] !== 'review_flags'
  ) {
    throw new Error(
      `Expected added-word probe wrong=1 with surplus=1 (total=${grouped.total}) but got wrong=${addedWord.wrong} surplus=${addedWord.unslottedSurplus} missing=${addedWord.unslottedMissing} total=${addedWord.total}`,
    );
  }

  const allMissing = probe('self-check-unslotted-all-missing', (d) =>
    withUnslotted(d, []),
  );
  if (
    allMissing.wrong !== 1 ||
    allMissing.nullCount !== 1 ||
    allMissing.unslottedMissing !==
    unslottedWords(expected.review_flags ?? []).length
  ) {
    throw new Error(
      `Expected all-missing probe wrong=1 null=1 but got wrong=${allMissing.wrong} null=${allMissing.nullCount}`,
    );
  }

  // Unslotted punctuation: separator punctuation is replaced with space; $ % + # & @ / are kept.
  const origReviewFlags = expected.review_flags;
  try {
    expected.review_flags = [
      {
        path: 'unslotted[0]',
        reason: 'UNSLOTTED_CONTENT',
        excerpt: 'A, B',
      },
    ];

    // A, B against A; B scores 100%
    const unslottedPunctuationMatch = probe(
      'self-check-unslotted-punctuation-match',
      (d) => withUnslotted(d, ['A; B']),
    );
    expectPerfect(unslottedPunctuationMatch, 'unslotted-punctuation-match');

    // A removed word scores wrong=1
    const unslottedRemovedWord = probe(
      'self-check-unslotted-punctuation-removed-word',
      (d) => withUnslotted(d, ['A;']),
    );
    if (
      unslottedRemovedWord.wrong !== 1 ||
      unslottedRemovedWord.unslottedMissing !== 1 ||
      unslottedRemovedWord.unslottedSurplus !== 0 ||
      unslottedRemovedWord.wrongPaths[0] !== 'review_flags'
    ) {
      throw new Error(
        `Expected removed-word probe wrong=1 with missing=1, got wrong=${unslottedRemovedWord.wrong} missing=${unslottedRemovedWord.unslottedMissing}`,
      );
    }

    // $500 against 500 scores wrong=1
    expected.review_flags = [
      {
        path: 'unslotted[0]',
        reason: 'UNSLOTTED_CONTENT',
        excerpt: '$500',
      },
    ];
    const unslottedSymbolDiff = probe(
      'self-check-unslotted-symbol-diff',
      (d) => withUnslotted(d, ['500']),
    );
    if (
      unslottedSymbolDiff.wrong !== 1 ||
      unslottedSymbolDiff.unslottedMissing !== 1 ||
      unslottedSymbolDiff.unslottedSurplus !== 1 ||
      unslottedSymbolDiff.wrongPaths[0] !== 'review_flags'
    ) {
      throw new Error(
        `Expected $500 against 500 probe wrong=1, got wrong=${unslottedSymbolDiff.wrong} missing=${unslottedSymbolDiff.unslottedMissing} surplus=${unslottedSymbolDiff.unslottedSurplus}`,
      );
    }
  } finally {
    expected.review_flags = origReviewFlags;
  }

  // String comparison: only a hyphen between two letters followed by one space is affected.
  const hyphenMatch = probe('self-check-hyphen-match', (d) => {
    d.summary = (expected.summary ?? '').replace(
      'high-throughput',
      'high- throughput',
    );
  });
  expectPerfect(hyphenMatch, 'hyphen-match');
  if (hyphenMatch.wrong !== 0 || hyphenMatch.wrongPaths.length !== 0) {
    throw new Error(
      `Expected hyphen-match wrong=0 with empty wrongPaths, got wrong=${hyphenMatch.wrong} wrongPaths=${JSON.stringify(hyphenMatch.wrongPaths)}`,
    );
  }

  const hyphenDiff = probe('self-check-hyphen-diff', (d) => {
    d.summary = (expected.summary ?? '').replace(
      'high-throughput',
      'high- throughpux',
    );
  });
  if (
    hyphenDiff.wrong !== 1 ||
    hyphenDiff.nullCount !== 0 ||
    hyphenDiff.wrongPaths[0] !== 'summary' ||
    hyphenDiff.total !== hyphenMatch.total
  ) {
    throw new Error(
      `Expected hyphen-diff probe wrong=1 at summary but got wrong=${hyphenDiff.wrong} paths=${JSON.stringify(hyphenDiff.wrongPaths)}`,
    );
  }

  // Dash separator: 'A - B' is not between two letters without space before the hyphen, so it is unaltered.
  const origSummary = expected.summary;
  expected.summary = 'A - B';
  const dashSeparator = probe('self-check-dash-separator', (d) => {
    d.summary = 'A -B';
  });
  expected.summary = origSummary;
  if (
    dashSeparator.wrong !== 1 ||
    dashSeparator.wrongPaths.length !== 1 ||
    dashSeparator.wrongPaths[0] !== 'summary'
  ) {
    throw new Error(
      `Expected dash-separator probe wrong=1 at summary but got wrong=${dashSeparator.wrong} paths=${JSON.stringify(dashSeparator.wrongPaths)}`,
    );
  }

  const syntheticTimeout = {
    name: 'ProviderError',
    kind: 'timeout',
    provider: 'gemini',
  };
  const synthetic429 = {
    name: 'ProviderError',
    kind: 'api',
    provider: 'gemini',
    status: 429,
  };
  const syntheticTimeoutMetrics: FixtureEvalMetrics = {
    fixture: 'self-check-synthetic-timeout',
    failed: true,
    failureCategory: classifyFailure(syntheticTimeout),
    total: 0,
    correct: 0,
    wrong: 0,
    nullCount: 0,
    unslottedMissing: 0,
    unslottedSurplus: 0,
    latencyMs: 0,
    wrongPaths: [],
    nullPaths: [],
    surplusPaths: [],
    provenanceNulledPaths: [],
    provenanceDecoupledRoles: [],
    warningsCount: 0,
    pathOutcomes: new Map(),
  };
  const synthetic429Metrics: FixtureEvalMetrics = {
    fixture: 'self-check-synthetic-429',
    failed: true,
    failureCategory: classifyFailure(synthetic429),
    total: 0,
    correct: 0,
    wrong: 0,
    nullCount: 0,
    unslottedMissing: 0,
    unslottedSurplus: 0,
    latencyMs: 0,
    wrongPaths: [],
    nullPaths: [],
    surplusPaths: [],
    provenanceNulledPaths: [],
    provenanceDecoupledRoles: [],
    warningsCount: 0,
    pathOutcomes: new Map(),
  };
  const counts = reportFailureCounts([
    [syntheticTimeoutMetrics, synthetic429Metrics],
  ]);
  if (counts.timeout !== 1 || counts.api_429 !== 1) {
    throw new Error(
      `Expected synthetic timeout=1 and api_429=1 but got timeout=${counts.timeout} api_429=${counts.api_429}`,
    );
  }

  // --- Proof 1: --only <stem> ---
  if (parseOnlyArg(['--only', '09-real-extraction']) !== '09-real-extraction') {
    throw new Error('Expected parseOnlyArg with separate arg to parse stem');
  }
  if (parseOnlyArg(['--only=09-real-extraction']) !== '09-real-extraction') {
    throw new Error('Expected parseOnlyArg with = to parse stem');
  }
  if (parseOnlyArg(['--only']) !== null) {
    throw new Error('Expected parseOnlyArg with no value to return null');
  }
  if (parseOnlyArg(['--only', '--other']) !== null) {
    throw new Error('Expected parseOnlyArg with flag value to return null');
  }
  if (parseOnlyArg([]) !== null) {
    throw new Error('Expected parseOnlyArg with empty argv to return null');
  }

  const sampleList = [
    '01-summary-in-banner.txt',
    '06-extra-sections.txt',
    '09-real-extraction.txt',
  ];
  const onlyExact = filterFixturesByOnly(sampleList, '06-extra-sections');
  if (onlyExact.length !== 1 || onlyExact[0] !== '06-extra-sections.txt') {
    throw new Error(
      `Expected filterFixturesByOnly to return 06-extra-sections.txt, got ${JSON.stringify(onlyExact)}`,
    );
  }
  const onlyWithExt = filterFixturesByOnly(sampleList, '09-real-extraction.txt');
  if (onlyWithExt.length !== 1 || onlyWithExt[0] !== '09-real-extraction.txt') {
    throw new Error(
      `Expected filterFixturesByOnly with .txt extension to return 09-real-extraction.txt, got ${JSON.stringify(onlyWithExt)}`,
    );
  }
  const onlyMissing = filterFixturesByOnly(sampleList, 'nonexistent');
  if (onlyMissing.length !== 0) {
    throw new Error(
      `Expected filterFixturesByOnly with nonexistent stem to return empty, got ${JSON.stringify(onlyMissing)}`,
    );
  }

  const singleFixturePass = await runSinglePass(
    0,
    1,
    ['06-extra-sections.txt'],
    null,
    configuredModel,
    0,
    true,
    DEFAULT_ABORT_AFTER,
  );
  if (
    singleFixturePass.results.length !== 1 ||
    singleFixturePass.results[0].fixture !== '06-extra-sections' ||
    singleFixturePass.aborted
  ) {
    throw new Error(
      `Expected single fixture run to evaluate exactly 1 fixture without abort, got count=${singleFixturePass.results.length} aborted=${singleFixturePass.aborted}`,
    );
  }

  // --- Proof 2: --abort-after N (default 3) ---
  if (parseAbortAfterArg([]) !== 3) {
    throw new Error(
      `Expected default abort-after to be 3, got ${parseAbortAfterArg([])}`,
    );
  }
  if (parseAbortAfterArg(['--abort-after', '5']) !== 5) {
    throw new Error('Expected parseAbortAfterArg with separate arg to return 5');
  }
  if (parseAbortAfterArg(['--abort-after=2']) !== 2) {
    throw new Error('Expected parseAbortAfterArg with = to return 2');
  }
  if (parseAbortAfterArg(['--abort-after', 'invalid']) !== 3) {
    throw new Error('Expected parseAbortAfterArg with invalid number to return default 3');
  }
  if (parseAbortAfterArg(['--abort-after', '0']) !== 3) {
    throw new Error('Expected parseAbortAfterArg with 0 to return default 3');
  }

  const synthetic503 = {
    name: 'ProviderError',
    kind: 'api',
    provider: 'gemini',
    status: 503,
  };

  const makeMockProvider = (sequence: Array<unknown | 'ok'>): LlmProvider => {
    let callIdx = 0;
    return {
      name: 'fake' as const,
      // Generic signature satisfies LlmProvider; canned data cast at return site.
      generateStructured: async <T,>(params: { schema: { parse: (v: unknown) => T } }) => {
        const item = sequence[callIdx++];
        if (item !== 'ok') {
          throw item;
        }
        const canned = {
          basics: {
            fullName: 'Candidate',
            headline: null,
            email: null,
            phone: null,
            location: null,
            links: [],
          },
          summary: '',
          experience: [],
          projects: [],
          education: [],
          skills: [],
          unslotted: [],
        };
        return {
          data: params.schema.parse(canned) as T,
          provider: 'fake' as const,
          model: 'mock',
          latencyMs: 0,
        };
      },
    };
  };

  const sampleFixturesForAbort = allTxtFiles.slice(0, 5);

  // 2a: Interrupted streak (429 reset) does not abort with abortAfter=3
  const nonConsecutiveProvider = makeMockProvider([
    syntheticTimeout,
    synthetic429,
    syntheticTimeout,
    synthetic503,
  ]);
  const silentLog = () => { };
  const origLog = console.log;
  let nonConsecutivePass: { results: FixtureEvalMetrics[]; aborted: boolean };
  try {
    console.log = silentLog;
    nonConsecutivePass = await runSinglePass(
      0,
      1,
      sampleFixturesForAbort.slice(0, 4),
      nonConsecutiveProvider,
      configuredModel,
      0,
      false,
      3,
    );
  } finally {
    console.log = origLog;
  }
  if (nonConsecutivePass.aborted || nonConsecutivePass.results.length !== 4) {
    throw new Error(
      `Expected non-consecutive degraded failures to not abort (aborted=${nonConsecutivePass.aborted}, count=${nonConsecutivePass.results.length})`,
    );
  }

  // 2b: Success resets streak: timeout, 503, ok, timeout does not abort
  const successResetProvider = makeMockProvider([
    syntheticTimeout,
    synthetic503,
    'ok',
    syntheticTimeout,
  ]);
  let successResetPass: { results: FixtureEvalMetrics[]; aborted: boolean };
  try {
    console.log = silentLog;
    successResetPass = await runSinglePass(
      0,
      1,
      sampleFixturesForAbort.slice(0, 4),
      successResetProvider,
      configuredModel,
      0,
      false,
      3,
    );
  } finally {
    console.log = origLog;
  }
  if (successResetPass.aborted || successResetPass.results.length !== 4) {
    throw new Error(
      `Expected success to reset degraded streak (aborted=${successResetPass.aborted}, count=${successResetPass.results.length})`,
    );
  }

  // 2c: N consecutive timeout or 503 failures stops the run and prints 'aborted: API degraded' with counts
  const abortProvider = makeMockProvider([
    syntheticTimeout,
    syntheticTimeout,
    synthetic503,
    syntheticTimeout,
    syntheticTimeout,
  ]);
  const interceptedLogs: string[] = [];
  let abortPass: { results: FixtureEvalMetrics[]; aborted: boolean };
  try {
    console.log = (...args: unknown[]) => {
      interceptedLogs.push(args.map(String).join(' '));
      origLog(...args);
    };
    abortPass = await runSinglePass(
      0,
      1,
      sampleFixturesForAbort,
      abortProvider,
      configuredModel,
      0,
      false,
      3,
    );
  } finally {
    console.log = origLog;
  }

  if (!abortPass.aborted) {
    throw new Error('Expected abortPass to be marked aborted=true after 3 consecutive failures');
  }
  if (abortPass.results.length !== 3) {
    throw new Error(
      `Expected abortPass to stop after 3 fixtures, executed: ${abortPass.results.length}`,
    );
  }
  if (!interceptedLogs.includes('aborted: API degraded')) {
    throw new Error(
      `Expected 'aborted: API degraded' to be printed in output: ${JSON.stringify(interceptedLogs)}`,
    );
  }
  const fcLine = interceptedLogs.find((l) => l.startsWith('[failure-counts]'));
  if (
    !fcLine ||
    !fcLine.includes('timeout=2') ||
    !fcLine.includes('api_503=1')
  ) {
    throw new Error(
      `Expected failure-counts line to include timeout=2 api_503=1, got: ${fcLine}`,
    );
  }

  // 2d: Custom abortAfter = 2 stops after 2 consecutive failures
  const customAbortProvider = makeMockProvider([
    syntheticTimeout,
    synthetic503,
    syntheticTimeout,
  ]);
  let customAbortPass: { results: FixtureEvalMetrics[]; aborted: boolean };
  try {
    console.log = silentLog;
    customAbortPass = await runSinglePass(
      0,
      1,
      sampleFixturesForAbort.slice(0, 3),
      customAbortProvider,
      configuredModel,
      0,
      false,
      2,
    );
  } finally {
    console.log = origLog;
  }
  if (!customAbortPass.aborted || customAbortPass.results.length !== 2) {
    throw new Error(
      `Expected abort-after=2 to stop after 2 fixtures, got count=${customAbortPass.results.length} aborted=${customAbortPass.aborted}`,
    );
  }
}

async function discoverFixtureTxtFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(FIXTURES_DIR);
    const expectedJsonSet = new Set(
      entries.filter((f) => f.endsWith('.expected.json')),
    );
    return entries
      .filter(
        (f) =>
          f.endsWith('.txt') &&
          f.toLowerCase() !== 'readme.txt' &&
          expectedJsonSet.has(`${f.slice(0, -'.txt'.length)}.expected.json`),
      )
      .sort();
  } catch (err: unknown) {
    const { name, firstLine } = formatErrorOneLine(err);
    console.error(`[step=discoverFixtureTxtFiles] threw ${name}: ${firstLine}`);
    throw err;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const selfCheck = hasSelfCheckArg(argv);
  const runs = parseRunsArg(argv);
  const pauseMs = parsePauseMsArg(argv);
  const abortAfter = parseAbortAfterArg(argv);
  const only = parseOnlyArg(argv);
  const configuredModel = resolveGeminiModel(process.env);

  let provider: GeminiProvider | null = null;
  if (!selfCheck) {
    if (!process.env.GEMINI_API_KEY) {
      console.error('Missing required environment variable: GEMINI_API_KEY');
      process.exit(1);
    }
    provider = new GeminiProvider({ model: configuredModel });
  }

  const allTxtFiles = await discoverFixtureTxtFiles();
  const txtFiles = filterFixturesByOnly(allTxtFiles, only);
  if (only && txtFiles.length === 0) {
    console.error(`Fixture not found for --only: ${only}`);
    process.exit(1);
  }

  const allRuns: FixtureEvalMetrics[][] = [];
  let wasAborted = false;
  for (let r = 0; r < runs; r++) {
    const passResult = await runSinglePass(
      r,
      runs,
      txtFiles,
      provider,
      configuredModel,
      pauseMs,
      selfCheck,
      abortAfter,
    );
    allRuns.push(passResult.results);
    if (passResult.aborted) {
      wasAborted = true;
      break;
    }
  }

  if (wasAborted) {
    process.exit(1);
  }

  reportMultiRunDiffs(allRuns);
  if (selfCheck) {
    await runSelfCheckFailureProbe(configuredModel, allTxtFiles);
  } else {
    reportFailureCounts(allRuns);
  }
}

main().catch((err: unknown) => {
  const { name, firstLine } = formatErrorOneLine(err);
  console.error(`Eval script aborted in main (${name}: ${firstLine}).`);
  process.exit(1);
});
