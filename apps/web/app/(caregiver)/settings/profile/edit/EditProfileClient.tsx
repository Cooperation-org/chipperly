'use client';

import { useSearchParams } from 'next/navigation';
import { ProfileForm } from '@/components/settings/ProfileForm';

/** Reads ?id= (CONTRACTS.md "Query params are read with useSearchParams() inside <Suspense>"). */
export function EditProfileClient() {
  const params = useSearchParams();
  const id = params.get('id');
  if (!id) return null;
  return <ProfileForm profileId={id} />;
}
