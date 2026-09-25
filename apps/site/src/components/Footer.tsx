import Link from 'next/link';
import { TAGLINE } from '../lib/site';
import type { SocialPlatform } from '../lib/social';
import { SocialLinks } from './SocialLinks';

export function Footer({ email, social, appUrl }: { email: string; social: { platform: SocialPlatform; url: string }[]; appUrl: string }) {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link href="/" className="brand brand-light">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.svg" alt="" width={32} height={32} />
            <span>Chipperly</span>
          </Link>
          <p>{TAGLINE}</p>
          <p className="muted-light">Chipperly LLC · Founded in Tucson, Arizona</p>
          <SocialLinks links={social} />
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link href="/features">Features</Link>
          <Link href="/features#faq">FAQ</Link>
          <a href={`${appUrl}/`}>Sign in</a>
          <a href={`${appUrl}/sign-up/`}>Try the app</a>
        </nav>
        <nav aria-label="Company">
          <h2>Company</h2>
          <Link href="/about">Our story</Link>
          <Link href="/blog">Blog</Link>
          <a href={`mailto:${email}`}>{email}</a>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <a href={`${appUrl}/privacy/`}>Privacy</a>
          <a href={`${appUrl}/terms/`}>Terms</a>
          <a href="/blog/rss.xml">RSS feed</a>
        </nav>
      </div>
      <div className="wrap footer-base">© {new Date().getFullYear()} Chipperly LLC. All rights reserved.</div>
    </footer>
  );
}
