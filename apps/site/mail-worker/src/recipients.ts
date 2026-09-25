// Who gets a copy: the main destination plus every "Also forward to"
// address from /admin, lowercased and without duplicates.
export function pickRecipients(destination: string, extras: string[]): string[] {
  return [...new Set([destination, ...extras].map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))];
}

type Row = { id: number; local_part: string; enabled: number | null };

/** The row for this address, falling back to the catch-all ("*"). */
export function pickRow<T extends Row>(rows: T[], localPart: string): T | undefined {
  const lp = localPart.toLowerCase();
  const row = rows.find((r) => r.local_part === lp) ?? rows.find((r) => r.local_part === '*');
  return row && row.enabled !== 0 ? row : undefined;
}
