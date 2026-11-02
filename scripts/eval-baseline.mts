/**
 * Baseline evaluation script for Stage 1 plain-text resume parsing.
 *
 * Field comparison contract:
 * - Empty string ('') and null are equivalent for basics.headline, basics.location, and summary.
 * - For company, title, school, and degree (as well as other nullable string fields), an empty
 *   string ('') counts as null.
 * - Dates (start, end) are compared as written (exact match after trimming).
 * - Link labels (basics.links[i].label) are ignored; only basics.links[i].url is compared.
 * - id, warnings, low_confidence_paths, and review_flags are ignored in field accuracy scoring.
 * - A null (or equivalent empty string) counts as wrong only when the expected value is non-null.
 * - Expected '' (or null) vs actual non-empty is counted as wrong (e.g. negative-control fixtures).
 * - Extra array items in actual beyond expected length count as wrong at their index path and are
 *   also listed in surplusPaths.
 * - Never logs resume text, extracted values, warning text, or API keys.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveGeminiModel } from '../lib/ai/config';
import { ParseError, parseResume } from '../lib/ai/parsers/resume-parser';
import { ProviderError } from '../lib/ai/provider';
import { GeminiProvider } from '../lib/ai/providers/gemini';
import { ResumeImportDraftSchema, type ResumeImportDraft } from '../lib/ai/schemas';

const FIXTURES_DIR = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'eval',
  'resumes',
);
const DEFAULT_PAUSE_BETWEEN_CALLS_MS = 1000;

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

interface ExpectedDraft {
  basics?: ExpectedBasics;
  summary?: string | null;
  experience?: ExpectedExperienceItem[];
  projects?: ExpectedProjectItem[];
  education?: ExpectedEducationItem[];
  skills?: ExpectedSkillGroup[];
}

type PathOutcome = 'correct' | 'wrong' | 'wrong_null' | 'surplus';
type FailureCategory = 'timeout' | 'api_429' | 'api_503' | 'other';

interface FixtureEvalMetrics {
  fixture: string;
  failed: boolean;
  failureCategory?: FailureCategory;
  errorSummary?: string;
  total: number;
  correct: number;
  wrong: number;
  nullCount: number;
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

function classifyFailure(err: unknown): FailureCategory {
  if (err instanceof ProviderError) {
    if (err.kind === 'timeout') {
      return 'timeout';
    }
    if (err.kind === 'api' && err.status === 429) {
      return 'api_429';
    }
    if (err.kind === 'api' && err.status === 503) {
      return 'api_503';
    }
  }
  return 'other';
}

function formatErrorOneLine(err: unknown): {
  name: string;
  firstLine: string;
  extra: string;
} {
  const name = err instanceof Error ? err.name : 'NonErrorThrown';
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : 'unhandled error';
  const firstLine = (rawMessage.split(/\r?\n/)[0] ?? '').trim();

  if (err instanceof ProviderError) {
    return {
      name,
      firstLine,
      extra: `kind=${err.kind} status=${err.status ?? 'none'}`,
    };
  }
  if (err instanceof ParseError) {
    return {
      name,
      firstLine,
      extra: `code=${err.code}`,
    };
  }
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

function hasSelfCheckArg(argv: string[]): boolean {
  return argv.includes('--self-check');
}

function normalizeStringValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
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

  return {
    fixture,
    failed: false,
    total: acc.total,
    correct: acc.correct,
    wrong: acc.wrong,
    nullCount: acc.nullCount,
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
    review_flags: [],
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
  provider: GeminiProvider | null,
  configuredModel: string,
  pauseMs: number,
  selfCheck: boolean,
): Promise<FixtureEvalMetrics[]> {
  const results: FixtureEvalMetrics[] = [];

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
          throw new Error('GeminiProvider instance is required');
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

      console.log(
        `[fixture=${stem}] total=${metrics.total} correct=${metrics.correct} wrong=${metrics.wrong} null=${metrics.nullCount} latencyMs=${metrics.latencyMs} warningsCount=${metrics.warningsCount} wrongPaths=${JSON.stringify(metrics.wrongPaths)} nullPaths=${JSON.stringify(metrics.nullPaths)} surplusPaths=${JSON.stringify(metrics.surplusPaths)} provenance.nulledPaths=${JSON.stringify(metrics.provenanceNulledPaths)} provenance.decoupledRoles=${JSON.stringify(metrics.provenanceDecoupledRoles)}`,
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
        latencyMs: 0,
        wrongPaths: [],
        nullPaths: [],
        surplusPaths: [],
        provenanceNulledPaths: [],
        provenanceDecoupledRoles: [],
        warningsCount: 0,
        pathOutcomes: new Map(),
      });
    }
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

  return results;
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

function reportFailureCounts(allRuns: FixtureEvalMetrics[][]): void {
  const counts: Record<FailureCategory, number> = {
    timeout: 0,
    api_429: 0,
    api_503: 0,
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
    `[failure-counts] timeout=${counts.timeout} api_429=${counts.api_429} api_503=${counts.api_503} other=${counts.other}`,
  );
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
  const configuredModel = resolveGeminiModel(process.env);

  let provider: GeminiProvider | null = null;
  if (!selfCheck) {
    if (!process.env.GEMINI_API_KEY) {
      console.error('Missing required environment variable: GEMINI_API_KEY');
      process.exit(1);
    }
    provider = new GeminiProvider({ model: configuredModel });
  }

  const txtFiles = await discoverFixtureTxtFiles();

  const allRuns: FixtureEvalMetrics[][] = [];
  for (let r = 0; r < runs; r++) {
    const runMetrics = await runSinglePass(
      r,
      runs,
      txtFiles,
      provider,
      configuredModel,
      pauseMs,
      selfCheck,
    );
    allRuns.push(runMetrics);
  }

  reportMultiRunDiffs(allRuns);
  reportFailureCounts(allRuns);
}

main().catch((err: unknown) => {
  const { name, firstLine } = formatErrorOneLine(err);
  console.error(`Eval script aborted in main (${name}: ${firstLine}).`);
  process.exit(1);
});
