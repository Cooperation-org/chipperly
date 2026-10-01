'use client';

import { useActiveProfile } from '@/lib/profile/active';
import { FirstThenPanels } from './FirstThenPanels';
import { ScreenHint } from '@/components/ui/ScreenHint';

/** Caregiver route entry: resolves the active profile, then renders the shared panels. */
export function FirstThenScreen() {
  const { profile } = useActiveProfile();
  if (!profile) return null;
  return (
    <>
      <ScreenHint id="first-then" title="Using First-Then" body="Show what comes first and what comes after. It helps with one step that is hard to start." section="first-then" />
      <FirstThenPanels profileId={profile.id} mode="caregiver" />
    </>
  );
}
