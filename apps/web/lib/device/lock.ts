import { api } from '@/lib/api/client';
import { db } from '@/lib/db/db';
import { upsert } from '@/lib/sync/mutate';
import Kiosk from '@/lib/native/kiosk';
import { lockTo } from './settings';

/**
 * Locks this device to a profile's child view with its saved options, and
 * pins the app on Android. `blockApps` (the top bar's "Lock phone") also
 * turns app blocking on; a plain lock leaves it as it is. The profile write
 * goes first, before /me/lock locks the session (the sync lock gate refuses
 * profile writes after that); the server sets it too, via block_apps.
 */
export async function lockToChild(profileId: string, { blockApps }: { blockApps: boolean }): Promise<void> {
  const profile = await db.profiles.get(profileId);
  if (blockApps && profile && !profile.settings.child_mode_active) {
    await upsert('profiles', { ...profile, settings: { ...profile.settings, child_mode_active: true } });
  }
  try {
    await api.post('/me/lock', { profile_id: profileId, block_apps: blockApps });
  } catch {
    // ponytail: offline, the local lock still holds; the server catches up next time a lock is sent.
  }
  await lockTo(profileId);
  // Caregiver mode is switched off by ChildToday once it's showing: doing it
  // here, before the caller navigates, let CaregiverShell bounce to
  // /child/?next=<this page> first.
  await Kiosk.enterFocusMode({ profileName: profile?.name ?? '' });
}
