'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Picture } from '@/components/media/Picture';
import { Icon } from '@/components/ui/Icon';
import { pickAndStoreImage } from '@/lib/data/media';
import { saveImageCredit } from '@/lib/data/imageCredits';
import { importImage, imageSearchEnabled, type ImageResult } from '@/lib/imageSearch';
import { useActiveProfile } from '@/lib/profile/active';
import { toast } from '@/lib/toast';
import type { ImageCredit } from '@chipperly/shared/schemas/profile';
import { EmojiGrid } from './EmojiGrid';
import { ImageSearchPanel } from './ImageSearchPanel';
import { firstImageFile, isTextEntryTarget } from './clipboardImage';
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
  /** Start with the emoji grid already open. Off by default: the grid is opened by tapping Emoji. */
  defaultEmojiOpen?: boolean;
}

/** Mounted pickers, newest last: a paste goes to the newest only (a sheet opened over a form, two pickers on one page). */
const mountedPickers: object[] = [];

/** Emoji / photo / camera / paste, in that order (plus Ctrl+V and a search link), per the global picture pattern. */
export function PicturePicker({ value, onChange, name, choices, defaultEmojiOpen = false }: PicturePickerProps) {
  // Collapsed everywhere (owner, 30 Sept): 96 cells buried whatever came after them,
  // so the grid opens on tapping Emoji. Emoji is still the default picture choice —
  // it never fails offline and asks for no permission — it just isn't shown unasked.
  const [emojiOpen, setEmojiOpen] = useState(defaultEmojiOpen);
  const [message, setMessage] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [credit, setCredit] = useState<ImageCredit | null>(null);
  // Credits live on the profile's settings, so the search needs one to exist (not the first-profile form).
  const { profile } = useActiveProfile();
  const pickerRef = useRef<HTMLDivElement>(null);
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

  // The server says whether image search is set up; cached per session, false offline and for guests.
  useEffect(() => {
    let alive = true;
    void imageSearchEnabled().then((on) => alive && setSearchEnabled(on));
    return () => {
      alive = false;
    };
  }, []);

  async function storeFile(file: File | Blob, found: ImageCredit | null = null) {
    try {
      const photo_id = await pickAndStoreImage(file);
      if (found && profile) await saveImageCredit(profile.id, photo_id, found);
      onChange({ emoji: value.emoji ?? null, photo_id });
      setCredit(found);
      setMessage('Picture added.');
    } catch {
      setMessage(null);
      toast("Couldn't add that photo. Try again.");
    }
  }

  // Ctrl+V / Cmd+V / long-press paste. The handler is re-made each render, so keep the
  // latest in a ref and attach the document listener once.
  const storeRef = useRef(storeFile);
  useEffect(() => {
    storeRef.current = storeFile;
  });
  useEffect(() => {
    const me = {};
    mountedPickers.push(me);
    function onDocumentPaste(e: ClipboardEvent) {
      if (mountedPickers[mountedPickers.length - 1] !== me) return;
      // Hidden pickers (closed sheets, other tabs) must not swallow the paste.
      if (!pickerRef.current || pickerRef.current.getClientRects().length === 0) return;
      if (isTextEntryTarget(e.target as HTMLElement | null)) return;
      const file = firstImageFile(e.clipboardData?.items);
      if (!file) return;
      e.preventDefault();
      setMessage(null);
      void storeRef.current(file);
    }
    document.addEventListener('paste', onDocumentPaste);
    return () => {
      document.removeEventListener('paste', onDocumentPaste);
      mountedPickers.splice(mountedPickers.indexOf(me), 1);
    };
  }, []);

  async function onPickFound(result: ImageResult) {
    const { file, credit: found } = await importImage(result.id);
    setSearchOpen(false);
    await storeFile(file, found ?? { text: result.attribution, url: result.landing_url });
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await storeFile(file);
  }

  async function onPaste() {
    setMessage(null);
    if (!navigator.clipboard?.read) {
      setMessage("This browser can't paste images here. Save the image and use Photo instead.");
      return;
    }
    setPasting(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          await storeFile(await item.getType(type));
          return;
        }
      }
      setMessage("There's no image on the clipboard. Copy an image first, then tap Paste.");
    } catch {
      setMessage(
        'Copy an image first, then tap Paste. If your browser asks, choose Allow. You can also press Ctrl+V (Cmd+V on Mac).',
      );
    } finally {
      setPasting(false);
    }
  }

  const query = name?.trim();
  const searchUrl = `https://duckduckgo.com/?${query ? `q=${encodeURIComponent(query)}&` : ''}iax=images&ia=images`;

  return (
    <div ref={pickerRef} className={styles.picker}>
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
          <Icon name="smiley" size={20} />
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
        <button type="button" className={styles.choice} onClick={onPaste} disabled={pasting}>
          <Icon name="clipboard" size={20} />
          Paste
        </button>
        {searchEnabled && profile ? (
          <button
            type="button"
            className={styles.choice}
            onClick={() => setSearchOpen((open) => !open)}
            aria-expanded={searchOpen}
          >
            <Icon name="search" size={20} />
            Search images
          </button>
        ) : null}
      </div>
      <p className={styles.hint}>Tip: copy an image from any website, then tap Paste.</p>
      <a className={styles.findLink} href={searchUrl} target="_blank" rel="noopener noreferrer">
        Find an image online
      </a>
      {searchOpen ? <ImageSearchPanel initialQuery={query ?? ''} onPick={onPickFound} /> : null}
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
        <div id={gridId} ref={gridRef} className={styles.gridWrap}>
          <EmojiGrid
            value={value.emoji}
            choices={choices}
            onChange={(emoji) => {
              opened.current = true;
              onChange({ emoji, photo_id: null });
              setCredit(null);
              setEmojiOpen(false);
            }}
          />
        </div>
      ) : null}
      {pasting || message ? (
        <p className={styles.message} role="status">
          {pasting ? 'Waiting for permission...' : message}
        </p>
      ) : null}
      {credit && value.photo_id ? <p className={styles.credit}>{credit.text}</p> : null}
      {value.photo_id ? (
        <button
          type="button"
          className={styles.remove}
          onClick={() => {
            onChange({ ...value, photo_id: null });
            setCredit(null);
          }}
        >
          Remove photo
        </button>
      ) : null}
    </div>
  );
}
