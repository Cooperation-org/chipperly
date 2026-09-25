import Script from 'next/script';
import { clarityScript } from '../lib/clarity';
import { SITE_URL } from '../lib/site';

// Microsoft Clarity on the live site only (see lib/clarity.ts for the
// guards). Project ID from Site settings, else the CLARITY_ID env var.
export function Clarity({ id }: { id?: string | null }) {
  const code = clarityScript(id || process.env.CLARITY_ID, SITE_URL, process.env.NODE_ENV);
  return code ? (
    <Script id="ms-clarity" strategy="afterInteractive">
      {code}
    </Script>
  ) : null;
}
