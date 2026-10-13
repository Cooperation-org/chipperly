'use client';

import { CheckCircle } from '@/components/ui/CheckCircle';
import { Icon } from '@/components/ui/Icon';
import { ListRow } from '@/components/ui/ListRow';
import type { Cluster } from '@/lib/org/roster';
import styles from './InviteSheet.module.css';

export interface GroupChecklistProps {
  groups: Cluster[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

/** Tick the groups (sites, teams, caseloads) a person covers. Everyone in a ticked group is theirs to see. */
export function GroupChecklist({ groups, selected, onToggle }: GroupChecklistProps) {
  return (
    <div>
      <span className={styles.label}>Groups they cover</span>
      <div className={styles.checklist}>
        {groups.map((g) => (
          <ListRow
            key={g.id}
            tile={<Icon name="users" size={20} />}
            name={g.name}
            secondary={`${g.profile_count} ${g.profile_count === 1 ? 'person' : 'people'}`}
            trailing={<CheckCircle checked={selected.has(g.id)} onChange={() => onToggle(g.id)} name={g.name} />}
            onTap={() => onToggle(g.id)}
          />
        ))}
      </div>
    </div>
  );
}
