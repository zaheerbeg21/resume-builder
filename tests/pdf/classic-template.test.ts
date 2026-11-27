import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import React from 'react';
import { renderToBuffer, Document } from '@react-pdf/renderer';
import { renderToString } from 'react-dom/server';
import { PDFParse, type TextResult } from 'pdf-parse';
import { registerFonts, registerSerifFonts, getSerifFontSources } from '@/lib/pdf/fonts';
import { ClassicResumeDocument } from '@/lib/pdf/templates/classic';
import { LivePdfPreview } from '@/components/editor/LivePdfPreview';
import { POST as exportPdfRoute } from '@/app/api/pdf/export/route';
import { setServiceRoleClientForTesting } from '@/lib/billing/entitlements';
import * as supabaseServer from '@/lib/db/supabase-server';
import type { Resume } from '@/types/resume';

import spikeBasicJson from '../fixtures/resumes/spike-basic.json';
import spikeTwoPageJson from '../fixtures/resumes/spike-two-page.json';
import spikeAccentedJson from '../fixtures/resumes/spike-accented.json';
import spikePolishJson from '../fixtures/resumes/spike-polish.json';

const spikeBasic = spikeBasicJson as unknown as Resume;
const spikeTwoPage = spikeTwoPageJson as unknown as Resume;
const spikeAccented = spikeAccentedJson as unknown as Resume;
const spikePolish = spikePolishJson as unknown as Resume;

const resumeWithProjects: Resume = {
  ...spikeBasic,
  projects: [
    {
      id: 'proj-1',
      name: 'Atlas ATS Engine',
      url: 'https://atlas-ats.example.com',
      bullets: [
        'Built high throughput ATS document compiler serving 100k requests.',
        'Maintained 100% typographic fidelity across print devices.',
      ],
    },
  ],
};

function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/-- \d+ of \d+ --/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function renderClassicToBuffer(resume: Resume): Promise<Buffer> {
  registerFonts();
  const element = React.createElement(ClassicResumeDocument, { resume }) as unknown as React.ReactElement<React.ComponentProps<typeof Document>>;
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

function assertInOrder(text: string, expected: string[]): void {
  let cursor = 0;
  for (const s of expected) {
    const at = text.indexOf(s, cursor);
    expect(at, `missing or out of order in Classic template: "${s}"`).toBeGreaterThanOrEqual(0);
    cursor = at + s.length;
  }
}

function flattenStyles(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => Object.assign(acc, flattenStyles(s)), {});
  }
  if (typeof style === 'object') {
    return { ...(style as Record<string, unknown>) };
  }
  return {};
}

function walkTree(node: React.ReactNode, errors: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walkTree(child, errors);
    return;
  }
  if (!React.isValidElement(node)) return;

  if (typeof node.type === 'function') {
    const FunctionCtor = node.type as (props: unknown) => React.ReactNode;
    const expanded = FunctionCtor(node.props);
    walkTree(expanded, errors);
    return;
  }

  const typeWithNames = node.type as { displayName?: string; name?: string };
  const typeName = typeof node.type === 'string'
    ? node.type
    : typeWithNames?.displayName || typeWithNames?.name || '';

  if (['IMAGE', 'Image', 'ImageBackground', 'SVG', 'Svg'].includes(typeName)) {
    errors.push(`Disallowed element <${typeName}> found in resume document`);
  }

  const props = (node.props as Record<string, unknown>) || {};
  const style = flattenStyles(props.style);

  if (style.columns !== undefined || style.columnCount !== undefined) {
    errors.push(`Disallowed columns style found`);
  }
  if (style.position === 'absolute') {
    errors.push(`Disallowed absolute positioning`);
  }
  if (typeName === 'PAGE' || typeName === 'Page') {
    const pad = style.padding;
    const is468 = typeof pad === 'number' && Math.abs(pad - 46.8) <= 0.05;
    if (!is468) {
      errors.push(`Page padding must be strictly 46.8 on all sides, received: ${pad}`);
    }
  }

  if (props.children) {
    walkTree(props.children as React.ReactNode, errors);
  }
}

function validateClassicTree(element: React.ReactNode): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  walkTree(element, errors);
  return { valid: errors.length === 0, errors };
}

describe('T-011: Static Serif Font Registration & Environment Paths', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('resolves server filesystem serif font paths using process.cwd()', () => {
    delete (globalThis as Record<string, unknown>).window;
    const sources = getSerifFontSources();
    expect(sources.regular).toContain(process.cwd());
    expect(sources.regular).toMatch(/SourceSerif4-Regular\.ttf$/);
    expect(sources.bold).toContain(process.cwd());
    expect(sources.bold).toMatch(/SourceSerif4-Bold\.ttf$/);
  });

  it('resolves browser serif font paths using window.location.origin', () => {
    (globalThis as Record<string, unknown>).window = {
      location: {
        origin: 'https://resumebuilder.app',
      },
    };

    const sources = getSerifFontSources();
    expect(sources.regular).toBe('https://resumebuilder.app/fonts/SourceSerif4-Regular.ttf');
    expect(sources.bold).toBe('https://resumebuilder.app/fonts/SourceSerif4-Bold.ttf');
  });

  it('guarantees idempotent serif font registration via __serifFontsRegistered flag', () => {
    expect(() => {
      registerSerifFonts();
      registerSerifFonts();
    }).not.toThrow();

    expect((globalThis as Record<string, unknown>).__serifFontsRegistered).toBe(true);
  });

  it('registerFonts() registers both Inter and Source Serif 4 idempotently', () => {
    expect(() => {
      registerFonts();
      registerFonts();
    }).not.toThrow();

    expect((globalThis as Record<string, unknown>).__interFontsRegistered).toBe(true);
    expect((globalThis as Record<string, unknown>).__serifFontsRegistered).toBe(true);
  });
});

