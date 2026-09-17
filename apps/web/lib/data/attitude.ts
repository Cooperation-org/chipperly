'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AttitudeCheck, AttitudeValue } from '@chipperly/shared/schemas/attitude';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert } from '../sync/mutate';
import { getCurrentUserId } from './_util';

export async function recordAttitude(profileId: string, itemId: string | null, value: AttitudeValue): Promise<void> {
  const created_by = await getCurrentUserId();
  await upsert('attitude_checks', {
    id: newId(),
    profile_id: profileId,
    version: 0,
    client_updated_at: now(),
    updated_by: created_by,
    deleted_at: null,
    schedule_item_id: itemId,
    value,
    created_at: now(),
    created_by,
  } satisfies AttitudeCheck);
}

export function useAttitudeHistory(profileId: string): AttitudeCheck[] {
  const rows = useLiveQuery(() => db.attitude_checks.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(
    () => rows.filter((row) => row.deleted_at === null).sort((a, b) => b.created_at - a.created_at),
    [rows],
  );
}
