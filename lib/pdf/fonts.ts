import path from 'node:path';
import { Font } from '@react-pdf/renderer';

let isRegistered = false;

export function registerFonts(): void {
  if (isRegistered) {
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

  isRegistered = true;
}
