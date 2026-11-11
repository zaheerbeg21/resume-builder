const EDGE_LINE_WINDOW = 3; // starting value, tuned on corpus
const PAGE_MARKER_LINE_REGEX = /^\s*--\s+\d+\s+of\s+\d+\s+--\s*$/;
// Structural "<word> N <connector> M" pagination shape across languages (e.g. Page 1 of 2, Seite 1 von 2, Página 1 de 3).
const PAGINATED_PAIR_REGEX =
  /(?<![\p{L}\d])(\p{L}{2,12})(\s+)\d{1,3}(?![-./]\d)(\s+\p{L}{1,4}\s+)\d{1,3}(?![-./]\d)(?!\p{L})/gu;
const EXPLICIT_PAGE_TOKEN_REGEX =
  /(?<![\p{L}\d/])(page|pg\.?|p\.|seite|p[aá]gina)(\s*)\d+(?![-./]\d|\p{L})/giu;
const CJK_PAGE_TOKEN_REGEX = /第(\s*)\d+(\s*)(ページ|頁|页)/g;
const INLINE_PAGE_OF_TOKEN_REGEX =
  /(?:^|(?<=\s))page\s+\d+\s+of\s+\d+(?=$|\s)/gi;

export interface PageFurnitureResult {
  text: string;
  removedCount: number;
}

interface NormalizedEdgeLine {
  key: string;
  hasPagination: boolean;
}

interface EdgeKeyStats {
  count: number;
  firstPage: number;
  hasPagination: boolean;
}

function normalizeEdgeLine(line: string): NormalizedEdgeLine {
  let hasPagination = false;
  const key = line
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(
      PAGINATED_PAIR_REGEX,
      (_match, word: string, s1: string, conn: string) => {
        hasPagination = true;
        return `${word}${s1}#${conn}#`;
      },
    )
    .replace(
      EXPLICIT_PAGE_TOKEN_REGEX,
      (_match, prefix: string, sep: string) => {
        hasPagination = true;
        return `${prefix}${sep}#`;
      },
    )
    .replace(
      CJK_PAGE_TOKEN_REGEX,
      (_match, s1: string, s2: string, unit: string) => {
        hasPagination = true;
        return `第${s1}#${s2}${unit}`;
      },
    );
  return { key, hasPagination };
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
  // Reserve at least one body line and keep top/bottom edge windows disjoint on short pages.
  const edgeWindow = Math.min(
    EDGE_LINE_WINDOW,
    Math.floor((nonEmpty.length - 1) / 2),
  );
  if (edgeWindow <= 0) {
    return {
      topIndices: new Set<number>(),
      bottomIndices: new Set<number>(),
    };
  }
  return {
    topIndices: new Set(nonEmpty.slice(0, edgeWindow)),
    bottomIndices: new Set(nonEmpty.slice(-edgeWindow)),
  };
}

function recordEdgeStats(
  pageLines: string[],
  indices: Set<number>,
  pageIdx: number,
  stats: Map<string, EdgeKeyStats>,
): void {
  const seenOnPage = new Map<string, boolean>();
  for (const idx of indices) {
    const { key, hasPagination } = normalizeEdgeLine(pageLines[idx]);
    seenOnPage.set(key, (seenOnPage.get(key) ?? false) || hasPagination);
  }
  for (const [key, hasPagination] of seenOnPage) {
    const existing = stats.get(key);
    if (existing) {
      existing.count += 1;
      existing.hasPagination = existing.hasPagination || hasPagination;
    } else {
      stats.set(key, { count: 1, firstPage: pageIdx, hasPagination });
    }
  }
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
  const topStats = new Map<string, EdgeKeyStats>();
  const bottomStats = new Map<string, EdgeKeyStats>();

  pages.forEach((pageLines, pageIdx) => {
    const { topIndices, bottomIndices } = pageEdges[pageIdx];
    recordEdgeStats(pageLines, topIndices, pageIdx, topStats);
    recordEdgeStats(pageLines, bottomIndices, pageIdx, bottomStats);
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
      const inTop = topIndices.has(idx);
      const inBottom = bottomIndices.has(idx);
      const key = inTop || inBottom ? normalizeEdgeLine(line).key : '';
      const topStat = inTop ? topStats.get(key) : undefined;
      const bottomStat = inBottom ? bottomStats.get(key) : undefined;

      // Remove all copies when a pagination token is present; keep the earliest copy for verbatim repeats.
      const isRepeatedTop =
        topStat !== undefined &&
        topStat.count >= 2 &&
        (topStat.hasPagination || pageIdx > topStat.firstPage);
      const isRepeatedBottom =
        bottomStat !== undefined &&
        bottomStat.count >= 2 &&
        (bottomStat.hasPagination || pageIdx > bottomStat.firstPage);

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

