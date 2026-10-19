import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer, Document, Page, View, Text, Font, Image, Svg } from '@react-pdf/renderer';
import { PDFParse, type TextResult } from 'pdf-parse';
import { registerFonts } from '@/lib/pdf/fonts';
import { ResumeDocument } from '@/lib/pdf/templates/standard';
import { ResumeSchema, type Resume } from '@/types/resume';

import spikeBasicJson from './fixtures/resumes/spike-basic.json';
import spikeTwoPageJson from './fixtures/resumes/spike-two-page.json';
import spikeAccentedJson from './fixtures/resumes/spike-accented.json';
import spikePolishJson from './fixtures/resumes/spike-polish.json';

const spikeBasic = spikeBasicJson as unknown as Resume;
const spikeTwoPage = spikeTwoPageJson as unknown as Resume;
const spikeAccented = spikeAccentedJson as unknown as Resume;
const spikePolish = spikePolishJson as unknown as Resume;

// Date formatting oracle defined locally from the ticket contract:
// 'Jun 2022 - Present' or 'Jun 2022 - Dec 2023', month abbreviated as MMM YYYY.
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatYearMonth(ym: string | null | undefined): string {
  if (!ym) return '';
  const parts = ym.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const month = parseInt(parts[1], 10);
    const monthName = MONTH_NAMES[month - 1];
    return `${monthName} ${year}`;
  }
  return ym;
}

function formatResumeDate(start: string | null | undefined, end: string | null | undefined, current: boolean): string {
  const startStr = formatYearMonth(start);
  const endStr = current ? 'Present' : formatYearMonth(end);
  if (startStr && endStr) return `${startStr} - ${endStr}`;
  return startStr || endStr;
}

function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/-- \d+ of \d+ --/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function renderResumeToBuffer(resume: Resume): Promise<Buffer> {
  const element = React.createElement(ResumeDocument, { resume }) as unknown as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(element);
}

async function extractTextWithPdfParse(buffer: Buffer): Promise<TextResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
}

// ---------------------------------------------------------------------------
// Tree Checker & Style Flattener
// Recursively walks the ResumeDocument element tree, flattens style arrays,
// resolves padding shorthands, expands pure function components, and flags
// any violations of single-column ATS rules.
// ---------------------------------------------------------------------------

export function flattenStyles(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => {
      return Object.assign(acc, flattenStyles(s));
    }, {});
  }
  if (typeof style === 'object') {
    return { ...(style as Record<string, unknown>) };
  }
  return {};
}

