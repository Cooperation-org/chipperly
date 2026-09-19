'use client';

import type { ReactNode } from 'react';
import styles from './ListRow.module.css';

export interface ListRowProps {
  /** Drag handle slot, e.g. an <Icon name="drag"/>; the caller attaches its own drag listeners. */
  handle?: ReactNode;
  tile: ReactNode;
  name: string;
  /** Usually a string; a schedule row also passes a fragment with a trailing icon (S6 "has a story" mark). */
  secondary?: ReactNode;
  /** Trailing control, e.g. a CheckCircle. Excluded from the row's own tap target. */
  trailing?: ReactNode;
  dimmed?: boolean;
  onTap?: () => void;
  className?: string;
  /** Forwarded to the inner `<button>` (S21: current-profile row). */
  ariaCurrent?: boolean | 'page';
}

/** A picture, name and secondary text row. The whole row is tappable except `handle` and `trailing`. */
export function ListRow({
  handle,
  tile,
  name,
  secondary,
  trailing,
  dimmed,
  onTap,
  className,
  ariaCurrent,
}: ListRowProps) {
  return (
    <div className={[styles.row, dimmed ? styles.dimmed : '', className].filter(Boolean).join(' ')}>
      {handle ? <span className={styles.handle}>{handle}</span> : null}
      {onTap ? (
        <button type="button" className={styles.main} onClick={onTap} aria-current={ariaCurrent}>
          <RowContent tile={tile} name={name} secondary={secondary} />
        </button>
      ) : (
        <div className={styles.main} aria-current={ariaCurrent}>
          <RowContent tile={tile} name={name} secondary={secondary} />
        </div>
      )}
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </div>
  );
}

function RowContent({ tile, name, secondary }: { tile: ReactNode; name: string; secondary?: ReactNode }) {
  return (
    <>
      <span className={styles.tile}>{tile}</span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        {secondary ? <span className={styles.secondary}>{secondary}</span> : null}
      </span>
    </>
  );
}
