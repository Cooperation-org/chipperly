'use client';

import { ChipStar } from './ChipStar';
import { PhotoZoom } from './PhotoZoom';
import { PictureTile } from './PictureTile';
import styles from './ChipStrip.module.css';

export interface ChipStripReward {
  emoji?: string;
  photo_id?: string | null;
  photoUrl?: string | null;
  name: string;
}

export interface ChipStripProps {
  filled: number;
  total: number;
  reward?: ChipStripReward;
  onTap?: () => void;
  size?: 'md' | 'lg';
}

/** Compact chip row plus the working-for reward: Today header, child header, share viewer. */
export function ChipStrip({ filled, total, reward, onTap, size = 'md' }: ChipStripProps) {
  const label = `${filled} of ${total} chips${reward ? `, working for ${reward.name}` : ''}`;
  const chips = (
    <span className={styles.chips} aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <ChipStar key={i} size="1em" muted={i >= filled} className={styles.chip} />
      ))}
    </span>
  );
  const tile = reward ? (
    <PictureTile emoji={reward.emoji} photo_id={reward.photo_id} photoUrl={reward.photoUrl} name={reward.name} size="list" />
  ) : null;
  // A photo opens large on tap, so the reward sits beside the strip's own tap target rather than inside it.
  const rewardPart = reward ? (
    <span className={styles.reward}>
      {reward.photoUrl ? (
        <PhotoZoom url={reward.photoUrl} name={reward.name}>
          {tile}
        </PhotoZoom>
      ) : (
        tile
      )}
      <span className={styles.rewardName}>{reward.name}</span>
    </span>
  ) : null;

  if (onTap) {
    return (
      <span className={[styles.strip, styles[size]].join(' ')}>
        <button type="button" className={styles.tapTarget} onClick={onTap} aria-label={label}>
          {chips}
        </button>
        {rewardPart}
      </span>
    );
  }

  return (
    <div className={[styles.strip, styles[size]].join(' ')}>
      {/* The label sits on the chips alone: role="img" can't contain the photo's button. */}
      <span role="img" aria-label={label}>
        {chips}
      </span>
      {rewardPart}
    </div>
  );
}
