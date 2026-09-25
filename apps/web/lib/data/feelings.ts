'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { valueForFeeling, type AttitudeCheck, type AttitudeKind, type Feeling } from '@chipperly/shared/schemas/attitude';
import type { MoodEvent } from '@chipperly/shared/schemas/mood';
import { todayIso } from '@chipperly/shared/helpers/date';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert } from '../sync/mutate';
import { getCurrentUserId } from './_util';

/** The five faces, 1 (very upset) to 5 (great). The label is the button's name for screen readers and the team's history. */
export const FEELINGS: readonly { feeling: Feeling; emoji: string; label: string }[] = [
  { feeling: 1, emoji: '😢', label: 'Very upset' },
  { feeling: 2, emoji: '🙁', label: 'A bit upset' },
  { feeling: 3, emoji: '😐', label: 'Okay' },
  { feeling: 4, emoji: '🙂', label: 'Good' },
  { feeling: 5, emoji: '😄', label: 'Great' },
];

export function faceFor(feeling: number): { emoji: string; label: string } {
  return FEELINGS.find((f) => f.feeling === feeling) ?? { emoji: '😐', label: 'Okay' };
}

/** Rows from before the five faces only have good/grumpy: read them as Good (4) and A bit upset (2). */
export function feelingOf(check: Pick<AttitudeCheck, 'feeling' | 'value'>): Feeling {
  return check.feeling ?? (check.value === 'good' ? 4 : 2);
}

export async function recordFeeling(
  profileId: string,
  entry: { feeling: Feeling; kind: AttitudeKind; itemId?: string | null; note?: string | null },
): Promise<void> {
  const created_by = await getCurrentUserId();
  await upsert('attitude_checks', {
    id: newId(),
    profile_id: profileId,
    version: 0,
    client_updated_at: now(),
    updated_by: created_by,
    deleted_at: null,
    schedule_item_id: entry.itemId ?? null,
    value: valueForFeeling(entry.feeling),
    feeling: entry.feeling,
    kind: entry.kind,
    note: entry.note?.trim() || null,
    created_at: now(),
    created_by,
  } satisfies AttitudeCheck);
}

/** One line of a day's feelings timeline: a face (after a task, a moment, a check-up) or a Chipper Chart tap. */
export type TimelineEntry =
  | { type: 'feeling'; at: number; check: AttitudeCheck; feeling: Feeling }
  | { type: 'mood'; at: number; event: MoodEvent };

export interface FeelingsDay {
  date: string;
  entries: TimelineEntry[];
  /** Mean of the day's faces, null with none. */
  average: number | null;
  /** Chipper Chart level at the end of the day, null with no taps. */
  moodLevel: number | null;
}

/** Pure: groups faces and mood taps by day, newest day first, each day oldest entry first. */
export function feelingsByDay(checks: readonly AttitudeCheck[], moods: readonly MoodEvent[]): FeelingsDay[] {
  const days = new Map<string, FeelingsDay>();
  const dayFor = (date: string) => {
    let day = days.get(date);
    if (!day) {
      day = { date, entries: [], average: null, moodLevel: null };
      days.set(date, day);
    }
    return day;
  };
  for (const check of checks) {
    if (check.deleted_at !== null) continue;
    dayFor(todayIso(new Date(check.created_at))).entries.push({ type: 'feeling', at: check.created_at, check, feeling: feelingOf(check) });
  }
  for (const event of moods) {
    if (event.deleted_at !== null) continue;
    dayFor(event.date).entries.push({ type: 'mood', at: event.created_at, event });
  }
  for (const day of days.values()) {
    day.entries.sort((a, b) => a.at - b.at);
    const faces = day.entries.flatMap((e) => (e.type === 'feeling' ? [e.feeling] : []));
    day.average = faces.length > 0 ? faces.reduce((sum, f) => sum + f, 0) / faces.length : null;
    const lastMood = day.entries.filter((e) => e.type === 'mood').at(-1);
    day.moodLevel = lastMood?.type === 'mood' ? lastMood.event.level_after : null;
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function useFeelingsByDay(profileId: string): FeelingsDay[] {
  const checks = useLiveQuery(() => db.attitude_checks.where('profile_id').equals(profileId).toArray(), [profileId], []);
  const moods = useLiveQuery(() => db.mood_events.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(() => feelingsByDay(checks, moods), [checks, moods]);
}
