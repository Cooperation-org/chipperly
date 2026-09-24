'use client';

import { useRouter } from 'next/navigation';
import { startSync } from '@/lib/sync/engine';
import { DeviceRolePicker } from './DeviceRolePicker';
import styles from './KindPicker.module.css';

/** Asked once on a phone or tablet right after signing in or setting up. */
export function DeviceRoleStep() {
  const router = useRouter();
  return (
    <div>
      <h1 className={styles.title}>Who uses this device?</h1>
      <p className={styles.subtitle}>You can change this later in Settings.</p>
      <DeviceRolePicker
        onDone={(role) => {
          startSync();
          router.push(role.kind === 'caregiver' ? '/today/' : '/child/');
        }}
      />
    </div>
  );
}
