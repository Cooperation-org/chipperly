// The only file that changes when the licensed Altone / Code Pro LC files
// arrive (technical-plan.md "Fonts"). Until then, chosen 19 Sept 2026:
// Alegreya (serif, SIL OFL) for headings and display, Alegreya Sans (SIL OFL)
// for body and labels. Both download at build time and self-host; no runtime
// request to Google.
import { Alegreya, Alegreya_Sans } from 'next/font/google';

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
