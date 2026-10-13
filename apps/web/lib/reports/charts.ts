/** Pure helpers for the inline SVG charts and the people table on the report screens. */

/** Round a maximum up to 1, 2, 5 or 10 times a power of ten, so axis ends read cleanly. Never below 1. */
export function niceMax(max: number): number {
  if (!(max > 1)) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * pow >= max) return step * pow;
  return 10 * pow;
}

/** Height in px of `value` on a 0..max axis that is `height` px tall. */
export function scaleHeight(value: number, max: number, height: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(height, (value / max) * height);
}

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One bar per value across `width` px with `gap` px between bars; bars grow up from the bottom of `height`. */
export function barRects(values: number[], max: number, width: number, height: number, gap = 4): Bar[] {
  if (values.length === 0) return [];
  const bar = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  return values.map((v, i) => {
    const h = scaleHeight(v, max, height);
    return { x: i * (bar + gap), y: height - h, width: bar, height: h };
  });
}

/** x of the centre of slot `i` out of `n` equal slots; a line's points sit above its bars' centres. */
export function slotCentre(i: number, n: number, width: number): number {
  return n <= 0 ? 0 : ((i + 0.5) * width) / n;
}

/** SVG `points` for a line over `values`, one point per slot. */
export function linePoints(values: number[], max: number, width: number, height: number): string {
  return values.map((v, i) => `${round(slotCentre(i, values.length, width))},${round(height - scaleHeight(v, max, height))}`).join(' ');
}

/** Heights of stacked segments, bottom first; their sum never exceeds `height`. */
export function stackHeights(parts: number[], max: number, height: number): number[] {
  let used = 0;
  return parts.map((p) => {
    const h = Math.min(scaleHeight(p, max, height), height - used);
    used += h;
    return h;
  });
}

/** Which of `n` x-axis slots get a label so at most `maxLabels` show (always the last one). */
export function labelIndexes(n: number, maxLabels = 7): number[] {
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil(n / maxLabels);
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** "Mon" for a YYYY-MM-DD date. */
export function weekdayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' });
}

/** "13 Oct" for a YYYY-MM-DD date. */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** The label under a bar: a weekday for a week, the day of the month for a month. */
export function axisLabel(date: string, days: number): string {
  return days <= 7 ? weekdayLabel(date) : String(Number(date.slice(8)));
}

export type PeopleSortKey = 'name' | 'tasks_done' | 'chips_earned' | 'last_active';

interface SortableRow {
  name: string;
  tasks_done: number;
  chips_earned: number;
  last_active: number | null;
}

/** Sorted copy. Names ascending by default; numbers and last active largest (most recent) first. People who were never active go last. */
export function sortPeople<T extends SortableRow>(rows: T[], key: PeopleSortKey): T[] {
  const byName = (a: T, b: T): number => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return [...rows].sort((a, b) => {
    if (key === 'name') return byName(a, b);
    if (key === 'last_active') {
      if (a.last_active === null || b.last_active === null) return a.last_active === b.last_active ? byName(a, b) : a.last_active === null ? 1 : -1;
      return b.last_active - a.last_active || byName(a, b);
    }
    return b[key] - a[key] || byName(a, b);
  });
}

/** "Today", "Yesterday", "3 days ago", or "Never". `offset` is minutes behind UTC, like Date#getTimezoneOffset. */
export function lastActiveLabel(ms: number | null, now: number, offset: number): string {
  if (ms === null) return 'Never';
  const day = (t: number): number => Math.floor((t - offset * 60_000) / 86_400_000);
  const n = day(now) - day(ms);
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
}