export function parseNumericValue(val: unknown): number | undefined {
  if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
  if (typeof val === 'string') {
    const match = val.trim().match(/^([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)\s*(in|mm|cm|pt|px)?$/i);
    if (!match) return undefined;
    const num = parseFloat(match[1]);
    if (!Number.isFinite(num)) return undefined;
    const unit = (match[2] || '').toLowerCase();
    switch (unit) {
      case 'in':
        return num * 72;
      case 'mm':
        return num * (72 / 25.4);
      case 'cm':
        return num * (72 / 2.54);
      case 'pt':
      case 'px':
      case '':
        return num;
      default:
        return undefined;
    }
  }
  return undefined;
}

export function resolvePadding(style: Record<string, unknown>): {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
} {
  let top: number | undefined;
  let right: number | undefined;
  let bottom: number | undefined;
  let left: number | undefined;

  if (style.padding !== undefined) {
    if (typeof style.padding === 'number') {
      top = right = bottom = left = style.padding;
    } else if (typeof style.padding === 'string') {
      const rawParts = style.padding.trim().split(/\s+/);
      const parts: number[] = [];
      let valid = true;
      for (const p of rawParts) {
        const val = parseNumericValue(p);
        if (val === undefined) {
          valid = false;
          break;
        }
        parts.push(val);
      }
      if (valid) {
        if (parts.length === 1) {
          top = right = bottom = left = parts[0];
        } else if (parts.length === 2) {
          top = bottom = parts[0];
          right = left = parts[1];
        } else if (parts.length === 3) {
          top = parts[0];
          right = left = parts[1];
          bottom = parts[2];
        } else if (parts.length >= 4) {
          top = parts[0];
          right = parts[1];
          bottom = parts[2];
          left = parts[3];
        }
      }
    }
  }

  const padV = parseNumericValue(style.paddingVertical);
  if (padV !== undefined) {
    top = padV;
    bottom = padV;
  }

  const padH = parseNumericValue(style.paddingHorizontal);
  if (padH !== undefined) {
    right = padH;
    left = padH;
  }

  const padTop = parseNumericValue(style.paddingTop);
  if (padTop !== undefined) top = padTop;

  const padRight = parseNumericValue(style.paddingRight);
  if (padRight !== undefined) right = padRight;

  const padBottom = parseNumericValue(style.paddingBottom);
  if (padBottom !== undefined) bottom = padBottom;

  const padLeft = parseNumericValue(style.paddingLeft);
  if (padLeft !== undefined) left = padLeft;

  return { top, right, bottom, left };
}

function walkTree(node: React.ReactNode, errors: string[]): void {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const child of node) {
      walkTree(child, errors);
    }
    return;
  }

  if (!React.isValidElement(node)) {
    return;
  }

  const rawType = node.type as unknown;

  // Expand function and class components
  if (typeof node.type === 'function') {
    let expanded: React.ReactNode;
    const proto = node.type.prototype as { isReactComponent?: boolean } | undefined;
    if (proto?.isReactComponent) {
      const ClassCtor = node.type as unknown as new (props: unknown) => { render(): React.ReactNode };
      expanded = new ClassCtor(node.props).render();
    } else {
      const FunctionCtor = node.type as unknown as (props: unknown) => React.ReactNode;
      expanded = FunctionCtor(node.props);
    }
    walkTree(expanded, errors);
    return;
  }

  if (rawType === React.Fragment) {
    if ((node.props as { children?: React.ReactNode })?.children) {
      walkTree((node.props as { children?: React.ReactNode }).children, errors);
    }
    return;
  }

  const typeWithNames = node.type as { displayName?: string; name?: string };
  const typeName = typeof node.type === 'string'
    ? node.type
    : typeWithNames?.displayName || typeWithNames?.name || '';

  // Fail on: Image or Svg elements
  if (
    rawType === Image ||
    typeName === 'IMAGE' ||
    typeName === 'Image' ||
    typeName === 'ImageBackground' ||
    rawType === Svg ||
    typeName === 'SVG' ||
    typeName === 'Svg' ||
    ['Circle', 'ClipPath', 'Defs', 'Ellipse', 'G', 'Line', 'LinearGradient', 'Path', 'Polygon', 'Polyline', 'RadialGradient', 'Rect', 'Stop', 'Tspan'].includes(typeName)
  ) {
    errors.push(`Disallowed element <${typeName || 'Image/Svg'}> found in resume document`);
  }

  const props = (node.props as Record<string, unknown>) || {};
  const style = flattenStyles(props.style);

  // Fail on: columns / columnCount styles
  if (style.columns !== undefined || style.columnCount !== undefined) {
    errors.push(`Disallowed columns/columnCount style found on <${typeName}>: ${JSON.stringify({ columns: style.columns, columnCount: style.columnCount })}`);
  }

  // Fail on: position 'absolute'
  if (style.position === 'absolute') {
    errors.push(`Disallowed position 'absolute' style found on <${typeName}>`);
  }

  // Fail on: page padding other than 46.8 on all four sides (tolerance 0.05 pt)
  if (rawType === Page || typeName === 'PAGE' || typeName === 'Page') {
    const padding = resolvePadding(style);
    const is468 = (val?: number) => val !== undefined && Math.abs(val - 46.8) <= 0.05;
    if (!is468(padding.top) || !is468(padding.right) || !is468(padding.bottom) || !is468(padding.left)) {
      errors.push(
        `Page padding must be 46.8 on all four sides, received top=${padding.top}, right=${padding.right}, bottom=${padding.bottom}, left=${padding.left}`
      );
    }
  }

  if (props.children) {
    walkTree(props.children as React.ReactNode, errors);
  }
}

