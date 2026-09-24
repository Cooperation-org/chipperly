'use client';

import { useState } from 'react';
import { useActiveProfile } from '@/lib/profile/active';
import { setDeviceRole, usesApp, useDeviceRole, type DeviceRole } from '@/lib/device/role';
import { enterParentMode, exitParentMode } from '@/lib/device/settings';
import { Picture } from '@/components/media/Picture';
import { PictureTile } from '@/components/ui/PictureTile';
import { ListRow } from '@/components/ui/ListRow';
import { Icon } from '@/components/ui/Icon';
import styles from './DeviceRolePicker.module.css';

export interface DeviceRolePickerProps {
  /** Called once the choice is saved; the caller navigates (a caregiver to Today, a child to their view). */
  onDone: (role: DeviceRole) => void;
}

/** "Who uses this device?": me (a caregiver), or one of the children who use Chipperly themselves. */
export function DeviceRolePicker({ onDone }: DeviceRolePickerProps) {
  const { profiles, setActiveProfileId } = useActiveProfile();
  const current = useDeviceRole();
  const [busy, setBusy] = useState(false);
  const children = profiles.filter(usesApp);

  async function choose(role: DeviceRole): Promise<void> {
    if (busy) return;
    setBusy(true);
    await setDeviceRole(role);
    if (role.kind === 'child') {
      setActiveProfileId(role.profile_id);
      await exitParentMode();
    } else {
      await enterParentMode();
    }
    onDone(role);
  }

  const check = <Icon name="check" size={20} />;
  return (
    <div className={styles.list}>
      <ListRow
        tile={<PictureTile emoji="🧑" name="Me" size="list" />}
        name="Me, a caregiver"
        secondary="Opens to your screens. No child view, no PIN."
        trailing={current?.kind === 'caregiver' ? check : undefined}
        onTap={() => void choose({ kind: 'caregiver' })}
      />
      {children.map((p) => (
        <ListRow
          key={p.id}
          tile={<Picture emoji={p.avatar_emoji} photo_id={p.avatar_photo_id} name={p.name} size="list" />}
          name={`${p.name}'s device`}
          secondary={`Opens to ${p.name}'s view. Your screens need the PIN.`}
          trailing={current?.kind === 'child' && current.profile_id === p.id ? check : undefined}
          onTap={() => void choose({ kind: 'child', profile_id: p.id })}
        />
      ))}
    </div>
  );
}
