import type { Resume } from '@/types/resume';

export interface LintResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

const PLACEHOLDER_REGEX = /\[[A-Za-z0-9%_\s]+\]/g;
const REPLACEMENT_CHAR = '\uFFFD';

export const STANDARD_SECTION_ORDER = [
  'Summary',
  'Experience',
  'Projects',
  'Education',
  'Skills',
] as const;

/**
 * Finds the index of a section heading in the extracted text.
 * Requires the heading to appear as its own standalone line or line prefix.
 */
export function findHeadingIndex(text: string, heading: string): number {
  const linePattern = new RegExp(`(?:^|\\r?\\n)[ \\t]*${heading}[ \\t]*(?:\\r?\\n|:|$)`, 'i');
  const match = text.match(linePattern);
  if (match && match.index !== undefined) {
    return match.index;
  }

  // Fallback to word boundary check at line start
  const wordPattern = new RegExp(`(?:^|\\r?\\n)[ \\t]*${heading}\\b`, 'i');
  const wordMatch = text.match(wordPattern);
  if (wordMatch && wordMatch.index !== undefined) {
    return wordMatch.index;
  }

  return -1;
}

/**
 * Evaluates extracted PDF text against the source Resume object to verify
 * ATS formatting, placeholder resolution, character integrity, contact header placement,
 * and section ordering.
 */
export function lintExtractedText(text: string, resume: Resume): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Placeholder Blocker: Fails if regex finds any unresolved bracketed placeholders (e.g. [X%], [N users])
  const placeholderMatches = text.match(PLACEHOLDER_REGEX);
  if (placeholderMatches && placeholderMatches.length > 0) {
    const uniqueTokens = Array.from(new Set(placeholderMatches));
    for (const token of uniqueTokens) {
      errors.push(`Unresolved placeholder detected: "${token}"`);
    }
  }

  // 2. Character Integrity: Fails if text contains U+FFFD replacement characters
  if (text.includes(REPLACEMENT_CHAR)) {
    errors.push('Character integrity error: Extracted text contains U+FFFD replacement characters.');
  }

  // 3. Contact Header: Fails if basics.fullName does not appear in the first 15 lines of text
  const lines = text.split(/\r?\n/);
  const first15Lines = lines.slice(0, 15).join('\n');
  const fullName = resume.basics?.fullName?.trim() || '';

  if (!fullName || !first15Lines.toLowerCase().includes(fullName.toLowerCase())) {
    errors.push(
      `Contact header missing: Candidate name "${fullName}" was not found within the first 15 lines of text.`
    );
  }

  // 4. Section Order & Missing Heading Check:
  // Core standard sections rendered in ATS templates
  const requiredSections: Array<{ heading: (typeof STANDARD_SECTION_ORDER)[number]; isPresent: boolean }> = [
    { heading: 'Summary', isPresent: Boolean(resume.summary && resume.summary.trim().length > 0) },
    { heading: 'Experience', isPresent: Boolean(resume.experience && resume.experience.length > 0) },
    { heading: 'Education', isPresent: Boolean(resume.education && resume.education.length > 0) },
    { heading: 'Skills', isPresent: Boolean(resume.skills && resume.skills.length > 0) },
  ];

  for (const { heading, isPresent } of requiredSections) {
    if (isPresent && findHeadingIndex(text, heading) === -1) {
      errors.push(`Missing section heading: "${heading}" was expected but not found in extracted text.`);
    }
  }

  // Check top-to-bottom index progression for all present headings
  let lastIndex = -1;
  let lastHeading = '';

  for (const heading of STANDARD_SECTION_ORDER) {
    const index = findHeadingIndex(text, heading);
    if (index !== -1) {
      if (lastIndex !== -1 && index <= lastIndex) {
        errors.push(
          `Section heading "${heading}" appears out of order in extracted text (found at index ${index}, after "${lastHeading}" at ${lastIndex}).`
        );
      }
      lastIndex = index;
      lastHeading = heading;
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
