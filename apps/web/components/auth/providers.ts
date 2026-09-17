import { api } from '@/lib/api/client';

export interface AuthProviders {
  google: boolean;
  apple: boolean;
}

let cached: Promise<AuthProviders> | null = null;

/** GET /auth/providers, fetched once per page load and shared by every sign-in button. */
export function getAuthProviders(): Promise<AuthProviders> {
  cached ??= api.get<AuthProviders>('/auth/providers').catch(() => ({ google: false, apple: false }));
  return cached;
}
