import Link from 'next/link';
import { Icon } from './Icon';

const NAV = [
  ['Features', '/features'],
  ['About', '/about'],
  ['Blog', '/blog'],
] as const;

export function Header({ launched, appUrl }: { launched: boolean; appUrl: string }) {
  const cta = launched ? { label: 'Get started', href: `${appUrl}/sign-up/` } : { label: 'Join the waitlist', href: '#waitlist' };
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link href="/" className="brand" aria-label="Chipperly home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.svg" alt="" width={36} height={36} />
          <span>Chipperly</span>
        </Link>
        <nav aria-label="Main" className="nav-desktop">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
          <a href={`${appUrl}/`}>Sign in</a>
          <a className="btn btn-primary btn-sm" href={cta.href}>
            {cta.label}
          </a>
        </nav>
        {/* No-JS mobile menu: a native disclosure. */}
        <details className="nav-mobile">
          <summary aria-label="Menu">
            <Icon name="menu" />
          </summary>
          <nav aria-label="Main">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            <a href={`${appUrl}/`}>Sign in</a>
            <a className="btn btn-primary" href={cta.href}>
              {cta.label}
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}
