import { weekday } from '@chipperly/shared/helpers/date';
import type { DayItem } from '@/lib/data/schedule';

export interface PartOfDayGroup {
  /** null renders no header (items with no part of day, or the whole list when nothing is grouped). */
  header: string | null;
  items: DayItem[];
}

const PART_OF_DAY_LABELS = { morning: 'MORNING', afternoon: 'AFTERNOON', evening: 'EVENING' } as const;
const PART_OF_DAY_ORDER = ['morning', 'afternoon', 'evening'] as const;

/**
 * S6: group headers only when at least one item has a part of day.
 * Items without one lead, then morning/afternoon/evening, each only if non-empty.
 */
export function groupByPartOfDay(items: readonly DayItem[]): PartOfDayGroup[] {
  if (!items.some((day) => day.item.part_of_day !== null)) {
    return items.length > 0 ? [{ header: null, items: [...items] }] : [];
  }

  const groups: PartOfDayGroup[] = [];
  const none = items.filter((day) => day.item.part_of_day === null);
  if (none.length > 0) groups.push({ header: null, items: none });

  for (const key of PART_OF_DAY_ORDER) {
    const group = items.filter((day) => day.item.part_of_day === key);
    if (group.length > 0) groups.push({ header: PART_OF_DAY_LABELS[key], items: group });
  }
  return groups;
}

/** HH:MM (24h) -> "8:00 AM", for the row secondary text. */
export function formatTime(hhmm: string): string {
  const [hourStr, minute] = hhmm.split(':');
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${period}`;
}

/** S6 row secondary text: start time, else step count, else nothing. */
export function secondaryText(day: DayItem): string | undefined {
  if (day.item.start_time) return formatTime(day.item.start_time);
  if (day.steps.length > 0) return `${day.steps.length} step${day.steps.length === 1 ? '' : 's'}`;
  return undefined;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Full weekday name for an isoDate, for "Add to Wednesday" / empty-state copy. */
export function weekdayName(isoDate: string): string {
  return WEEKDAY_NAMES[weekday(isoDate)] ?? '';
}

/** Every item complete; false for an empty day (nothing to celebrate yet). */
export function allDone(items: readonly DayItem[]): boolean {
  return items.length > 0 && items.every((day) => day.item.completed_at !== null);
}

/** Pure array move for drag/keyboard reorder: pulls `from` out, reinserts at `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return [...items];
  const clampedTo = Math.max(0, Math.min(to, items.length - 1));
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(clampedTo, 0, moved as T);
  return next;
}
