'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Handover } from '@chipperly/shared/schemas/handover';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import styles from './KeepCopyBanner.module.css';

/** A strip for a Family member while an organization has stopped covering their person: a copy is theirs to keep. */
export function KeepCopyBanner() {
  const { status } = useSession();
  const [offer, setOffer] = useState<Handover | null>(null);
  useEffect(() => {
    if (status !== 'signed_in') return;
    let cancelled = false;
    void api
      .get<{ handovers: Handover[] }>('/me/handovers')
      .then((r) => {
        if (!cancelled) setOffer(r.handovers[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status]);
  if (!offer) return null;
  return (
    <div className={styles.strip} role="status">
      {offer.org_name} no longer covers {offer.profile_name}. Keep a copy in your own account.{' '}
      <Link href={`/keep/?id=${encodeURIComponent(offer.id)}`}>Keep {offer.profile_name}&apos;s Chipperly</Link>
    </div>
  );
}
