'use client';

import type { ReactNode } from 'react';
import { ListRow } from './ListRow';
import { CheckCircle } from './CheckCircle';
import styles from './StepRow.module.css';

export interface StepRowProps {
  tile: ReactNode;
  name: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

/** A step inside an expanded activity: an indented ListRow with no handle, its own CheckCircle. */
export function StepRow({ tile, name, checked, onChange }: StepRowProps) {
  return (
    <div className={styles.indent}>
      <ListRow tile={tile} name={name} dimmed={checked} trailing={<CheckCircle checked={checked} onChange={onChange} name={name} />} />
    </div>
  );
}