export function checkResumeTree(element: React.ReactNode): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  walkTree(element, errors);
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertValidResumeTree(element: React.ReactNode): void {
  const { valid, errors } = checkResumeTree(element);
  expect(errors, `Resume document element tree validation failed:\n${errors.join('\n')}`).toEqual([]);
  expect(valid).toBe(true);
}

function findTextNodes(node: React.ReactNode): Array<{ text: string; style: Record<string, unknown> }> {
  const textNodes: Array<{ text: string; style: Record<string, unknown> }> = [];

  function walk(n: React.ReactNode, inheritedStyle: Record<string, unknown> = {}) {
    if (!n) return;
    if (Array.isArray(n)) {
      for (const c of n) walk(c, inheritedStyle);
      return;
    }
    if (!React.isValidElement(n)) return;

    if (typeof n.type === 'function') {
      const FunctionCtor = n.type as (props: unknown) => React.ReactNode;
      const expanded = FunctionCtor(n.props);
      walk(expanded, inheritedStyle);
      return;
    }

    const typeWithNames = n.type as { displayName?: string; name?: string };
    const typeName = typeof n.type === 'string'
      ? n.type
      : typeWithNames?.displayName || typeWithNames?.name || '';

    const props = (n.props as Record<string, unknown>) || {};
    const localStyle = flattenStyles(props.style);
    const combinedStyle = { ...inheritedStyle, ...localStyle };

    const rawType = n.type as unknown;
    if (rawType === Text || typeName === 'TEXT' || typeName === 'Text') {
      const childrenText = React.Children.toArray(props.children as React.ReactNode)
        .filter((c) => typeof c === 'string' || typeof c === 'number')
        .join('');
      textNodes.push({ text: childrenText, style: combinedStyle });
    }

    if (props.children) {
      walk(props.children as React.ReactNode, combinedStyle);
    }
  }

  walk(node);
  return textNodes;
}

export function assertBodyTextStyle(docElement: React.ReactNode, resume: Resume): void {
  const textNodes = findTextNodes(docElement);
  const summaryNode = textNodes.find((n) => n.text.includes(resume.summary));
  const bulletNode = textNodes.find((n) => n.text.includes(resume.experience[0]?.bullets[0] ?? ''));
  const targetNode = summaryNode || bulletNode;

  expect(targetNode, 'Expected to find a body text element (summary or bullet) in the resume document tree').toBeDefined();
  expect(targetNode).not.toBeNull();

  const fontSize = parseNumericValue(targetNode?.style.fontSize);
  expect(fontSize, 'Body text fontSize should be 10.5 pt').toBe(10.5);

  const lineHeight = parseNumericValue(targetNode?.style.lineHeight);
  expect(lineHeight, 'Body text lineHeight should be defined between 1.3 and 1.4').toBeDefined();
  expect(lineHeight, 'Body text lineHeight should be >= 1.3').toBeGreaterThanOrEqual(1.3);
  expect(lineHeight, 'Body text lineHeight should be <= 1.4').toBeLessThanOrEqual(1.4);
}

// ---------------------------------------------------------------------------
// Reading Order Verification (Ordered Cursor Scan)
// ---------------------------------------------------------------------------

function assertInOrder(text: string, expected: string[]): void {
  let cursor = 0;
  for (const s of expected) {
    const at = text.indexOf(s, cursor);
    expect(at, `missing or out of order: "${s}"`).toBeGreaterThanOrEqual(0);
    cursor = at + s.length;
  }
}

