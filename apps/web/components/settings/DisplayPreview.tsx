'use client';

import { PictureTile } from '@/components/ui/PictureTile';
import { ChipStrip } from '@/components/ui/ChipStrip';
import type { ChipSize } from '@/components/ui/chipSize';
import { displaySizeClass, type DisplaySize } from '@/components/child/displaySize';
import styles from './LockSheet.module.css';

export const DISPLAY_SIZE_ITEMS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

/** A sample task and chips as the child's view shows them, at the chosen sizes, so the change can be seen before saving. */
export function DisplayPreview({
  textSize,
  pictureSize,
  pictureMode,
  chipSize,
}: {
  textSize: DisplaySize;
  pictureSize: DisplaySize;
  pictureMode: boolean;
  chipSize: ChipSize;
}) {
  const className = [
    styles.preview,
    pictureMode ? styles.previewPictures : '',
    displaySizeClass({ text_size: textSize, picture_size: pictureSize }),
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} role="group" aria-label="Preview">
      <PictureTile emoji="🪥" name="Brush teeth" size="child" />
      <span className={styles.previewName}>Brush teeth</span>
      <div className={styles.previewChips}>
        <ChipStrip size="lg" showCount filled={3} total={5} chipSize={chipSize} />
      </div>
    </div>
  );
}
