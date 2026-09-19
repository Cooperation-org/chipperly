import type { Metadata, Viewport } from 'next';
import { heading, body } from './fonts';
import { Providers } from '@/components/providers/Providers';
import './styles/globals.css';

const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: 'Chipperly', template: '%s · Chipperly' },
  description: 'Visual supports for the whole care team.',
  icons: {
    // PNG first, then SVG: Safari ignores SVG favicons and takes the last PNG it understands.
    icon: [
      { url: `${basePath}/icons/favicon-96.png`, sizes: '96x96', type: 'image/png' },
      { url: `${basePath}/brand/mark.svg`, type: 'image/svg+xml' },
    ],
    apple: `${basePath}/icons/apple-touch-icon-180.png`,
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Chipperly',
  },
};

export const viewport: Viewport = {
  themeColor: '#1F6F78',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
