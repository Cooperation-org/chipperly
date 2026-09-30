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

/** Pure: a day note is worth keeping if it has text or a picture. */
export function hasDayNoteContent(note: string, photoId: string | null): boolean {
  return note.trim() !== '' || photoId !== null;
}

/** Pure: the picture's text alternative is the note text; a picture-only note gets a plain fallback. */
export function dayNotePhotoAlt(note: string): string {
  return note.trim() || 'Picture for the day';
}

/**
 * Upserts the day's note, creating the row on first write. A note with no text
 * and no picture soft-deletes it. `photoId` is a local media id: saving never
 * waits on its upload (pickAndStoreImage already queued it).
 */
export async function setDayNote(profileId: string, isoDate: string, note: string, photoId: string | null = null): Promise<void> {
  const rows = await db.day_plans.where('[profile_id+date]').equals([profileId, isoDate]).toArray();
  const existing = newestDayPlan(rows);
  const trimmed = note.trim();
  const keep = hasDayNoteContent(note, photoId);

  if (!existing) {
    if (!keep) return;
    await upsert('day_plans', {
      id: newId(),
      profile_id: profileId,
      version: 0,
      client_updated_at: now(),
      updated_by: '',
      deleted_at: null,
      date: isoDate,
      note: trimmed,
      photo_id: photoId,
    } satisfies DayPlan);
    return;
  }

  if (!keep) {
    await softDelete('day_plans', existing.id);
    return;
  }

  await upsert('day_plans', { ...existing, note: trimmed, photo_id: photoId });
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
