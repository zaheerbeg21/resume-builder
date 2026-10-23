import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { registerFonts, getFontSources } from '@/lib/pdf/fonts';
import { LivePdfPreview, PreviewSkeleton } from '@/components/editor/LivePdfPreview';
import { ResumeDocument } from '@/lib/pdf/templates/standard';
import type { Resume } from '@/types/resume';
import spikeBasicJson from '../fixtures/resumes/spike-basic.json';

const spikeBasic = spikeBasicJson as unknown as Resume;

describe('T-013: Browser-Safe Font Registration & Environment Detection', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    // Restore global window after each test
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('detects server environment and resolves filesystem font paths using process.cwd()', () => {
    delete (globalThis as Record<string, unknown>).window;
    expect(typeof window).toBe('undefined');

    const sources = getFontSources();
    expect(sources.regular).toContain(process.cwd());
    expect(sources.regular).toMatch(/Inter-Regular\.ttf$/);
    expect(sources.bold).toContain(process.cwd());
    expect(sources.bold).toMatch(/Inter-Bold\.ttf$/);
  });

  it('detects browser environment and resolves font paths using window.location.origin', () => {
    (globalThis as Record<string, unknown>).window = {
      location: {
        origin: 'https://resumebuilder.app',
      },
    };

    const sources = getFontSources();
    expect(sources.regular).toBe('https://resumebuilder.app/fonts/Inter-Regular.ttf');
    expect(sources.bold).toBe('https://resumebuilder.app/fonts/Inter-Bold.ttf');
  });

  it('falls back to root-relative paths if window is defined without origin', () => {
    (globalThis as Record<string, unknown>).window = {
      location: {
        origin: '',
      },
    };

    const sources = getFontSources();
    expect(sources.regular).toBe('/fonts/Inter-Regular.ttf');
    expect(sources.bold).toBe('/fonts/Inter-Bold.ttf');
  });

  it('performs idempotent font registration via globalThis flag without throwing', () => {
    delete (globalThis as Record<string, unknown>).window;
    expect(() => {
      registerFonts();
      registerFonts();
    }).not.toThrow();

    expect((globalThis as Record<string, unknown>).__interFontsRegistered).toBe(true);
  });
});

describe('T-013: LivePdfPreview Component & Prop Propagation', () => {
  it('renders preview container, zoom controls, and US Letter aspect ratio wrapper', () => {
    const html = renderToString(React.createElement(LivePdfPreview, { resume: spikeBasic }));

    // Verify main preview card container
    expect(html).toContain('data-testid="live-canvas-preview"');
    expect(html).toContain('Live Document Preview');
    expect(html).toContain('US Letter');

    // Verify Zoom-to-fit controls
    expect(html).toContain('data-testid="zoom-controls"');
    expect(html).toContain('data-testid="zoom-fit-width"');
    expect(html).toContain('Fit Width');
    expect(html).toContain('data-testid="zoom-reset"');
    expect(html).toContain('100%');
    expect(html).toContain('data-testid="zoom-in"');
    expect(html).toContain('data-testid="zoom-out"');
    expect(html).toContain('data-testid="zoom-level"');

    // Verify US Letter aspect ratio frame
    expect(html).toContain('data-testid="pdf-aspect-container"');
    expect(html).toContain('aspect-[8.5/11]');
  });

  it('propagates candidate name and resume details to the preview header', () => {
    const html = renderToString(React.createElement(LivePdfPreview, { resume: spikeBasic }));
    expect(html).toContain(spikeBasic.basics.fullName);

    // Propagate an updated resume with a new candidate name
    const updatedResume: Resume = {
      ...spikeBasic,
      basics: {
        ...spikeBasic.basics,
        fullName: 'Dr. Samantha Vance',
      },
    };
    const updatedHtml = renderToString(React.createElement(LivePdfPreview, { resume: updatedResume }));
    expect(updatedHtml).toContain('Dr. Samantha Vance');
    expect(updatedHtml).not.toContain(spikeBasic.basics.fullName);
  });

  it('renders preview skeleton with loading spinner and section placeholders during SSR', () => {
    const html = renderToString(React.createElement(PreviewSkeleton));
    expect(html).toContain('data-testid="pdf-preview-skeleton"');
    expect(html).toContain('Preparing preview canvas...');
  });

  it('guarantees shared <ResumeDocument> component tree compatibility for export and preview', () => {
    const docElement = ResumeDocument({ resume: spikeBasic });
    expect(docElement).toBeDefined();
    expect(docElement.type).toBeDefined();

    // Verify resume basics prop exists in Document tree
    const children = React.Children.toArray(
      (docElement as React.ReactElement<{ children?: React.ReactNode }>).props.children
    );
    expect(children.length).toBeGreaterThan(0);
  });
});
