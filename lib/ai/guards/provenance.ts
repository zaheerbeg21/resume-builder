import type { ResumeImportDraft } from '@/lib/ai/schemas';
import type { ProvenanceReport } from '@/types/provenance';

export const CONTAINMENT_THRESHOLD = 0.85; // starting value, tuned on corpus
export const SHORT_FIELD_WORD_LIMIT = 6; // starting value, tuned on corpus
export const NGRAM_SIZE_STANDARD = 3; // starting value, tuned on corpus
export const NGRAM_SIZE_SHORT = 2; // starting value, tuned on corpus
export const SPATIAL_WINDOW_LINES = 4; // starting value, tuned on corpus
export const DATE_SEARCH_MARGIN_LINES = 5; // starting value, tuned on corpus

const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
const NUMBER_TOKEN_REGEX = /[$€£¥₹]?\d+(?:[.,]\d+)*(?:[kKmMbBxX%]|(?:\s*[$€£¥₹]))?/g;

function isCJK(text: string): boolean {
  return CJK_REGEX.test(text);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWhitespace(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isGroundedSubstring(needle: string, haystack: string): boolean {
  if (!needle.trim()) return true;
  const normNeedle = normalizeWhitespace(needle);
  const normHaystack = normalizeWhitespace(haystack);

  if (isCJK(normNeedle)) {
    return normHaystack.includes(normNeedle);
  }

  // Token boundary matching preserving + and #
  const escaped = escapeRegex(normNeedle).replace(/\\\+/g, '\\+').replace(/\\#/g, '\\#');
  const pattern = new RegExp(`(?<=^|[^\\p{L}\\p{N}+#])${escaped}(?=$|[^\\p{L}\\p{N}+#])`, 'iu');
  return pattern.test(normHaystack);
}

const MONTH_NAMES: Record<string, string> = {
  january: '01', jan: '01',
  february: '02', feb: '02',
  march: '03', mar: '03',
  april: '04', apr: '04',
  may: '05',
  june: '06', jun: '06',
  july: '07', jul: '07',
  august: '08', aug: '08',
  september: '09', sep: '09', sept: '09',
  october: '10', oct: '10',
  november: '11', nov: '11',
  december: '12', dec: '12',
};

const ENGLISH_MONTHS_PATTERN =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))';
const DATE_TOKEN_PATTERN = `(?:(?:0?[1-9]|1[0-2])\\/\\d{4}|\\d{4}-(?:0[1-9]|1[0-2])|\\d{4}|${ENGLISH_MONTHS_PATTERN}\\s+\\d{4})`;

function parseDateToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const isoMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }
  const slashMatch = /^(0?[1-9]|1[0-2])\/(\d{4})$/.exec(trimmed);
  if (slashMatch) {
    const mm = slashMatch[1].padStart(2, '0');
    return `${slashMatch[2]}-${mm}`;
  }
  const words = trimmed.toLowerCase().split(/\s+/);
  if (words.length === 2) {
    const [mStr, yStr] = words;
    if (MONTH_NAMES[mStr] && /^\d{4}$/.test(yStr)) {
      return `${yStr}-${MONTH_NAMES[mStr]}`;
    }
  }
  return null;
}

function extractSourceDates(sourceText: string): { normalized: string; raw: string; lineIndex: number }[] {
  const lines = sourceText.split(/\r?\n/);
  const found: { normalized: string; raw: string; lineIndex: number }[] = [];

  const datePattern = new RegExp(`\\b${DATE_TOKEN_PATTERN}\\b`, 'gi');

  lines.forEach((line, lineIndex) => {
    let match: RegExpExecArray | null;
    while ((match = datePattern.exec(line)) !== null) {
      const parsed = parseDateToken(match[0]);
      if (parsed) {
        found.push({ normalized: parsed, raw: match[0], lineIndex });
      }
    }
  });

  return found;
}

function dateMatchesSource(dateStr: string, sourceDates: { normalized: string }[]): boolean {
  const parsed = parseDateToken(dateStr);
  if (!parsed) return false;
  if (/^\d{4}$/.test(parsed)) {
    return sourceDates.some((sd) => sd.normalized.startsWith(parsed));
  }
  return sourceDates.some((sd) => sd.normalized === parsed || sd.normalized === parsed.slice(0, 4));
}

