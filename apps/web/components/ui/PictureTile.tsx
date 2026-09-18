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

  if (photoUrl) {
    return (
      <span className={classes}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, images served by our API */}
        <img src={photoUrl} alt={name} className={styles.img} />
      </span>
    );
  }

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
