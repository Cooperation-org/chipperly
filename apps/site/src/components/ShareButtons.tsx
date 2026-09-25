'use client';

import { useState, useSyncExternalStore } from 'react';
import { SOCIAL, type SocialPlatform } from '../lib/social';
import { SocialIcon } from './SocialLinks';

export type ShareTarget = SocialPlatform | 'email' | 'copy';

// Plain share links: no network scripts, no tracking pixels.
function shareUrl(target: ShareTarget, url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  switch (target) {
    case 'facebook': return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case 'x': return `https://x.com/intent/post?url=${u}&text=${t}`;
    case 'linkedin': return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case 'pinterest': return `https://pinterest.com/pin/create/button/?url=${u}&description=${t}`;
    case 'whatsapp': return `https://wa.me/?text=${t}%20${u}`;
    case 'reddit': return `https://www.reddit.com/submit?url=${u}&title=${t}`;
    case 'bluesky': return `https://bsky.app/intent/compose?text=${t}%20${u}`;
    case 'threads': return `https://www.threads.net/intent/post?text=${t}%20${u}`;
    case 'email': return `mailto:?subject=${t}&body=${u}`;
    default: return null;
  }
}

const noSubscribe = () => () => {};

const MAIL = 'M4 6h16v12H4zM4 7l8 6 8-6';
const LINK = 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1';
const SHARE = 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7';

const Stroke = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export function ShareButtons({ targets, url, title }: { targets: ShareTarget[]; url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  // false on the server, the real answer in the browser, no hydration mismatch
  const canNative = useSyncExternalStore(noSubscribe, () => 'share' in navigator, () => false);
  if (!targets.length) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <div className="share" role="group" aria-label="Share this post">
      <span className="share-label">Share</span>
      {canNative && (
        <button type="button" className="share-btn" onClick={() => navigator.share({ url, title }).catch(() => {})} aria-label="Share with an app on this device">
          <Stroke d={SHARE} />
        </button>
      )}
      {targets.map((t) => {
        if (t === 'copy') {
          return (
            <button key={t} type="button" className="share-btn" onClick={copy} aria-label="Copy link">
              <Stroke d={LINK} />
              <span className="share-copied" role="status">
                {copied ? 'Copied' : ''}
              </span>
            </button>
          );
        }
        const href = shareUrl(t, url, title);
        if (!href) return null;
        const label = t === 'email' ? 'Email' : SOCIAL[t].label;
        return (
          <a key={t} className="share-btn" href={href} target={t === 'email' ? undefined : '_blank'} rel="noopener" aria-label={`Share on ${label}`}>
            {t === 'email' ? <Stroke d={MAIL} /> : <SocialIcon platform={t} />}
          </a>
        );
      })}
    </div>
  );
}
