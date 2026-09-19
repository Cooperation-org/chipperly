'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DayPlan } from '@chipperly/shared/schemas/schedule';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert, softDelete } from '../sync/mutate';

/**
 * Pure: the newest live (non-deleted) row for a date, by `client_updated_at`
 * -- the tie-break the schema comment promises ("if two devices created one
 * offline the client shows the newest").
 */
export function newestDayPlan(rows: readonly DayPlan[]): DayPlan | undefined {
  return rows
    .filter((row) => row.deleted_at === null)
    .reduce<DayPlan | undefined>((newest, row) => (!newest || row.client_updated_at > newest.client_updated_at ? row : newest), undefined);
}

export function useDayNote(profileId: string, isoDate: string): DayPlan | null {
  const rows = useLiveQuery(
    () => db.day_plans.where('[profile_id+date]').equals([profileId, isoDate]).toArray(),
    [profileId, isoDate],
    [],
  );
  return useMemo(() => newestDayPlan(rows) ?? null, [rows]);
}

/** Upserts the day's note, creating the row on first write. An empty (or whitespace-only) note soft-deletes it. */
export async function setDayNote(profileId: string, isoDate: string, note: string): Promise<void> {
  const rows = await db.day_plans.where('[profile_id+date]').equals([profileId, isoDate]).toArray();
  const existing = newestDayPlan(rows);
  const trimmed = note.trim();

  if (!existing) {
    if (!trimmed) return;
    await upsert('day_plans', {
      id: newId(),
      profile_id: profileId,
      version: 0,
      client_updated_at: now(),
      updated_by: '',
      deleted_at: null,
      date: isoDate,
      note: trimmed,
    } satisfies DayPlan);
    return;
  }

  if (!trimmed) {
    await softDelete('day_plans', existing.id);
    return;
  }

  await upsert('day_plans', { ...existing, note: trimmed });
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "19 September" -- pairs with `weekdayName` (todayModel.ts) for the S32 day bands' "Friday 19 September". */
export function formatDayMonth(isoDate: string): string {
  const [, monthStr, dayStr] = isoDate.split('-');
  const month = Number(monthStr);
  const day = Number(dayStr);
  return `${day} ${MONTH_NAMES[month - 1] ?? ''}`;
}