function getExpectedReadingOrder(resume: Resume): string[] {
  const expected: string[] = [
    resume.basics.fullName,
    resume.basics.headline,
    'Summary',
    resume.summary,
    'Experience',
  ];

  for (const exp of resume.experience) {
    expected.push(exp.title);
    expected.push(exp.company);
    expected.push(formatResumeDate(exp.start, exp.end, exp.current));
    expected.push(exp.bullets[0]);
    expected.push(exp.bullets[exp.bullets.length - 1]);
  }

  expected.push('Education');
  for (const edu of resume.education) {
    expected.push(edu.school);
  }

  expected.push('Skills');
  if (resume.skills.length > 0 && resume.skills[0].items.length > 0) {
    expected.push(resume.skills[0].items[0]);
  }

  return expected;
}

// ===========================================================================
// Test Suites
// ===========================================================================

describe('Resume Fixtures Validation against ResumeSchema', () => {
  it('validates spike-basic.json against ResumeSchema', () => {
    const parsed = ResumeSchema.safeParse(spikeBasicJson);
    expect(parsed.success).toBe(true);
  });

  it('validates spike-two-page.json against ResumeSchema', () => {
    const parsed = ResumeSchema.safeParse(spikeTwoPageJson);
    expect(parsed.success).toBe(true);
  });

  it('validates spike-accented.json against ResumeSchema', () => {
    const parsed = ResumeSchema.safeParse(spikeAccentedJson);
    expect(parsed.success).toBe(true);
  });

  it('validates spike-polish.json against ResumeSchema', () => {
    const parsed = ResumeSchema.safeParse(spikePolishJson);
    expect(parsed.success).toBe(true);
  });
});

describe('Validate the Validator: Synthetic Tree Checks', () => {
  it('fails tree check when an Image element is present in the tree', () => {
    const badTreeWithImage = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { style: { padding: 46.8 } },
        React.createElement(Image, { src: 'data:image/png;base64,iVBORw0KGgo=' })
      )
    );
    const result = checkResumeTree(badTreeWithImage);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Disallowed element'))).toBe(true);
  });

  it('fails tree check when columns or columnCount style is present in the tree', () => {
    const badTreeWithColumns = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { style: { padding: 46.8 } },
        React.createElement(
          View,
          { style: { columnCount: 2 } as unknown as React.ComponentProps<typeof View>['style'] },
          React.createElement(Text, null, 'Columns')
        )
      )
    );
    const result = checkResumeTree(badTreeWithColumns);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Disallowed columns/columnCount style'))).toBe(true);
  });

  it('fails tree check when Page padding is other than 46.8 pt on all four sides', () => {
    const badTreeWith40ptPadding = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { style: { padding: 40 } },
        React.createElement(View, null, React.createElement(Text, null, 'Content'))
      )
    );
    const result = checkResumeTree(badTreeWith40ptPadding);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Page padding must be 46.8'))).toBe(true);
  });

  it('passes tree check on a valid synthetic single-column tree with 46.8 pt padding', () => {
    const PureFunctionalSection: React.FC<{ text: string }> = ({ text }) => {
      return React.createElement(View, null, React.createElement(Text, null, text));
    };

    const goodTree = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { style: { padding: 46.8 } },
        React.createElement(View, null, React.createElement(PureFunctionalSection, { text: 'Valid Single Column' }))
      )
    );
    const result = checkResumeTree(goodTree);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('validates synthetic body text styling helper with 10.5pt font and 1.3-1.4 line-height', () => {
    const syntheticBodyTree = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { style: { padding: 46.8 } },
        React.createElement(Text, { style: { fontSize: 10.5, lineHeight: 1.35 } }, spikeBasic.summary)
      )
    );
    expect(() => assertBodyTextStyle(syntheticBodyTree, spikeBasic)).not.toThrow();
  });

  it("passes tree check on a Page with padding '0.65in'", () => {
    const tree = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { style: { padding: '0.65in' } as unknown as React.ComponentProps<typeof Page>['style'] },
        React.createElement(View, null, React.createElement(Text, null, 'Content'))
      )
    );
    const result = checkResumeTree(tree);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("fails tree check on a Page with padding '0.6in'", () => {
    const tree = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { style: { padding: '0.6in' } as unknown as React.ComponentProps<typeof Page>['style'] },
        React.createElement(View, null, React.createElement(Text, null, 'Content'))
      )
    );
    const result = checkResumeTree(tree);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Page padding must be 46.8'))).toBe(true);
  });

  it("passes tree check on a Page with shorthand padding '0.65in 0.65in'", () => {
    const tree = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { style: { padding: '0.65in 0.65in' } as unknown as React.ComponentProps<typeof Page>['style'] },
        React.createElement(View, null, React.createElement(Text, null, 'Content'))
      )
    );
    const result = checkResumeTree(tree);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('Criterion 1: Single-Column ATS Layout', () => {
  it('enforces single-column layout without multi-column grids or tables and has strict 46.8 pt margins', async () => {
    registerFonts();
    const docElement = ResumeDocument({ resume: spikeBasic });
    assertValidResumeTree(docElement);
  });

  it('renders body text with font size 10.5 pt and line-height between 1.3 and 1.4', async () => {
    registerFonts();
    const docElement = ResumeDocument({ resume: spikeBasic });
    assertBodyTextStyle(docElement, spikeBasic);
  });
});

