// The admin site's two-step pass (X-Admin-Step): given after an authenticator
// code is accepted, good for 12 hours, kept in this browser only. The API
// client sends it on /admin/ requests; a 403 two_step_* fires NEED_CODE_EVENT
// so the admin shell asks for a code again without leaving the page.

const KEY = 'chipperly-admin-pass';
export const NEED_CODE_EVENT = 'chipperly-admin-need-code';

export function getAdminPass(): string | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { token: string; expires_at: number } | null;
    return saved && saved.expires_at > Date.now() ? saved.token : undefined;
  } catch {
    return undefined;
  }
}

export function setAdminPass(pass: { token: string; expires_at: number } | null): void {
  try {
    if (pass) localStorage.setItem(KEY, JSON.stringify(pass));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the pass lasts until the page closes; the next request asks again.
  }
}

export function askForCode(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NEED_CODE_EVENT));
}
