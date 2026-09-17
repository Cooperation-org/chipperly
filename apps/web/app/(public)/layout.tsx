import type { Metadata } from 'next';
import Script from 'next/script';
import { GoogleAnalytics } from '@next/third-parties/google';
import { withBase } from '@/lib/api/base';
import styles from './layout.module.css';

const gscVerification = process.env.NEXT_PUBLIC_GSC_VERIFICATION;
const ga4MeasurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

export const metadata: Metadata = gscVerification ? { verification: { google: gscVerification } } : {};

// technical-plan.md 7c: analytics render only on public routes, never inside
// the authenticated app or the child view.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <img src={withBase('/brand/mark.svg')} alt="Chipperly" width={40} height={40} className={styles.mark} />
        {children}
      </div>
      {ga4MeasurementId ? <GoogleAnalytics gaId={ga4MeasurementId} /> : null}
      {clarityProjectId ? (
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityProjectId}");`}
        </Script>
      ) : null}
    </div>
  );
}
