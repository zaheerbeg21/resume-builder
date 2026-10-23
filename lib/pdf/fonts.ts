import { Font } from '@react-pdf/renderer';

const isAlreadyRegistered = () => Boolean((globalThis as Record<string, unknown>).__interFontsRegistered);
const markRegistered = () => { (globalThis as Record<string, unknown>).__interFontsRegistered = true; };

const isSerifAlreadyRegistered = () => Boolean((globalThis as Record<string, unknown>).__serifFontsRegistered);
const markSerifRegistered = () => { (globalThis as Record<string, unknown>).__serifFontsRegistered = true; };

/**
 * Resolves font paths based on the runtime environment (server filesystem vs browser URL).
 * Avoids top-level Node module imports so client bundlers do not crash on node:path.
 */
export function getFontSources(): { regular: string; bold: string } {
  const isServer = typeof window === 'undefined';
  if (isServer) {
    // Server environment (Node.js runtime / Vitest)
    let nodePath: { join: (...args: string[]) => string } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      nodePath = require('node:path');
    } catch {
      nodePath = null;
    }

    if (nodePath && typeof nodePath.join === 'function') {
      return {
        regular: nodePath.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf'),
        bold: nodePath.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf'),
      };
    }

    const sep = typeof process !== 'undefined' && process.platform === 'win32' ? '\\' : '/';
    const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '';
    return {
      regular: `${cwd}${sep}public${sep}fonts${sep}Inter-Regular.ttf`,
      bold: `${cwd}${sep}public${sep}fonts${sep}Inter-Bold.ttf`,
    };
  }

  // Browser URL registration
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return {
    regular: `${origin}/fonts/Inter-Regular.ttf`,
    bold: `${origin}/fonts/Inter-Bold.ttf`,
  };
}

/**
 * Resolves static serif font paths (Source Serif 4) based on runtime environment.
 */
export function getSerifFontSources(): { regular: string; bold: string } {
  const isServer = typeof window === 'undefined';
  if (isServer) {
    let nodePath: { join: (...args: string[]) => string } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      nodePath = require('node:path');
    } catch {
      nodePath = null;
    }

    if (nodePath && typeof nodePath.join === 'function') {
      return {
        regular: nodePath.join(process.cwd(), 'public', 'fonts', 'SourceSerif4-Regular.ttf'),
        bold: nodePath.join(process.cwd(), 'public', 'fonts', 'SourceSerif4-Bold.ttf'),
      };
    }

    const sep = typeof process !== 'undefined' && process.platform === 'win32' ? '\\' : '/';
    const cwd = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '';
    return {
      regular: `${cwd}${sep}public${sep}fonts${sep}SourceSerif4-Regular.ttf`,
      bold: `${cwd}${sep}public${sep}fonts${sep}SourceSerif4-Bold.ttf`,
    };
  }

  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return {
    regular: `${origin}/fonts/SourceSerif4-Regular.ttf`,
    bold: `${origin}/fonts/SourceSerif4-Bold.ttf`,
  };
}

export function registerSerifFonts(): void {
  if (isSerifAlreadyRegistered()) {
    return;
  }

  Font.registerHyphenationCallback((word: string) => [word]);

  const { regular, bold } = getSerifFontSources();

  Font.register({
    family: 'Source Serif 4',
    fonts: [
      {
        src: regular,
        fontWeight: 'normal',
      },
      {
        src: bold,
        fontWeight: 'bold',
      },
    ],
  });

  markSerifRegistered();
}

export function registerFonts(): void {
  // Disable automatic hyphenation across all rendered documents
  Font.registerHyphenationCallback((word: string) => [word]);

  if (!isAlreadyRegistered()) {
    const { regular, bold } = getFontSources();

    Font.register({
      family: 'Inter',
      fonts: [
        {
          src: regular,
          fontWeight: 'normal',
        },
        {
          src: bold,
          fontWeight: 'bold',
        },
      ],
    });

    markRegistered();
  }

  registerSerifFonts();
}

