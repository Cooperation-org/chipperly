import { SOCIAL, type SocialPlatform } from '../lib/social';

export function SocialIcon({ platform, size = 20 }: { platform: SocialPlatform; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={SOCIAL[platform].path} />
    </svg>
  );
}

// Footer follow buttons, set in Site settings > Social.
export function SocialLinks({ links }: { links: { platform: SocialPlatform; url: string }[] }) {
  if (!links.length) return null;
  return (
    <ul className="social-links">
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} rel="me noopener" target="_blank" aria-label={`Chipperly on ${SOCIAL[l.platform].label}`}>
            <SocialIcon platform={l.platform} />
          </a>
        </li>
      ))}
    </ul>
  );
}
