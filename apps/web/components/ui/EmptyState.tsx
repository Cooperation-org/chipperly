import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** Usually a PictureTile or an Icon; kept as a slot so any picture works. */
  picture?: ReactNode;
  sentence: string;
  /** Up to 3 Button/BigButton elements; extras are ignored. */
  actions?: ReactNode[];
}

/** A picture, one sentence, up to three buttons. Never a paragraph. */
export function EmptyState({ picture, sentence, actions }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      {picture ? <div className={styles.picture}>{picture}</div> : null}
      <p className={styles.sentence}>{sentence}</p>
      {actions && actions.length > 0 ? <div className={styles.actions}>{actions.slice(0, 3)}</div> : null}
    </div>
  );
}
