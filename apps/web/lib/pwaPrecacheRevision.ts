/**
 * Revision for Serwist's precached page-shell entries (next.config.ts).
 * Must change on every deploy so the service worker re-fetches the HTML
 * shell whenever the hashed JS/CSS bundle changes (technical-plan.md §7).
 * CI sets GIT_SHA to the commit being built; a local dev build has no
 * GIT_SHA, so it falls back to the current time instead of a constant so
 * the fallback still busts the cache on every build.
 */
export function pwaPrecacheRevision(gitSha: string | undefined): string {
  return gitSha ?? Date.now().toString();
}
