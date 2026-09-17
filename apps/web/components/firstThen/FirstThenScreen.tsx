'use client';

import { useActiveProfile } from '@/lib/profile/active';
import { FirstThenPanels } from './FirstThenPanels';

/** Caregiver route entry: resolves the active profile, then renders the shared panels. */
export function FirstThenScreen() {
  const { profile } = useActiveProfile();
  if (!profile) return null;
  return <FirstThenPanels profileId={profile.id} mode="caregiver" />;
}
