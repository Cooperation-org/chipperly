'use client';

import { useState } from 'react';
import type { AccountMemberProfile, LocationNotifyMode } from '@chipperly/shared/schemas/account';
import { BigButton } from '@/components/ui/BigButton';
import { Segmented } from '@/components/ui/Segmented';
import { useSheet } from '@/components/ui/Sheet';
import { useLocations } from '@/lib/data/locations';
import { api } from '@/lib/api/client';
import styles from './CareTeamScreen.module.css';

export interface EditMemberLocationSheetProps {
  accountId: string;
  userId: string;
  memberName: string;
  profileId: string;
  profileName: string;
  current: AccountMemberProfile;
  onSaved: () => void;
}

const NONE = 'none';

/** Assigns a care-team member a location for one profile, and whether a location-change push notifies them about just that location or any change. */
export function EditMemberLocationSheet({
  accountId,
  userId,
  memberName,
  profileId,
  profileName,
  current,
  onSaved,
}: EditMemberLocationSheetProps) {
  const { close } = useSheet();
  const locations = useLocations(profileId);
  const [locationId, setLocationId] = useState(current.assigned_location_id ?? NONE);
  const [mode, setMode] = useState<LocationNotifyMode>(current.location_notify_mode ?? 'linked');
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await api.patch(`/accounts/${accountId}/members/${userId}`, {
        assigned_location_id: locationId === NONE ? null : locationId,
        location_notify_mode: locationId === NONE ? null : mode,
      });
      onSaved();
      close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.editSheet}>
      <p className={styles.editIntro}>
        {memberName}&rsquo;s location for {profileName}, and when they get a push about it.
      </p>
      <Segmented
        label="Assigned location"
        value={locationId}
        onChange={setLocationId}
        items={[{ value: NONE, label: 'None' }, ...locations.map((l) => ({ value: l.id, label: l.name }))]}
      />
      {locationId !== NONE ? (
        <>
          <Segmented
            label="Notify"
            value={mode}
            onChange={(v) => setMode(v as LocationNotifyMode)}
            items={[
              { value: 'strict', label: 'Only this location' },
              { value: 'linked', label: 'Any location change' },
            ]}
          />
          <p className={styles.editHint}>
            {mode === 'strict'
              ? `${memberName} is notified only when ${profileName} arrives at or leaves this location.`
              : `${memberName} is notified about any of ${profileName}'s location changes.`}
          </p>
        </>
      ) : null}
      <BigButton fullWidth onClick={() => void save()} disabled={saving}>
        Save
      </BigButton>
    </div>
  );
}
