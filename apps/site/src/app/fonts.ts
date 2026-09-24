// Same faces as the app (apps/web/app/fonts.ts): Alegreya for headings,
// Alegreya Sans for body. Self-hosted, Latin subsets.
import localFont from 'next/font/local';

export const heading = localFont({
  src: [{ path: './fonts/alegreya-latin.woff2', weight: '400 900', style: 'normal' }],
  variable: '--font-heading',
  display: 'swap',
});

export const body = localFont({
  src: [
    { path: './fonts/alegreya-sans-400-latin.woff2', weight: '400', style: 'normal' },
    { path: './fonts/alegreya-sans-500-latin.woff2', weight: '500', style: 'normal' },
    { path: './fonts/alegreya-sans-700-latin.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
});