describe('Criterion 2: Idempotent Font Registration', () => {
  it('registers Inter fonts idempotently without error on consecutive calls', () => {
    expect(() => {
      registerFonts();
      registerFonts();
    }).not.toThrow();
    const registeredFamilies = Font.getRegisteredFontFamilies();
    expect(registeredFamilies).toContain('Inter');
  });
});

describe('Criterion 3: Font Embedding Verification (No Fallbacks)', () => {
  it('embeds Inter font with subset prefix, embeds bold Inter face, and has no Helvetica or Times fallback in raw PDF buffer', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeBasic);
    const rawPdf = buffer.toString('latin1');

    // Extract all /BaseFont names from raw PDF buffer and print them
    const fontMatches = Array.from(rawPdf.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)).map((m) => m[1]);
    console.log('Embedded PDF font names found:', fontMatches);

    // Keep subset-prefix and no-Helvetica/Times assertions
    expect(rawPdf).toMatch(/\+[A-Za-z0-9]*Inter/);
    expect(rawPdf).not.toMatch(/\/BaseFont\s*\/Helvetica/);
    expect(rawPdf).not.toMatch(/\/BaseFont\s*\/Times/);

    // Assert a bold Inter face is embedded (a prefixed name containing Bold)
    expect(rawPdf).toMatch(/\+[A-Za-z0-9]*Inter[A-Za-z0-9_-]*Bold/i);
  });
});

describe('Criterion 4: Hyphenation Disabled (Test-Local Proof)', () => {
  it('edge case: keeps unbroken over-wide words intact without injected hyphens', async () => {
    registerFonts();
    const narrowDoc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'LETTER', style: { padding: 46.8 } },
        React.createElement(
          View,
          { style: { width: 50 } },
          React.createElement(Text, null, 'InternationalizationInfrastructure')
        )
      )
    );
    const buffer = await renderToBuffer(narrowDoc);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);

    // Assert the whole word appears contiguous in the normalized extracted text
    expect(normalized).toContain('InternationalizationInfrastructure');

    // Assert that no hyphen appears inside the word
    expect(normalized).not.toMatch(/Internation[a-z]*-/i);
    expect(normalized).not.toMatch(/Infrastruct[a-z]*-/i);
    expect(normalized).not.toMatch(/Internationalization-Infrastructure/i);
    expect(normalized).not.toContain('-');
  });

  it('keeps ordinary long words intact without hyphens in wrapping text', async () => {
    registerFonts();
    const sentence = 'containerization infrastructure observability internationalization orchestration';
    const doc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'LETTER', style: { padding: 46.8 } },
        React.createElement(
          View,
          { style: { width: 120 } },
          React.createElement(Text, { style: { fontSize: 10.5 } }, sentence)
        )
      )
    );
    const buffer = await renderToBuffer(doc);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);

    const expectedWords = [
      'containerization',
      'infrastructure',
      'observability',
      'internationalization',
      'orchestration',
    ];
    for (const word of expectedWords) {
      expect(normalized).toContain(word);
    }
    expect(normalized).not.toContain('-');
  });
});

