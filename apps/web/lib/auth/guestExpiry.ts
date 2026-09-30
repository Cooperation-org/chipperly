/** A guest session lives 48 hours from the moment it started, then everything on the device is erased. */
export const GUEST_TTL_MS = 48 * 60 * 60 * 1000;

export function isGuestExpired(startedAt: number, now: number): boolean {
  return now - startedAt >= GUEST_TTL_MS;
}

/** "less than an hour", "1 hour", "23 hours": what's left, rounded up so it never says 0 hours. */
export function guestTimeLeftLabel(startedAt: number, now: number): string {
  const left = startedAt + GUEST_TTL_MS - now;
  if (left < 60 * 60 * 1000) return 'less than an hour';
  const hours = Math.ceil(left / (60 * 60 * 1000));
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
