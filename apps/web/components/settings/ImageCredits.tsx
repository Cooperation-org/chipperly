'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { Picture } from '@/components/media/Picture';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { db } from '@/lib/db/db';
import { creditsInUse } from '@/lib/imageSearch';
import { useActiveProfile } from '@/lib/profile/active';
import styles from './ImageCredits.module.css';

/** Settings > Image credits: who made each openly licensed picture this profile uses, with a link back to it. */
export function ImageCredits() {
  const { profile } = useActiveProfile();
  const credits = profile?.settings.image_credits;
  // Scan every table but the blobs for the picture ids, the same way the unused-photo cleanup does.
  const used = useLiveQuery(
    async () => {
      const rows: unknown[] = [];
      for (const table of db.tables) if (table.name !== 'media_blobs') rows.push(...(await table.toArray()));
      return creditsInUse(credits, rows);
    },
    [credits],
    undefined,
  );

  if (!used) return null;
  if (used.length === 0) {
    return (
      <EmptyState
        picture={<Icon name="image" size={48} />}
        sentence="No credits yet. Pictures found with Search images show here, with where they came from."
      />
    );
  }
  return (
    <ul className={styles.list}>
      {used.map((c) => (
        <li key={c.media_id} className={styles.item}>
          <Picture photo_id={c.media_id} name="Credited picture" size="list" />
          <div className={styles.text}>
            <p className={styles.credit}>{c.text}</p>
            {c.url ? (
              <a className={styles.link} href={c.url} target="_blank" rel="noopener noreferrer">
                View the original
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