describe('Criterion 5: Text Normalization & Exact Ligature Matching', () => {
  it('extracts words with common typographical ligatures (Certified, workflow, office) with exact equality', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeBasic);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);

    expect(normalized).toContain('Certified');
    expect(normalized).toContain('workflow');
    expect(normalized).toContain('office');

    const certifiedMatch = normalized.match(/\bCertified\b/);
    expect(certifiedMatch?.[0]).toBe('Certified');

    const workflowMatch = normalized.match(/\bworkflow\b/);
    expect(workflowMatch?.[0]).toBe('workflow');

    const officeMatch = normalized.match(/\boffice\b/);
    expect(officeMatch?.[0]).toBe('office');
  });
});

describe('Criterion 6: Accented Character Fidelity & Zero U+FFFD', () => {
  it('extracts zero U+FFFD replacement characters across all four fixtures', async () => {
    registerFonts();
    for (const resume of [spikeBasic, spikeTwoPage, spikeAccented, spikePolish]) {
      const buffer = await renderResumeToBuffer(resume);
      const result = await extractTextWithPdfParse(buffer);
      expect(result.text).not.toContain('\uFFFD');
    }
  });

  it('matches French accented name Renée Noël Müller 100% with exact string equality', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeAccented);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);
    const expectedName = 'Renée Noël Müller'.normalize('NFC');
    expect(normalized).toContain(expectedName);
  });

  it('matches Polish diacritic name Łukasz Żółć 100% with exact string equality', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikePolish);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);
    const expectedName = 'Łukasz Żółć'.normalize('NFC');
    expect(normalized).toContain(expectedName);
  });
});

describe('Criterion 7: Dynamic Reading Order Verification', () => {
  it('preserves top-to-bottom reading order for spike-basic.json using ordered cursor scan', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeBasic);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);
    const expected = getExpectedReadingOrder(spikeBasic);
    assertInOrder(normalized, expected);
  });

  it('preserves top-to-bottom reading order for spike-two-page.json using ordered cursor scan', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeTwoPage);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);
    const expected = getExpectedReadingOrder(spikeTwoPage);
    assertInOrder(normalized, expected);
  });
});

describe('Criterion 8: Strict Page Count Assertions via pdf-parse v2', () => {
  it('spike-basic.json renders to exactly 1 page', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeBasic);
    const result = await extractTextWithPdfParse(buffer);
    expect(result.total).toBe(1);
    expect(result.pages.length).toBe(1);
  });

  it('spike-accented.json renders to exactly 1 page', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeAccented);
    const result = await extractTextWithPdfParse(buffer);
    expect(result.total).toBe(1);
    expect(result.pages.length).toBe(1);
  });

  it('spike-polish.json renders to exactly 1 page', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikePolish);
    const result = await extractTextWithPdfParse(buffer);
    expect(result.total).toBe(1);
    expect(result.pages.length).toBe(1);
  });

  it('spike-two-page.json renders comfortably and exactly to 2 pages', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeTwoPage);
    const result = await extractTextWithPdfParse(buffer);
    expect(result.total).toBe(2);
    expect(result.pages.length).toBe(2);
  });
});

describe('Criterion 9: Class-Based pdf-parse v2 API', () => {
  it('instantiates PDFParse class and extracts text via parser.getText() then calls parser.destroy()', async () => {
    registerFonts();
    const buffer = await renderResumeToBuffer(spikeBasic);
    const parser = new PDFParse({ data: buffer });
    expect(parser).toBeInstanceOf(PDFParse);
    try {
      const result = await parser.getText();
      expect(result).toBeDefined();
      expect(typeof result.total).toBe('number');
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.text).toContain(spikeBasic.basics.fullName);
    } finally {
      await parser.destroy();
    }
  });
});
