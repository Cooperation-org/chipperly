/** The admin site. Every admin screen lives there, not in the app (admin.chipperlyapp.com, 13 Oct 2026). */
export const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.chipperlyapp.com').replace(/\/$/, '');

/** True when this page was served from the admin site's host. */
export function isAdminHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.startsWith('admin.') || window.location.origin === ADMIN_URL;
}

/** A local or test server serves both, so nothing is redirected there. */
export function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  return /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(window.location.hostname);
}
