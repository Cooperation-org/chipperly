/**
 * The `client_updated_at` to write for a local mutation (technical-plan.md
 * section 6 "Client loop" / CONTRACTS.md's LWW push check). A row created
 * server-side (e.g. onboarding's profile) carries `client_updated_at` set
 * from the server's precise clock; this client's own `now()` offset is only
 * whole-second accurate (lib/clock.ts), so an edit made within that second
 * can compute a smaller timestamp than the row it's editing and get
 * rejected `reason: "stale"` by the server. Bumping past the existing row's
 * own timestamp when needed guarantees this write always looks newer.
 *
 * A pure function on purpose (mirrors lib/sync/applyPulledRow.ts's split),
 * so it's unit-testable without constructing the Dexie database.
 */
export function nextClientUpdatedAt(now: number, existingClientUpdatedAt: number | undefined): number {
  return Math.max(now, (existingClientUpdatedAt ?? 0) + 1);
}
