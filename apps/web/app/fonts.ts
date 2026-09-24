// The only file that changes when the licensed Altone / Code Pro LC files
// arrive (technical-plan.md "Fonts"). Until then, chosen 19 Sept 2026:
// Alegreya (serif, SIL OFL) for headings and display, Alegreya Sans (SIL OFL)
// for body and labels. The Latin subsets live in fonts/ (see fonts/README.md),
// so a build never depends on reaching Google Fonts.
import localFont from 'next/font/local';

export const heading = localFont({
  // One variable file covers every weight.
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

// Emoji are the picture system, so they must look the same on every device.
// Twemoji Mozilla (COLRv0, renders in Chrome, Safari and Firefox) subset to
// the emoji the app can show; see fonts/README.md for the licence and how to
// rebuild it after adding emoji to packages/shared. tokens.css slots it
// after the text faces so letters stay Alegreya and only emoji come from it.
export const twemoji = localFont({
  src: './fonts/twemoji-chipperly.woff2',
  variable: '--font-emoji',
  display: 'swap',
  adjustFontFallback: false,
  preload: true,
});
