import { ProvidersResponseSchema, type ProvidersResponse } from '@chipperly/shared/schemas/auth';
import { api } from '@/lib/api/client';

export type AuthProviders = ProvidersResponse;

let cached: Promise<AuthProviders> | null = null;

/** GET /auth/providers, fetched once per page load and shared by every sign-in button. */
export function getAuthProviders(): Promise<AuthProviders> {
  cached ??= api
    .get<AuthProviders>('/auth/providers', { schema: ProvidersResponseSchema })
    .catch(() => ({ google: false, apple: false, invite_code_required: false }));
  return cached;
}
