'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { MoodEvent } from '@chipperly/shared/schemas/mood';
import { db } from '../db/db';
import { newId } from '../ids';
import { now } from '../clock';
import { upsert } from '../sync/mutate';

export const MOOD_MIN = -5;
export const MOOD_MAX = 5;

/** Beta's `pi` table (audio-snippet.js): nearest level wins, ties keep the earlier (more negative) entry. */
const EMOJI_LEVELS: readonly { at: number; emoji: string }[] = [
  { at: -5, emoji: '😢' },
  { at: -3, emoji: '😟' },
  { at: -1, emoji: '😐' },
  { at: 0, emoji: '😐' },
  { at: 1, emoji: '🙂' },
  { at: 3, emoji: '😊' },
  { at: 5, emoji: '😄' },
];

export function levelEmoji(level: number): string {
  let best = EMOJI_LEVELS[0]!;
  for (const entry of EMOJI_LEVELS) {
    if (Math.abs(entry.at - level) < Math.abs(best.at - level)) best = entry;
  }
  return best.emoji;
}

function newestOf(events: readonly MoodEvent[]): MoodEvent | undefined {
  return events.reduce<MoodEvent | undefined>((newest, e) => (!newest || e.created_at > newest.created_at ? e : newest), undefined);
}

/** The day's level: `level_after` of its newest event, or 0 with none. */
function levelForDay(events: readonly MoodEvent[]): number {
  return newestOf(events)?.level_after ?? 0;
}

export interface DayMoodSummary {
  date: string;
  level: number;
  emoji: string;
  plus: number;
  minus: number;
}

/** Pure: groups active events by day, newest day first. */
export function dayHistory(events: readonly MoodEvent[]): DayMoodSummary[] {
  const byDate = new Map<string, MoodEvent[]>();
  for (const event of events) {
    if (event.deleted_at !== null) continue;
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }

  const days: DayMoodSummary[] = [];
  for (const [date, dayEvents] of byDate) {
    const level = levelForDay(dayEvents);
    days.push({
      date,
      level,
      emoji: levelEmoji(level),
      plus: dayEvents.filter((e) => e.delta > 0).length,
      minus: dayEvents.filter((e) => e.delta < 0).length,
    });
  }
  return days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function useMoodLevel(profileId: string, isoDate: string): number {
  const events = useLiveQuery(
    () => db.mood_events.where('[profile_id+date]').equals([profileId, isoDate]).toArray(),
    [profileId, isoDate],
    [],
  );
  return useMemo(() => levelForDay(events.filter((e) => e.deleted_at === null)), [events]);
}

export function useMoodHistory(profileId: string): DayMoodSummary[] {
  const events = useLiveQuery(() => db.mood_events.where('profile_id').equals(profileId).toArray(), [profileId], []);
  return useMemo(() => dayHistory(events), [events]);
}

/** Appends one event; `delta` is derived from the day's current level to `nextLevel`, both clamped to -5..5. */
export async function setMood(profileId: string, isoDate: string, nextLevel: number, userId: string): Promise<void> {
  const clamped = Math.max(MOOD_MIN, Math.min(MOOD_MAX, Math.round(nextLevel)));
  const events = await db.mood_events.where('[profile_id+date]').equals([profileId, isoDate]).toArray();
  const current = levelForDay(events.filter((e) => e.deleted_at === null));
  const delta = Math.max(-10, Math.min(10, clamped - current));
  if (delta === 0) return;

  const row: MoodEvent = {
    id: newId(),
    profile_id: profileId,
    version: 0,
    client_updated_at: now(),
    updated_by: userId,
    deleted_at: null,
    date: isoDate,
    delta,
    level_after: clamped,
    created_at: now(),
    created_by: userId,
  };
  await upsert('mood_events', row);
}
