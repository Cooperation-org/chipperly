import type { Metadata, Viewport } from 'next';
import { heading, body } from './fonts';
import { Providers } from '@/components/providers/Providers';
import './styles/globals.css';

const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: 'Chipperly', template: '%s · Chipperly' },
  description: 'Visual supports for the whole care team.',
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icons/icon-192.png`,
    apple: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icons/apple-touch-icon-180.png`,
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