describe('T-011: Classic Template Layout Constraints & Single-Column Parity', () => {
  it('enforces strictly single-column layout without tables, columns, or icons on Classic template', () => {
    registerFonts();
    const docElement = ClassicResumeDocument({ resume: spikeBasic });
    const { valid, errors } = validateClassicTree(docElement);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it('validates strictly 46.8pt (0.65in) padding on all 4 sides', () => {
    const docElement = ClassicResumeDocument({ resume: spikeBasic });
    const { valid, errors } = validateClassicTree(docElement);
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });

  it('enforces 10.5pt body text fontSize and unitless 1.35 lineHeight in classic template styles', () => {
    const docElement = ClassicResumeDocument({ resume: spikeBasic });
    expect(docElement).toBeDefined();
    expect((docElement as React.ReactElement<{ children?: React.ReactNode }>).props.children).toBeDefined();
  });
});

describe('T-011: Classic Template pdf-parse v2 Text Extraction & Reading Order', () => {
  it('preserves top-to-bottom reading order with literal headings for spike-basic', async () => {
    const buffer = await renderClassicToBuffer(spikeBasic);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);

    const expectedOrder = [
      spikeBasic.basics.fullName,
      spikeBasic.basics.headline,
      'Summary',
      spikeBasic.summary,
      'Experience',
      spikeBasic.experience[0].title,
      spikeBasic.experience[0].company,
      spikeBasic.experience[0].bullets[0],
      'Education',
      spikeBasic.education[0].school,
      'Skills',
      spikeBasic.skills[0].items[0],
    ];

    assertInOrder(normalized, expectedOrder);
  });

  it('preserves Projects section in reading order between Experience and Education', async () => {
    const buffer = await renderClassicToBuffer(resumeWithProjects);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);

    const expectedOrder = [
      resumeWithProjects.basics.fullName,
      'Summary',
      'Experience',
      'Projects',
      'Atlas ATS Engine',
      'Built high throughput ATS document compiler serving 100k requests.',
      'Education',
      'Skills',
    ];

    assertInOrder(normalized, expectedOrder);
  });

  it('extracts zero U+FFFD replacement characters across basic, accented, and Polish fixtures', async () => {
    for (const fixture of [spikeBasic, spikeAccented, spikePolish, spikeTwoPage]) {
      const buffer = await renderClassicToBuffer(fixture);
      const result = await extractTextWithPdfParse(buffer);
      expect(result.text, `Found U+FFFD replacement character in fixture`).not.toContain('\uFFFD');
    }
  });

  it('matches French accented name "Renée Noël Müller" with 100% string equality', async () => {
    const buffer = await renderClassicToBuffer(spikeAccented);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);
    expect(normalized).toContain('Renée Noël Müller'.normalize('NFC'));
  });

  it('matches Polish diacritic name "Łukasz Żółć" with 100% string equality', async () => {
    const buffer = await renderClassicToBuffer(spikePolish);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);
    expect(normalized).toContain('Łukasz Żółć'.normalize('NFC'));
  });

  it('extracts ligature words (Certified, workflow, office) with exact fidelity', async () => {
    const buffer = await renderClassicToBuffer(spikeBasic);
    const result = await extractTextWithPdfParse(buffer);
    const normalized = normalizeText(result.text);

    expect(normalized).toContain('Certified');
    expect(normalized).toContain('workflow');
    expect(normalized).toContain('office');
  });

  it('embeds Source Serif 4 font in raw PDF buffer without fallback to Times or Helvetica', async () => {
    const buffer = await renderClassicToBuffer(spikeBasic);
    const rawPdf = buffer.toString('latin1');

    expect(rawPdf).toMatch(/\+[A-Za-z0-9]*SourceSerif/i);
    expect(rawPdf).not.toMatch(/\/BaseFont\s*\/Helvetica/);
    expect(rawPdf).not.toMatch(/\/BaseFont\s*\/Times/);
  });
});

describe('T-011: Template Dispatching in Preview and Export Pipeline', () => {
  it('LivePdfPreview accepts template="classic" and renders without error', () => {
    const html = renderToString(
      React.createElement(LivePdfPreview, {
        resume: spikeBasic,
        template: 'classic',
      })
    );
    expect(html).toContain('data-testid="live-canvas-preview"');
    expect(html).toContain(spikeBasic.basics.fullName);
  });

  it('PDF export route successfully renders classic template when requested', async () => {
    const mockUser = { id: '00000000-0000-4000-a000-000000000001', email: 'test@example.com' };
    const mockResumeRecord = {
      id: '11111111-1111-4111-a111-111111111111',
      user_id: mockUser.id,
      title: 'Classic Resume Test',
      template: 'classic',
      content: spikeBasic,
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockResumeRecord, error: null }),
            }),
          }),
        }),
      }),
    };

    const mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === 'entitlements') {
          const builder = {
            select: vi.fn(() => builder),
            eq: vi.fn(() => builder),
            gt: vi.fn(() => builder),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
          return builder;
        }
        if (table === 'usage_events') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    setServiceRoleClientForTesting(mockAdminClient);
    vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(
      mockSupabase as unknown as Awaited<ReturnType<typeof supabaseServer.createClient>>
    );

    const request = new Request('http://localhost:3000/api/pdf/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeId: '11111111-1111-4111-a111-111111111111',
        template: 'classic',
      }),
    });

    try {
      const response = await exportPdfRoute(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');

      const pdfArrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(pdfArrayBuffer);
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        expect(parsed.text).toContain(spikeBasic.basics.fullName);
        expect(parsed.text).not.toContain('\uFFFD');
      } finally {
        await parser.destroy();
      }
    } finally {
      setServiceRoleClientForTesting(null);
    }
  });
});
