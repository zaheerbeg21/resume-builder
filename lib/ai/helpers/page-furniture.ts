const EDGE_LINE_WINDOW = 3; // starting value, tuned on corpus
const PAGE_MARKER_LINE_REGEX = /^\s*--\s+\d+\s+of\s+\d+\s+--\s*$/;
const EXPLICIT_PAGE_TOKEN_REGEX =
  /\b(page|pg\.?|p\.)(\s*)\d+(?!-\d|\.\d)(?:(\s+of\s+)\d+(?!-\d|\.\d))?\b/gi;
const CJK_PAGE_TOKEN_REGEX = /第(\s*)\d+(\s*)ページ/g;
const INLINE_PAGE_OF_TOKEN_REGEX =
  /(?:^|(?<=\s))page\s+\d+\s+of\s+\d+(?=$|\s)/gi;

export interface PageFurnitureResult {
  text: string;
  removedCount: number;
}

function normalizeEdgeLine(line: string): string {
  return line
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(
      EXPLICIT_PAGE_TOKEN_REGEX,
      (_match, prefix: string, sep: string, ofPart?: string) =>
        ofPart ? `${prefix}${sep}#${ofPart}#` : `${prefix}${sep}#`,
    )
    .replace(CJK_PAGE_TOKEN_REGEX, '第$1#$2ページ');
}

function normalizeInlinePageOfToken(token: string): string {
  return token.replace(/\s+/g, ' ').toLowerCase().replace(/\d+/g, '#');
}

function stripInlineTokensFromLine(
  line: string,
  repeatedKeys: Set<string>,
): string {
  let result = line;
  const matches = Array.from(result.matchAll(INLINE_PAGE_OF_TOKEN_REGEX));
  // Strip right-to-left so earlier match indices remain valid.
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const token = match[0];
    const index = match.index;
    if (
      index === undefined ||
      !repeatedKeys.has(normalizeInlinePageOfToken(token))
    ) {
      continue;
    }

    const before = result.slice(0, index);
    const after = result.slice(index + token.length);
    if (before.trim().length === 0) {
      result = after.replace(/^[ \t]+/, '');
    } else if (after.trim().length === 0) {
      result = before.replace(/[ \t]+$/, '');
    } else {
      result = `${before}${after.replace(/^[ \t]+/, '')}`;
    }
  }
  return result;
}

function splitPagesOnMarkers(lines: string[]): string[][] {
  const chunks: string[][] = [[]];
  for (const line of lines) {
    if (PAGE_MARKER_LINE_REGEX.test(line)) {
      chunks.push([]);
    } else {
      chunks[chunks.length - 1].push(line);
    }
  }
  return chunks.filter((page) => page.some((line) => line.trim().length > 0));
}

function getPageEdgeIndices(pageLines: string[]): {
  topIndices: Set<number>;
  bottomIndices: Set<number>;
} {
  const nonEmpty: number[] = [];
  for (let i = 0; i < pageLines.length; i++) {
    if (pageLines[i].trim().length > 0) {
      nonEmpty.push(i);
    }
  }
  return {
    topIndices: new Set(nonEmpty.slice(0, EDGE_LINE_WINDOW)),
    bottomIndices: new Set(nonEmpty.slice(-EDGE_LINE_WINDOW)),
  };
}

/**
 * Strips pdf-parse page marker lines and header/footer lines that repeat
 * in the same page edge across at least two pages.
 */
export function removePageFurniture(text: string): PageFurnitureResult {
  const lineEnding = text.includes('\r\n') ? '\r\n' : '\n';
  const pages = splitPagesOnMarkers(text.split(/\r?\n/));
  if (pages.length < 2) {
    return { text, removedCount: 0 };
  }

  const pageEdges = pages.map(getPageEdgeIndices);
  const topCounts = new Map<string, number>();
  const bottomCounts = new Map<string, number>();

  pages.forEach((pageLines, pageIdx) => {
    const { topIndices, bottomIndices } = pageEdges[pageIdx];
    const seenTop = new Set<string>();
    const seenBottom = new Set<string>();
    for (const idx of topIndices) {
      seenTop.add(normalizeEdgeLine(pageLines[idx]));
    }
    for (const idx of bottomIndices) {
      seenBottom.add(normalizeEdgeLine(pageLines[idx]));
    }
    for (const key of seenTop) {
      topCounts.set(key, (topCounts.get(key) ?? 0) + 1);
    }
    for (const key of seenBottom) {
      bottomCounts.set(key, (bottomCounts.get(key) ?? 0) + 1);
    }
  });

  const keptPageLines: Array<{
    pageIdx: number;
    idx: number;
    line: string;
  }> = [];
  let removedCount = 0;

  pages.forEach((pageLines, pageIdx) => {
    const { topIndices, bottomIndices } = pageEdges[pageIdx];
    pageLines.forEach((line, idx) => {
      const key =
        topIndices.has(idx) || bottomIndices.has(idx)
          ? normalizeEdgeLine(line)
          : '';
      const isRepeatedTop = topIndices.has(idx) && (topCounts.get(key) ?? 0) >= 2;
      const isRepeatedBottom =
        bottomIndices.has(idx) && (bottomCounts.get(key) ?? 0) >= 2;

      if (isRepeatedTop || isRepeatedBottom) {
        removedCount += 1;
      } else {
        keptPageLines.push({ pageIdx, idx, line });
      }
    });
  });

  // Track whitespace-delimited inline `Page N of M` tokens per edge across pages.
  const topInlinePages = new Map<string, Set<number>>();
  const bottomInlinePages = new Map<string, Set<number>>();

  for (const entry of keptPageLines) {
    const { topIndices, bottomIndices } = pageEdges[entry.pageIdx];
    const inTop = topIndices.has(entry.idx);
    const inBottom = bottomIndices.has(entry.idx);
    if (!inTop && !inBottom) {
      continue;
    }
    const matches = entry.line.match(INLINE_PAGE_OF_TOKEN_REGEX);
    if (!matches) {
      continue;
    }
    for (const token of matches) {
      const tokenKey = normalizeInlinePageOfToken(token);
      if (inTop) {
        const set = topInlinePages.get(tokenKey) ?? new Set<number>();
        set.add(entry.pageIdx);
        topInlinePages.set(tokenKey, set);
      }
      if (inBottom) {
        const set = bottomInlinePages.get(tokenKey) ?? new Set<number>();
        set.add(entry.pageIdx);
        bottomInlinePages.set(tokenKey, set);
      }
    }
  }

  const repeatedTopInline = new Set<string>();
  for (const [key, pageSet] of topInlinePages) {
    if (pageSet.size >= 2) {
      repeatedTopInline.add(key);
    }
  }
  const repeatedBottomInline = new Set<string>();
  for (const [key, pageSet] of bottomInlinePages) {
    if (pageSet.size >= 2) {
      repeatedBottomInline.add(key);
    }
  }

  const keptLines = keptPageLines.map(({ pageIdx, idx, line }) => {
    const { topIndices, bottomIndices } = pageEdges[pageIdx];
    const applicableKeys = new Set<string>();
    if (topIndices.has(idx)) {
      for (const key of repeatedTopInline) {
        applicableKeys.add(key);
      }
    }
    if (bottomIndices.has(idx)) {
      for (const key of repeatedBottomInline) {
        applicableKeys.add(key);
      }
    }
    return applicableKeys.size > 0
      ? stripInlineTokensFromLine(line, applicableKeys)
      : line;
  });

  return { text: keptLines.join(lineEnding), removedCount };
}

