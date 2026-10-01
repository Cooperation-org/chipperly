'use client';

import type { ImageCredit } from '@chipperly/shared/schemas/profile';
import { db } from '../db/db';
import { now } from '../clock';
import { upsert } from '../sync/mutate';
import { withCredit } from '../imageSearch';
import { getCurrentUserId } from './_util';

/** Keeps a found picture's attribution on the profile (settings.image_credits), which syncs like the rest of its settings. */
export async function saveImageCredit(profileId: string, mediaId: string, credit: ImageCredit): Promise<void> {
  const profile = await db.profiles.get(profileId);
  if (!profile) return;
  const updated_by = await getCurrentUserId();
  await upsert('profiles', {
    ...profile,
    settings: withCredit(profile.settings, mediaId, credit),
    client_updated_at: now(),
    updated_by,
  });
}
