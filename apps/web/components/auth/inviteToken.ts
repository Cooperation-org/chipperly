/**
 * Pure so it's unit-testable without the `@/` alias or a kv mock (mirrors
 * lib/sync/applyPulledRow.ts's split for the same reason). Extracts the
 * invite token from a pending post-auth redirect path set by S33
 * (postAuthRedirect.ts), e.g. `/invite/?token=abc123`.
 */
export function inviteTokenFromRedirect(path: string | undefined): string | null {
  if (!path) return null;
  const match = /[?&]token=([^&]+)/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}
