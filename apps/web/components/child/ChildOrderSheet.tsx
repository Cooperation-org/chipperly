'use client';

import { useState } from 'react';
import { reorder, type DayItem } from '@/lib/data/schedule';
import { Picture } from '@/components/media/Picture';
import { BigButton } from '@/components/ui/BigButton';
import { IconButton } from '@/components/ui/IconButton';
import { useSheet } from '@/components/ui/Sheet';
import styles from './ChildOrderSheet.module.css';

export interface ChildOrderSheetProps {
  profileId: string;
  isoDate: string;
  dayItems: readonly DayItem[];
}

/** The child puts today's tasks in their own order (profile setting child_reorders): big pictures, up and down. */
export function ChildOrderSheet({ profileId, isoDate, dayItems }: ChildOrderSheetProps) {
  const { close } = useSheet();
  const [order, setOrder] = useState(() => dayItems.map((d) => d.item.id));
  const byId = new Map(dayItems.map((d) => [d.item.id, d]));

  function move(index: number, by: -1 | 1): void {
    setOrder((prev) => {
      const next = [...prev];
      const [picked] = next.splice(index, 1);
      if (picked === undefined) return prev;
      next.splice(index + by, 0, picked);
      return next;
    });
  }

  async function done(): Promise<void> {
    await reorder(profileId, isoDate, order);
    close();
  }

  return (
    <div className={styles.sheet}>
      <ol className={styles.list}>
        {order.map((id, i) => {
          const day = byId.get(id);
          if (!day) return null;
          const name = day.activity.name;
          return (
            <li key={id} className={styles.row}>
              <Picture emoji={day.activity.emoji} photo_id={day.activity.photo_id} name={name} size="list" />
              <span className={styles.name}>{name}</span>
              <IconButton icon="chevron" aria-label={`Move ${name} up`} className={styles.up} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton
                icon="chevron"
                aria-label={`Move ${name} down`}
                className={styles.down}
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              />
            </li>
          );
        })}
      </ol>
      <BigButton variant="primary" fullWidth onClick={() => void done()}>
        Done
      </BigButton>
    </div>
  );
}
