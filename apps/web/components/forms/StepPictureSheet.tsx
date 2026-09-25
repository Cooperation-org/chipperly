'use client';

import { useState } from 'react';
import { PicturePicker, type PicturePickerValue } from '@/components/picture/PicturePicker';
import { BigButton } from '@/components/ui/BigButton';
import { Button } from '@/components/ui/Button';
import styles from './StepPictureSheet.module.css';

export interface StepPictureSheetProps {
  initial: PicturePickerValue;
  name: string;
  onDone: (value: PicturePickerValue) => void;
  onFromActivity: () => void;
}

/** A step's own picture: camera, photo, paste or emoji, or copy one from an activity. */
export function StepPictureSheet({ initial, name, onDone, onFromActivity }: StepPictureSheetProps) {
  const [value, setValue] = useState(initial);
  return (
    <div className={styles.sheet}>
      <PicturePicker value={value} onChange={setValue} name={name} />
      <Button variant="ghost" onClick={onFromActivity}>
        Use an activity&apos;s picture
      </Button>
      <BigButton variant="primary" fullWidth onClick={() => onDone(value)}>
        Done
      </BigButton>
    </div>
  );
}
