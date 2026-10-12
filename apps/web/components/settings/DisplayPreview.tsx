'use client';

import { ListRow } from '@/components/ui/ListRow';
import { PictureTile } from '@/components/ui/PictureTile';
import { displaySizeClass, type DisplaySize } from '@/components/child/displaySize';
import styles from './LockSheet.module.css';

export const DISPLAY_SIZE_ITEMS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

/** A sample card at the chosen sizes, so the change can be seen before saving. */
export function DisplayPreview({ textSize, pictureSize }: { textSize: DisplaySize; pictureSize: DisplaySize }) {
  return (
    <div className={[styles.preview, displaySizeClass({ text_size: textSize, picture_size: pictureSize })].join(' ')} aria-label="Preview">
      <ListRow tile={<PictureTile emoji="🪥" name="Brush teeth" size="child" />} name="Brush teeth" secondary="Morning" />
    </div>
  );
}
