// Module-singleton clock offset, learned from the `Date` response header of
// the last successful API call (technical-plan.md section 6 "Clock"). Not a
// hybrid logical clock: good enough for LWW between caregivers on the same
// account, on purpose.
let offsetMs = 0;

// The `Date` header only has whole-second resolution, so a freshly-learned
// offset can under-shoot the true server time by up to ~1s relative to a
// timestamp the server minted moments earlier with `Date.now()` (e.g. a
// row it just created). Tracking the last value handed out and never going
// backward keeps `client_updated_at` writes from looking older than a row
// that was in fact created before them.
let lastNow = 0;

/** Now, adjusted by the server offset. Used everywhere `client_updated_at` is set. Monotonic within a session. */
export function now(): number {
  const next = Math.max(Date.now() + offsetMs, lastNow + 1);
  lastNow = next;
  return next;
}

/** Learn the offset from a response's `Date` header value. Ignores a missing/unparseable header. */
export function setServerDate(headerValue: string | null | undefined): void {
  if (!headerValue) return;
  const serverMs = Date.parse(headerValue);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs - Date.now();
}
