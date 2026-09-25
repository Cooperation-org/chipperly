import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { CtaBand } from '../../components/CtaBand';
import { Clarity } from '../../components/Clarity';
import { Footer } from '../../components/Footer';
import { Header } from '../../components/Header';
import { JsonLd } from '../../components/JsonLd';
import { organization, website } from '../../lib/jsonld';
import { getSettings } from '../../lib/payload';
import { APP_URL, CONTACT_EMAIL, DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from '../../lib/site';
import { body, heading } from '../fonts';
import './site.css';

const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} - Visual Supports for Neurodivergent Individuals`, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: [{ url: '/brand/mark.svg', type: 'image/svg+xml' }, { url: '/icons/favicon-96.png', sizes: '96x96' }],
    apple: '/icons/apple-touch-icon-180.png',
  },
  alternates: { types: { 'application/rss+xml': `${SITE_URL}/blog/rss.xml` } },
  formatDetection: { telephone: false },
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const other: Record<string, string> = {};
  if (settings.bingVerification) other['msvalidate.01'] = settings.bingVerification;
  return {
    ...baseMetadata,
    verification: { google: settings.googleVerification || undefined, other },
  };
}

export const viewport: Viewport = { themeColor: '#1f6f78' };

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const social = settings.social ?? [];
  const bar = settings.announcement;
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {bar?.enabled && bar.text ? (
          <div className="announce">
            {bar.link ? <Link href={bar.link}>{bar.text}</Link> : bar.text}
          </div>
        ) : null}
        <Header launched={Boolean(settings.launched)} appUrl={APP_URL} />
        <main id="main">{children}</main>
        <CtaBand launched={Boolean(settings.launched)} appUrl={APP_URL} />
        <Footer email={settings.contactEmail || CONTACT_EMAIL} social={social} appUrl={APP_URL} />
        <JsonLd graph={[organization(social.map((s) => s.url)), website()]} />
        <Clarity id={settings.clarityId} />
      </body>
    </html>
  );
}
