// Module-singleton clock offset, learned from the `Date` response header of
// the last successful API call (technical-plan.md section 6 "Clock"). Not a
// hybrid logical clock: good enough for LWW between caregivers on the same
// account, on purpose.
let offsetMs = 0;

/** Now, adjusted by the server offset. Used everywhere `client_updated_at` is set. */
export function now(): number {
  return Date.now() + offsetMs;
}

/** Learn the offset from a response's `Date` header value. Ignores a missing/unparseable header. */
export function setServerDate(headerValue: string | null | undefined): void {
  if (!headerValue) return;
  const serverMs = Date.parse(headerValue);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs - Date.now();
}
