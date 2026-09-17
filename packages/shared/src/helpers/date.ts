/**
 * Local-date helpers. All of these read local date parts (`getFullYear` /
 * `getMonth` / `getDate`), never `toISOString` (UTC), so `todayIso()` gives
 * "today" for the device's own timezone, not UTC's.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function parseIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

export function addDays(iso: string, n: number): string {
  const { year, month, day } = parseIso(iso);
  const dt = new Date(year, month - 1, day);
  dt.setDate(dt.getDate() + n);
  return todayIso(dt);
}

/** 0 (Sunday) - 6 (Saturday), same as JS `Date.getDay()`. */
export function weekday(iso: string): number {
  const { year, month, day } = parseIso(iso);
  return new Date(year, month - 1, day).getDay();
}

export function isWeekend(iso: string): boolean {
  const wd = weekday(iso);
  return wd === 0 || wd === 6;
}

export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const today = todayIso(now);
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const { year, month, day } = parseIso(iso);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
