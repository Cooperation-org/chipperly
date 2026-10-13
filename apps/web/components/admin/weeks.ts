/** Sign-ups in the last 7 days of a day-by-day series (oldest first), and in the 7 before. */
export function weekOverWeek(byDay: ReadonlyArray<{ count: number }>): { thisWeek: number; lastWeek: number } {
  const sum = (rows: ReadonlyArray<{ count: number }>) => rows.reduce((n, d) => n + d.count, 0);
  return { thisWeek: sum(byDay.slice(-7)), lastWeek: sum(byDay.slice(-14, -7)) };
}
