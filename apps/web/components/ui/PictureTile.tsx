'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Skeleton } from './Skeleton';
import styles from './PictureTile.module.css';

export type PictureTileSize = 'list' | 'grid' | 'child';

export interface PictureTileProps {
  emoji?: string;
  photo_id?: string | null;
  /** Resolved URL for `photo_id`, looked up elsewhere (lib/data/media.ts). */
  photoUrl?: string | null;
  name: string;
  size: PictureTileSize;
  className?: string;
}

/** Square picture, emoji or photo. Neutral placeholder when neither is set yet. */
export function PictureTile({ emoji, photo_id, photoUrl, name, size, className }: PictureTileProps) {
  const classes = [styles.tile, styles[size], className].filter(Boolean).join(' ');

  if (photoUrl) return <PhotoImg key={photoUrl} url={photoUrl} name={name} size={size} classes={classes} />;

  // Photo chosen but not resolved yet (still syncing/uploading): show a skeleton, not a broken image.
  if (photo_id) {
    return (
      <span className={classes} role="img" aria-label={name}>
        <Skeleton width="100%" height="100%" radius={size === 'grid' ? 'lg' : 'md'} />
      </span>
    );
  }

  if (emoji) {
    return (
      <span className={classes} role="img" aria-label={name}>
        <span className={styles.emoji} aria-hidden="true">
          {emoji}
        </span>
      </span>
    );
  }

  return (
    <span className={classes} role="img" aria-label={name}>
      <Icon name="image" size={20} className={styles.placeholder} />
    </span>
  );
}

// ponytail: fixed backoff, ~1.5 min total; a photo still missing after that shows the skeleton until the next render.
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000, 30_000];

/**
 * A photo picked on one device syncs its photo_id to the others before the
 * upload itself lands, so the first /api/media/:id request can 404. A plain
 * <img> never asks again (only a page refresh did), so this retries with a
 * cache-busting query, showing the skeleton in between instead of a blank tile.
 */
function PhotoImg({ url, name, size, classes }: { url: string; name: string; size: PictureTileSize; classes: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!failed || attempt >= RETRY_DELAYS_MS.length) return;
    const timer = setTimeout(() => {
      setAttempt((n) => n + 1);
      setFailed(false);
    }, RETRY_DELAYS_MS[attempt]);
    return () => clearTimeout(timer);
  }, [failed, attempt]);

  const src = attempt === 0 || url.startsWith('blob:') ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}`;
  return (
    <span className={classes}>
      {failed ? <Skeleton width="100%" height="100%" radius={size === 'grid' ? 'lg' : 'md'} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, images served by our API */}
      <img key={src} src={src} alt={name} className={styles.img} hidden={failed} onError={() => setFailed(true)} />
    </span>
  );
}
