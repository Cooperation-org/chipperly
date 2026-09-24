import type { useRouter } from 'next/navigation';
import type { MeResponse } from '@chipperly/shared/schemas/auth';
import { api } from '@/lib/api/client';
import { getKv, setKv } from '@/lib/db/kv';
import { asksDeviceRole, getDeviceRole, setDeviceRole, usesApp } from '@/lib/device/role';
import { inviteTokenFromRedirect } from './inviteToken';

type Router = ReturnType<typeof useRouter>;

/** Set by S33 (invite) before sending a signed-out visitor to sign in or create an account. */
const POST_AUTH_REDIRECT_KEY = 'post_auth_redirect';

export async function setPostAuthRedirect(path: string): Promise<void> {
  await setKv<string>(POST_AUTH_REDIRECT_KEY, path);
}

/**
 * The invite token from a pending post-auth redirect (S33's `/invite/?token=...`), if any. A user who
 * reaches S2 this way registers with that token instead of a beta invite code (see auth.ts's
 * isValidPendingInvite): being invited to an account already proves they're expected.
 */
export async function getPendingInviteToken(): Promise<string | null> {
  return inviteTokenFromRedirect(await getKv<string>(POST_AUTH_REDIRECT_KEY));
}

/**
 * Where to land right after a successful sign-in/sign-up: a pending redirect
 * (e.g. back to the invite that sent the visitor to sign in) takes priority,
 * otherwise onboarding for a user without profiles, else this device's
 * screens (lib/device/role.ts), asking who it's for the first time.
 */
export async function redirectAfterAuth(router: Router): Promise<void> {
  const next = await getKv<string>(POST_AUTH_REDIRECT_KEY);
  if (next) {
    await setKv<string | null>(POST_AUTH_REDIRECT_KEY, null);
    router.push(next);
    return;
  }
  const me = await api.get<MeResponse>('/me');
  if (me.profiles.length === 0) {
    router.push('/onboarding/kind/');
    return;
  }
  const role = await getDeviceRole();
  if (role) {
    router.push(role.kind === 'caregiver' ? '/today/' : '/child/');
    return;
  }
  // First sign-in here: a phone or tablet asks who it's for; a browser, or an account with no child using the app, is the caregiver's.
  if (asksDeviceRole() && me.profiles.some(usesApp)) {
    router.push('/onboarding/device/');
    return;
  }
  await setDeviceRole({ kind: 'caregiver' });
  router.push('/today/');
}
