// The only file that changes when the licensed Altone / Code Pro LC files
// arrive (technical-plan.md "Fonts"). Until then: Outfit / Montserrat.
import { Outfit, Montserrat } from 'next/font/google';

export const heading = Outfit({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-heading',
  display: 'swap',
});

export const body = Montserrat({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-body',
  display: 'swap',
});
