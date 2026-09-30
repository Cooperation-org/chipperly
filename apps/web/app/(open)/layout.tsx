import Link from 'next/link';
import Script from 'next/script';
import { GoogleAnalytics } from '@next/third-parties/google';
import { withBase } from '@/lib/api/base';
import styles from './layout.module.css';

const ga4MeasurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

/**
 * Public, readable without an account, and wide enough for a feed.
 *
 * Its own group rather than (public): that one is a 420px card built for the
 * sign-in forms. And deliberately NOT (caregiver), which wraps everything in
 * RequireSession and sets noindex — which is what kept the community, meant to
 * be publicly readable, behind a sign-in wall.
 *
 * Analytics render on public routes only, never in the app or the child view
 * (technical-plan.md 7c).
 */
export default function OpenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, images served by our API */}
          <img src={withBase('/brand/mark.svg')} alt="" width={28} height={28} aria-hidden="true" />
          <span>Chipperly</span>
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
      <p className={styles.footer}>
        <Link href="/privacy/">Privacy</Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms/">Terms</Link>
      </p>
      {ga4MeasurementId ? <GoogleAnalytics gaId={ga4MeasurementId} /> : null}
      {clarityProjectId ? (
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityProjectId}");`}
        </Script>
      ) : null}
    </div>
  );
}
