'use client';

import { PictureTile } from '@/components/ui/PictureTile';
import { displaySizeClass, type DisplaySize } from '@/components/child/displaySize';
import styles from './LockSheet.module.css';

export const DISPLAY_SIZE_ITEMS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

/** A sample task as the child's view shows it, at the chosen sizes, so the change can be seen before saving. */
export function DisplayPreview({
  textSize,
  pictureSize,
  pictureMode,
}: {
  textSize: DisplaySize;
  pictureSize: DisplaySize;
  pictureMode: boolean;
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
    </div>
  );
}
