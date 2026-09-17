'use client';

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './session';

export function RequireSession({
  children,
  redirectTo = '/',
}: {
  children: ReactNode;
  redirectTo?: string;
}): ReactElement | null {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signed_out') router.replace(redirectTo);
  }, [status, redirectTo, router]);

  if (status !== 'signed_in') return null;
  return <>{children}</>;
}
