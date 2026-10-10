'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db';
import { isHintKey } from '@/lib/hints';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { GUIDE_INTRO, GUIDE_SECTIONS } from './guideContent';
import styles from './GuideScreen.module.css';

/**
 * The how-to guide: one <details> per section, content from guideContent.ts.
 * `embedded` is the copy shown in a sheet over the last setup screen: no links into the app, which is not entered yet.
 */
export function GuideScreen({ embedded = false }: { embedded?: boolean }) {
  // "More tips" links arrive as /settings/guide/#id: open that section and scroll to it.
  useEffect(() => {
    const section = document.getElementById(window.location.hash.slice(1));
    if (!(section instanceof HTMLDetailsElement)) return;
    section.open = true;
    section.scrollIntoView();
  }, []);

  async function showTipsAgain(): Promise<void> {
    const keys = (await db.kv.toCollection().primaryKeys()).filter((k) => isHintKey(String(k)));
    await db.kv.bulkDelete(keys);
    toast('Tips will show again');
  }

  return (
    <div className={styles.page}>
      <p className={styles.intro}>{GUIDE_INTRO}</p>

      {GUIDE_SECTIONS.map((s) => (
        <details
          key={s.id}
          id={s.id}
          className={styles.section}
        >
          <summary className={styles.summary}>{s.title}</summary>
          <div className={styles.content}>
            {s.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {s.bullets ? (
              <ul>
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            {s.example ? (
              <figure className={styles.example}>
                <figcaption>Example: {s.example.title}</figcaption>
                <ol>
                  {s.example.pages.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              </figure>
            ) : null}
            {s.action && !embedded ? (
              <Link className={styles.action} href={s.action.href}>
                {s.action.label}
              </Link>
            ) : null}
          </div>
        </details>
      ))}

      {embedded ? null : (
        <Button variant="secondary" onClick={() => void showTipsAgain()}>
          Show tips again
        </Button>
      )}
    </div>
  );
}
