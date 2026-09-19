'use client';

import { ChipStar } from './ChipStar';
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
  const content = (
    <>
      <span className={styles.chips} aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <ChipStar key={i} size="1em" muted={i >= filled} className={styles.chip} />
        ))}
      </span>
      {reward ? (
        <span className={styles.reward}>
          <PictureTile emoji={reward.emoji} photo_id={reward.photo_id} photoUrl={reward.photoUrl} name={reward.name} size="list" />
          <span className={styles.rewardName}>{reward.name}</span>
        </span>
      ) : null}
    </>
  );

  if (onTap) {
    return (
      <button type="button" className={[styles.strip, styles[size]].join(' ')} onClick={onTap} aria-label={label}>
        {content}
      </button>
    );
  }

  return (
    <div className={[styles.strip, styles[size]].join(' ')} role="img" aria-label={label}>
      {content}
    </div>
  );
}
