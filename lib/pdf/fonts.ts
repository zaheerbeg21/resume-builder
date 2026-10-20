import path from 'node:path';
import { Font } from '@react-pdf/renderer';

const isAlreadyRegistered = () => Boolean((globalThis as Record<string, unknown>).__interFontsRegistered);
const markRegistered = () => { (globalThis as Record<string, unknown>).__interFontsRegistered = true; };

export function registerFonts(): void {
  if (isAlreadyRegistered()) {
    return;
  }

  // Disable automatic hyphenation across all rendered documents
  Font.registerHyphenationCallback((word: string) => [word]);

  // Server-side absolute paths (browser URL registration stubbed for T-013)
  const isServer = typeof window === 'undefined';
  const regularSrc = isServer
    ? path.join(process.cwd(), 'public', 'fonts', 'Inter-Regular.ttf')
    : '/fonts/Inter-Regular.ttf';
  const boldSrc = isServer
    ? path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf')
    : '/fonts/Inter-Bold.ttf';

  Font.register({
    family: 'Inter',
    fonts: [
      {
        src: regularSrc,
        fontWeight: 'normal',
      },
      {
        src: boldSrc,
        fontWeight: 'bold',
      },
    ],
  });

  markRegistered();
}
