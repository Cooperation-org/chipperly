import type { useRouter } from 'next/navigation';
import type { MeResponse } from '@chipperly/shared/schemas/auth';
import { api } from '@/lib/api/client';
import { getKv, setKv } from '@/lib/db/kv';

type Router = ReturnType<typeof useRouter>;

/** Set by S33 (invite) before sending a signed-out visitor to sign in or create an account. */
const POST_AUTH_REDIRECT_KEY = 'post_auth_redirect';

export async function setPostAuthRedirect(path: string): Promise<void> {
  await setKv<string>(POST_AUTH_REDIRECT_KEY, path);
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