function extractNGrams(words: string[], n: number): string[] {
  if (words.length < n) {
    return words.length > 0 ? [words.join(' ')] : [];
  }
  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function evaluateBulletContainment(
  bullet: string,
  regionText: string
): boolean {
  if (!regionText.trim()) return false;

  // Number / currency token verification
  const bulletTokens = bullet.match(NUMBER_TOKEN_REGEX) || [];
  const normRegion = normalizeWhitespace(regionText);
  for (const token of bulletTokens) {
    const normToken = normalizeWhitespace(token);
    if (!normRegion.includes(normToken)) {
      return false;
    }
  }
  if (isCJK(bullet)) {
    const normBullet = normalizeWhitespace(bullet);
    return normRegion.includes(normBullet);
  }

  const bulletWords = normalizeWhitespace(bullet).split(/\s+/).filter(Boolean);
  const regionWords = normalizeWhitespace(regionText).split(/\s+/).filter(Boolean);
  if (bulletWords.length === 0) return true;

  const n = bulletWords.length <= SHORT_FIELD_WORD_LIMIT ? NGRAM_SIZE_SHORT : NGRAM_SIZE_STANDARD;
  const bulletNGrams = extractNGrams(bulletWords, n);
  if (bulletNGrams.length === 0) return false;

  const regionNGramSet = new Set(extractNGrams(regionWords, n));
  let matchCount = 0;
  for (const gram of bulletNGrams) {
    if (regionNGramSet.has(gram)) {
      matchCount++;
    }
  }

  const containment = matchCount / bulletNGrams.length;
  return containment >= CONTAINMENT_THRESHOLD;
}

export function guardProvenance(
  draft: ResumeImportDraft,
  sourceText: string
): { draft: ResumeImportDraft; report: ProvenanceReport } {
  const nulledPaths: string[] = [];
  const removedSkillPaths: string[] = [];
  const unmappedDateRanges: string[] = [];
  const decoupledRoles: string[] = [];

  const sourceLines = sourceText.split(/\r?\n/);
  const sourceDates = extractSourceDates(sourceText);

  // Helper to find first line matching a needle at or after startFrom
  function findLineIndex(needle: string, startFrom = 0): number {
    if (!needle.trim()) return -1;
    for (let idx = startFrom; idx < sourceLines.length; idx++) {
      if (isGroundedSubstring(needle, sourceLines[idx])) {
        return idx;
      }
    }
    return -1;
  }

  // 1. Basics verification
  let newFullName = draft.basics.fullName;
  if (newFullName !== null && !isGroundedSubstring(newFullName, sourceText)) {
    newFullName = null;
    nulledPaths.push('basics.fullName');
  }

  let newEmail = draft.basics.email;
  if (newEmail !== null && !isGroundedSubstring(newEmail, sourceText)) {
    newEmail = null;
    nulledPaths.push('basics.email');
  }

  let newPhone = draft.basics.phone;
  if (newPhone !== null && newPhone !== undefined && !isGroundedSubstring(newPhone, sourceText)) {
    newPhone = null;
    nulledPaths.push('basics.phone');
  }

  const newLinks = draft.basics.links.map((link, i) => {
    if (link.url !== null && !isGroundedSubstring(link.url, sourceText)) {
      nulledPaths.push(`basics.links[${i}].url`);
      return { ...link, url: null };
    }
    return { ...link };
  });

  // 2. Experience anchors (computed first so summary region runs to first role anchor)
  interface ExperienceAnchor {
    company: string | null;
    companyLineIdx: number;
    title: string | null;
    titleLineIdx: number;
    anchorLine: number;
  }

  const expAnchors: ExperienceAnchor[] = [];
  let prevRoleEndLine = 0;

  for (let i = 0; i < draft.experience.length; i++) {
    const exp = draft.experience[i];
    const company =
      exp.company !== null && isGroundedSubstring(exp.company, sourceText)
        ? exp.company
        : null;
    const title =
      exp.title !== null && isGroundedSubstring(exp.title, sourceText)
        ? exp.title
        : null;

    let companyLineIdx = company !== null ? findLineIndex(company, prevRoleEndLine) : -1;
    let titleLineIdx = title !== null ? findLineIndex(title, prevRoleEndLine) : -1;
    let anchorLine = -1;

    if (company !== null && title !== null) {
      let pairedC = -1;
      let pairedT = -1;
      for (let c = prevRoleEndLine; c < sourceLines.length; c++) {
        if (!isGroundedSubstring(company, sourceLines[c])) continue;
        const winStart = Math.max(prevRoleEndLine, c - SPATIAL_WINDOW_LINES);
        const winEnd = Math.min(sourceLines.length - 1, c + SPATIAL_WINDOW_LINES);
        let bestT = -1;
        for (let t = winStart; t <= winEnd; t++) {
          if (
            isGroundedSubstring(title, sourceLines[t]) &&
            (bestT === -1 || Math.abs(t - c) < Math.abs(bestT - c))
          ) {
            bestT = t;
          }
        }
        if (bestT !== -1) {
          pairedC = c;
          pairedT = bestT;
          break;
        }
      }
      if (pairedC !== -1) {
        companyLineIdx = pairedC;
        titleLineIdx = pairedT;
        anchorLine = Math.min(pairedC, pairedT);
      } else {
        anchorLine = companyLineIdx;
      }
    } else if (companyLineIdx !== -1) {
      anchorLine = companyLineIdx;
    } else {
      anchorLine = titleLineIdx;
    }

    if (anchorLine !== -1) {
      prevRoleEndLine = anchorLine + 1;
    }

    expAnchors.push({
      company,
      companyLineIdx,
      title,
      titleLineIdx,
      anchorLine,
    });
  }

  // Find first verified entity line for summary bounding (first role anchor, or education if none)
  let firstVerifiedEntityLine = sourceLines.length;
  for (const anchor of expAnchors) {
    if (anchor.anchorLine !== -1 && anchor.anchorLine < firstVerifiedEntityLine) {
      firstVerifiedEntityLine = anchor.anchorLine;
      break;
    }
  }
  if (firstVerifiedEntityLine === sourceLines.length) {
    draft.education.forEach((edu) => {
      if (edu.school && isGroundedSubstring(edu.school, sourceText)) {
        const idx = findLineIndex(edu.school);
        if (idx !== -1 && idx < firstVerifiedEntityLine) firstVerifiedEntityLine = idx;
      }
    });
  }

  // 3. Summary verification: runs from document start to first role anchor
  let newSummary = draft.summary;
  if (newSummary.trim()) {
    const summaryRegion = sourceLines.slice(0, firstVerifiedEntityLine).join('\n');

    if (!isGroundedSubstring(newSummary, summaryRegion) && !evaluateBulletContainment(newSummary, summaryRegion)) {
      newSummary = '';
      nulledPaths.push('summary');
    }
  }

  const newExperience = draft.experience.map((exp, i) => {
    const anchorInfo = expAnchors[i];
    const company = anchorInfo.company;
    const companyLineIdx = anchorInfo.companyLineIdx;
    if (exp.company !== null && company === null) {
      nulledPaths.push(`experience[${i}].company`);
    }

    const title = anchorInfo.title;
    const titleLineIdx = anchorInfo.titleLineIdx;
    if (exp.title !== null && title === null) {
      nulledPaths.push(`experience[${i}].title`);
    }

    // Dates verification
    let start = exp.start;
    if (start !== null) {
      const parsed = parseDateToken(start);
      if (!parsed || !dateMatchesSource(start, sourceDates)) {
        start = null;
        nulledPaths.push(`experience[${i}].start`);
      } else {
        start = parsed;
      }
    }

    let end = exp.end;
    let current = exp.current;

    // Locate role's date line
    let dateLineIdx = -1;
    const anchorLine = anchorInfo.anchorLine;
    const searchAnchor = anchorLine !== -1 ? anchorLine : 0;
    const searchWindowEnd = Math.min(sourceLines.length, searchAnchor + SPATIAL_WINDOW_LINES + DATE_SEARCH_MARGIN_LINES);
    for (let l = Math.max(0, searchAnchor - DATE_SEARCH_MARGIN_LINES); l < searchWindowEnd; l++) {
      if (exp.start && isGroundedSubstring(exp.start, sourceLines[l])) {
        dateLineIdx = l;
        break;
      }
      if (/present/i.test(sourceLines[l]) || /現在/.test(sourceLines[l])) {
        dateLineIdx = l;
        break;
      }
    }

    if (end !== null) {
      if (/^present$/i.test(end.trim())) {
        const dateLineText = dateLineIdx !== -1 ? sourceLines[dateLineIdx] : '';
        if (/\bpresent\b/i.test(dateLineText)) {
          end = null;
          current = true;
        } else {
          end = null;
          nulledPaths.push(`experience[${i}].end`);
        }
      } else {
        const parsed = parseDateToken(end);
        if (!parsed || !dateMatchesSource(end, sourceDates)) {
          end = null;
          nulledPaths.push(`experience[${i}].end`);
        } else {
          end = parsed;
        }
      }
    }

    // Spatial pairing check
    if (companyLineIdx !== -1 && dateLineIdx !== -1) {
      const dCompanyDate = Math.abs(companyLineIdx - dateLineIdx);
      const dTitleCompany = titleLineIdx !== -1 ? Math.abs(titleLineIdx - companyLineIdx) : 0;
      if (
        dCompanyDate > SPATIAL_WINDOW_LINES ||
        dTitleCompany > SPATIAL_WINDOW_LINES
      ) {
        decoupledRoles.push(`experience[${i}]`);
      }
    }

    // Role region and bullet verification
    // Region boundaries come only from verified entities: from role anchor to next role anchor (or end of text)
    const validBullets: string[] = [];
    if (anchorLine !== -1) {
      const roleStartLine = anchorLine;
      let roleEndLine = sourceLines.length;
      for (let k = i + 1; k < expAnchors.length; k++) {
        if (expAnchors[k].anchorLine !== -1) {
          roleEndLine = expAnchors[k].anchorLine;
          break;
        }
      }
      const roleRegion = sourceLines.slice(roleStartLine, roleEndLine).join('\n');

      exp.bullets.forEach((bullet, j) => {
        if (evaluateBulletContainment(bullet, roleRegion)) {
          validBullets.push(bullet);
        } else {
          nulledPaths.push(`experience[${i}].bullets[${j}]`);
        }
      });
    } else {
      // Neither company nor title verified -> all bullets rejected
      exp.bullets.forEach((_, j) => {
        nulledPaths.push(`experience[${i}].bullets[${j}]`);
      });
    }

    return {
      ...exp,
      company,
      title,
      start,
      end,
      current,
      bullets: validBullets,
    };
  });

  // 4. Projects verification
  // Pre-calculate project anchor lines
  const projAnchors: { name: string | null; projLineIdx: number }[] = [];
  let prevProjEndLine = 0;

  for (let i = 0; i < draft.projects.length; i++) {
    const proj = draft.projects[i];
    let name = proj.name;
    let projLineIdx = -1;
    if (name !== null) {
      if (!isGroundedSubstring(name, sourceText)) {
        name = null;
      } else {
        projLineIdx = findLineIndex(name, prevProjEndLine);
      }
    }
    if (projLineIdx !== -1) {
      prevProjEndLine = projLineIdx + 1;
    }
    projAnchors.push({ name, projLineIdx });
  }

  const newProjects = draft.projects.map((proj, i) => {
    const anchorInfo = projAnchors[i];
    const name = anchorInfo.name;
    const projLineIdx = anchorInfo.projLineIdx;
    if (proj.name !== null && name === null) {
      nulledPaths.push(`projects[${i}].name`);
    }

    let url = proj.url;
    if (url !== null && url !== undefined) {
      if (!isGroundedSubstring(url, sourceText)) {
        url = null;
        nulledPaths.push(`projects[${i}].url`);
      }
    }

    const validBullets: string[] = [];
    if (projLineIdx !== -1) {
      const projStartLine = projLineIdx;
      let projEndLine = sourceLines.length;
      for (let k = i + 1; k < projAnchors.length; k++) {
        if (projAnchors[k].projLineIdx !== -1) {
          projEndLine = projAnchors[k].projLineIdx;
          break;
        }
      }
      const projRegion = sourceLines.slice(projStartLine, projEndLine).join('\n');
      proj.bullets.forEach((bullet, j) => {
        if (evaluateBulletContainment(bullet, projRegion)) {
          validBullets.push(bullet);
        } else {
          nulledPaths.push(`projects[${i}].bullets[${j}]`);
        }
      });
    } else {
      proj.bullets.forEach((_, j) => {
        nulledPaths.push(`projects[${i}].bullets[${j}]`);
      });
    }

    return {
      ...proj,
      name,
      url,
      bullets: validBullets,
    };
  });

  // 5. Education verification
  const newEducation = draft.education.map((edu, i) => {
    let school = edu.school;
    if (school !== null && !isGroundedSubstring(school, sourceText)) {
      school = null;
      nulledPaths.push(`education[${i}].school`);
    }

    let degree = edu.degree;
    if (degree !== null && !isGroundedSubstring(degree, sourceText)) {
      degree = null;
      nulledPaths.push(`education[${i}].degree`);
    }

    let start = edu.start;
    if (start !== null) {
      const parsed = parseDateToken(start);
      if (!parsed || !dateMatchesSource(start, sourceDates)) {
        start = null;
        nulledPaths.push(`education[${i}].start`);
      } else {
        start = parsed;
      }
    }

    let end = edu.end;
    if (end !== null) {
      const parsed = parseDateToken(end);
      if (!parsed || !dateMatchesSource(end, sourceDates)) {
        end = null;
        nulledPaths.push(`education[${i}].end`);
      } else {
        end = parsed;
      }
    }

    return {
      ...edu,
      school,
      degree,
      start,
      end,
    };
  });

  // 6. Skills verification
  const newSkills = draft.skills.map((skillGroup, gIdx) => {
    const validItems: string[] = [];
    skillGroup.items.forEach((item, itemIdx) => {
      if (isGroundedSubstring(item, sourceText)) {
        validItems.push(item);
      } else {
        removedSkillPaths.push(`skills[${gIdx}].items[${itemIdx}]`);
      }
    });
    return {
      ...skillGroup,
      items: validItems,
    };
  });

  // 7. Unmapped date ranges detection
  const rangePattern = new RegExp(
    `(\\b${DATE_TOKEN_PATTERN}\\b)\\s*(?:-|–|—|\\bto\\b)\\s*(\\b(?:${DATE_TOKEN_PATTERN}|Present)\\b)`,
    'gi'
  );

  const allAssignedDates: string[] = [];
  draft.experience.forEach((e) => {
    if (e.start) allAssignedDates.push(parseDateToken(e.start) || e.start);
    if (e.end) allAssignedDates.push(parseDateToken(e.end) || e.end);
    if (e.current) allAssignedDates.push('present');
  });
  draft.education.forEach((e) => {
    if (e.start) allAssignedDates.push(parseDateToken(e.start) || e.start);
    if (e.end) allAssignedDates.push(parseDateToken(e.end) || e.end);
  });

  sourceLines.forEach((line) => {
    let match: RegExpExecArray | null;
    while ((match = rangePattern.exec(line)) !== null) {
      const startP = parseDateToken(match[1]) || match[1].toLowerCase();
      const endP = /^present$/i.test(match[2]) ? 'present' : (parseDateToken(match[2]) || match[2].toLowerCase());

      const startMatched = allAssignedDates.some((d) => d === startP || d.startsWith(startP) || startP.startsWith(d));
      const endMatched = allAssignedDates.some((d) => d === endP || d.startsWith(endP) || endP.startsWith(d));

      if (!startMatched && !endMatched) {
        unmappedDateRanges.push(match[0].trim());
      }
    }
  });

  const updatedLowConfidence = [
    ...(draft.low_confidence_paths || []),
    ...nulledPaths,
  ];

  const resultDraft: ResumeImportDraft = {
    ...draft,
    basics: {
      ...draft.basics,
      fullName: newFullName,
      email: newEmail,
      phone: newPhone,
      links: newLinks,
    },
    summary: newSummary,
    experience: newExperience,
    projects: newProjects,
    education: newEducation,
    skills: newSkills,
    low_confidence_paths: updatedLowConfidence,
  };

  const report: ProvenanceReport = {
    nulledPaths,
    removedSkillPaths,
    unmappedDateRanges,
    decoupledRoles,
  };

  return { draft: resultDraft, report };
}
