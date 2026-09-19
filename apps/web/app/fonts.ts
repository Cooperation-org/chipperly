// The only file that changes when the licensed Altone / Code Pro LC files
// arrive (technical-plan.md "Fonts"). Until then, chosen 19 Sept 2026:
// Alegreya (serif, SIL OFL) for headings and display, Alegreya Sans (SIL OFL)
// for body and labels. Both download at build time and self-host; no runtime
// request to Google.
import { Alegreya, Alegreya_Sans } from 'next/font/google';
import localFont from 'next/font/local';

export const heading = Alegreya({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
});

export const body = Alegreya_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
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
