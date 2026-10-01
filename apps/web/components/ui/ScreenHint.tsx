'use client';

import Link from 'next/link';
import { setKv, useKv, useKvLoaded } from '@/lib/db/kv';
import { useLock } from '@/lib/device/settings';
import { hintKey } from '@/lib/hints';
import styles from './ScreenHint.module.css';

export interface ScreenHintProps {
  /** Stable id; the dismissal is saved per device under `hint_dismissed:<id>`. */
  id: string;
  title: string;
  body: string;
  /** Guide section id ("More tips" opens it). */
  section: string;
}

/** A one-time tip at the top of a caregiver screen. Waits for the kv read so it never pops in over content, and stays out of a locked child device. */
export function ScreenHint({ id, title, body, section }: ScreenHintProps) {
  const key = hintKey(id);
  const loaded = useKvLoaded(key);
  const dismissed = useKv<boolean>(key, false);
  const { locked_profile_id } = useLock();
  if (!loaded || dismissed || locked_profile_id) return null;

  return (
    <aside className={styles.hint} aria-label="Tip">
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.dismiss} onClick={() => void setKv(key, true)}>
          Got it
        </button>
        <Link className={styles.more} href={`/settings/guide/#${section}`}>
          More tips
        </Link>
      </div>
    </aside>
  );
}
