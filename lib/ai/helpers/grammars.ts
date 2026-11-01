const LINE_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/;
const LINE_PHONE_CANDIDATE_REGEX = /\+?\d[\d\s().-]{8,}\d/g;
const MIN_PHONE_DIGITS = 10; // starting value, tuned on corpus
const MAX_PHONE_DIGITS = 15; // starting value, tuned on corpus
const URI_SCHEME_PREFIX_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function hasEmailShapedTokenOnLine(sourceText: string): boolean {
  const lines = sourceText.split(/\r?\n/);
  for (const line of lines) {
    if (LINE_EMAIL_REGEX.test(line)) {
      return true;
    }
  }
  return false;
}

export function hasPhoneShapedTokenOnLine(sourceText: string): boolean {
  const lines = sourceText.split(/\r?\n/);
  for (const line of lines) {
    const matches = line.match(LINE_PHONE_CANDIDATE_REGEX);
    if (!matches) continue;
    for (const candidate of matches) {
      const digitCount = candidate.replace(/\D/g, '').length;
      if (digitCount >= MIN_PHONE_DIGITS && digitCount <= MAX_PHONE_DIGITS) {
        return true;
      }
    }
  }
  return false;
}

export function ensureUrlScheme(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (URI_SCHEME_PREFIX_REGEX.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
