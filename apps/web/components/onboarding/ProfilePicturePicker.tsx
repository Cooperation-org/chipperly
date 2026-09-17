'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { AVATAR_EMOJI } from '@chipperly/shared/constants/emoji';
import { Picture } from '@/components/media/Picture';
import { EmojiGrid } from '@/components/picture/EmojiGrid';
import type { PicturePickerValue } from '@/components/picture/PicturePicker';
import { Icon } from '@/components/ui/Icon';
import { pickAndStoreImage } from '@/lib/data/media';
import styles from './ProfilePicturePicker.module.css';

export interface ProfilePicturePickerProps {
  value: PicturePickerValue;
  onChange: (next: PicturePickerValue) => void;
  name: string;
}

/**
 * S4's picture control: an emoji grid restricted to the 24 AVATAR_EMOJI plus
 * "Use a photo instead" (ux-plan.md S4). components/picture/PicturePicker.tsx
 * always shows the full 96-emoji EMOJI_CHOICES with no way to restrict them
 * (see report: sharedFileChanges), so this composes EmojiGrid directly
 * instead of wrapping that component.
 */
export function ProfilePicturePicker({ value, onChange, name }: ProfilePicturePickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFileChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const photo_id = await pickAndStoreImage(file);
      onChange({ emoji: value.emoji ?? null, photo_id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.picker}>
      <Picture emoji={value.emoji} photo_id={value.photo_id} name={name || 'Picture'} size="grid" />
      <EmojiGrid choices={AVATAR_EMOJI} value={value.emoji} onChange={(emoji) => onChange({ emoji, photo_id: null })} />
      <button
        type="button"
        className={styles.photoButton}
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
      >
        <Icon name="camera" size={20} />
        {busy ? 'Adding photo…' : 'Use a photo instead'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        tabIndex={-1}
        onChange={(e) => void onFileChange(e)}
      />
    </div>
  );
}
