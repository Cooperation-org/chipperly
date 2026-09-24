import { Switch } from '@/components/ui/Switch';
import styles from './UsesAppSwitch.module.css';

export interface UsesAppSwitchProps {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** "Will they use Chipperly themselves?" Off: the app is only for the adults with this child (no child view, lock or rewards they redeem). */
export function UsesAppSwitch({ name, checked, onChange }: UsesAppSwitchProps) {
  const who = name.trim() || 'They';
  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <span className={styles.label}>{who} will use Chipperly too</span>
        <Switch label="Uses Chipperly themselves" checked={checked} onChange={onChange} />
      </div>
      <p className={styles.hint}>
        {checked
          ? 'Their own picture schedule, chips and rewards, on your device or theirs.'
          : 'Chipperly is only for the adults with them: no child view, lock or rewards they redeem.'}
      </p>
    </div>
  );
}
