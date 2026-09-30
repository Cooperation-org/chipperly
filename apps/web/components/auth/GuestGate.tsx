'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { endGuestSession, useSession } from '@/lib/auth/session';
import { GUEST_MESSAGE } from '@/lib/auth/guest';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Wraps a screen that only works with the server (team, billing, devices, community...): a guest
 * sees "Create a free account to use this." instead. Renders nothing until the session is read, so
 * a public page can't fire its requests before the guest flag is on.
 */
export function GuestGate({ children }: { children: ReactNode }) {
  const { status, guest } = useSession();
  const router = useRouter();
  if (status === 'loading') return null;
  if (!guest) return children;

  async function createAccount(): Promise<void> {
    await endGuestSession();
    router.push('/sign-up/');
  }

  return (
    <EmptyState
      sentence={GUEST_MESSAGE}
      actions={[
        <Button key="create" onClick={() => void createAccount()}>
          Create account
        </Button>,
      ]}
    />
  );
}
