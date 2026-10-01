import { apiBase } from './api/base';

const MAX_PER_LOAD = 5;
// Not bugs: a dropped connection, a request that ran out of time, and a browser layout notice.
const IGNORED = /failed to fetch|load failed|networkerror|timeout|aborted|resizeobserver loop/i;
let sent = 0;

/**
 * Sends an uncaught browser error to the server log: the message, the stack,
 * the page path (no query string) and the build. Nothing about the person or
 * their day. Callers decide when reporting is allowed (Providers.tsx: signed
 * in, never a guest); this only caps and filters.
 */
export function reportError(error: unknown): void {
  const e = error instanceof Error ? error : new Error(String(error));
  if (sent >= MAX_PER_LOAD || IGNORED.test(`${e.name} ${e.message}`)) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  sent += 1;
  const body = JSON.stringify({
    message: e.message.slice(0, 500) || e.name,
    stack: e.stack?.slice(0, 4000),
    path: window.location.pathname.slice(0, 200),
    commit: process.env.NEXT_PUBLIC_GIT_SHA || undefined,
  });
  // keepalive: the report still goes out if the error is followed by a reload.
  void fetch(`${apiBase}/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
}

/** Test hook: the per-page-load cap is module state. */
export function resetReportedCount(): void {
  sent = 0;
}
