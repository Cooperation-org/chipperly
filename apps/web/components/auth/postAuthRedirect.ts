import type { useRouter } from 'next/navigation';
import type { MeResponse } from '@chipperly/shared/schemas/auth';
import { api } from '@/lib/api/client';
import { getKv, setKv } from '@/lib/db/kv';
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
 * otherwise Today for a user with profiles or onboarding for one without.
 */
export async function redirectAfterAuth(router: Router): Promise<void> {
  const next = await getKv<string>(POST_AUTH_REDIRECT_KEY);
  if (next) {
    await setKv<string | null>(POST_AUTH_REDIRECT_KEY, null);
    router.push(next);
    return;
  }
  const me = await api.get<MeResponse>('/me');
  router.push(me.profiles.length > 0 ? '/today/' : '/onboarding/kind/');
}
