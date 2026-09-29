'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { pickAndStoreImage } from '@/lib/data/media';
import { toast } from '@/lib/toast';
import { EmojiGrid } from './EmojiGrid';
import styles from './PicturePicker.module.css';

export interface PicturePickerValue {
  emoji?: string | null;
  photo_id?: string | null;
}

export interface PicturePickerProps {
  value: PicturePickerValue;
  onChange: (next: PicturePickerValue) => void;
  name?: string;
  /** Restricts the emoji grid, e.g. AVATAR_EMOJI for profile pictures. Defaults to the full set. */
  choices?: readonly string[];
  /** Start collapsed, showing only the trigger. Defaults to open (the global picture pattern). */
  defaultEmojiOpen?: boolean;
}

/** Emoji / photo / camera / paste, in that order, per the global picture pattern. */
export function PicturePicker({ value, onChange, name, choices, defaultEmojiOpen = true }: PicturePickerProps) {
  // Emoji grid is open by default: it's the default picture choice (never fails
  // offline, no permission prompt), per ux-plan.md's global picture pattern.
  // Long forms (the story editor) pass false so the 96-cell grid doesn't bury the rest.
  const [emojiOpen, setEmojiOpen] = useState(defaultEmojiOpen);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridId = useId();
  // Only move focus once the person has actually used the trigger, so a picker
  // that renders open doesn't steal focus from the top of the form on mount.
  const opened = useRef(false);

  useEffect(() => {
    if (!opened.current) return;
    if (!emojiOpen) {
      emojiButtonRef.current?.focus();
      return;
    }
    const grid = gridRef.current;
    const cell =
      grid?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]') ??
      grid?.querySelector<HTMLButtonElement>('[role="radio"]');
    cell?.focus();
  }, [emojiOpen]);

  async function storeFile(file: File | Blob) {
    try {
      const photo_id = await pickAndStoreImage(file);
      onChange({ emoji: value.emoji ?? null, photo_id });
    } catch {
      toast("Couldn't add that photo. Try again.");
    }
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await storeFile(file);
  }

  async function onPaste() {
    setPasteMessage(null);
    if (!navigator.clipboard?.read) {
      setPasteMessage("Paste isn't supported on this device.");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          await storeFile(await item.getType(type));
          return;
        }
      }
      setPasteMessage('No image on the clipboard.');
    } catch {
      setPasteMessage("Couldn't read the clipboard.");
    }
  }

  return (
    <div className={styles.picker}>
      <Picture emoji={value.emoji} photo_id={value.photo_id} name={name ?? 'Picture'} size="grid" />
      <div className={styles.row}>
        <button
          ref={emojiButtonRef}
          type="button"
          className={styles.choice}
          onClick={() => {
            opened.current = true;
            setEmojiOpen((open) => !open);
          }}
          aria-expanded={emojiOpen}
          aria-controls={emojiOpen ? gridId : undefined}
        >
          <Icon name="image" size={20} />
          Emoji
        </button>
        <button type="button" className={styles.choice} onClick={() => photoInputRef.current?.click()}>
          <Icon name="image" size={20} />
          Photo
        </button>
        <button type="button" className={styles.choice} onClick={() => cameraInputRef.current?.click()}>
          <Icon name="camera" size={20} />
          Camera
        </button>
        <button type="button" className={styles.choice} onClick={onPaste}>
          <Icon name="image" size={20} />
          Paste
        </button>
      </div>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        tabIndex={-1}
        onChange={onFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hiddenInput}
        tabIndex={-1}
        onChange={onFileChange}
      />
      {emojiOpen ? (
        <div id={gridId} ref={gridRef}>
          <EmojiGrid
            value={value.emoji}
            choices={choices}
            onChange={(emoji) => {
              opened.current = true;
              onChange({ emoji, photo_id: null });
              setEmojiOpen(false);
            }}
          />
        </div>
      ) : null}
      {pasteMessage ? <p className={styles.message}>{pasteMessage}</p> : null}
      {value.photo_id ? (
        <button type="button" className={styles.remove} onClick={() => onChange({ ...value, photo_id: null })}>
          Remove photo
        </button>
      ) : null}
    </div>
  );
}
