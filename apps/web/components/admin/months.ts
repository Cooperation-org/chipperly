/** The last 12 months as YYYY-MM, oldest first, ending with this month. */
export function lastMonths(now = new Date(), n = 12): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}
