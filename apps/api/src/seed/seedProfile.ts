import { v7 as uuidv7 } from 'uuid';
import { DEFAULT_ACTIVITIES, DEFAULT_LOCATIONS, DEFAULT_REWARDS } from '@chipperly/shared/constants/defaults';
import { locations } from '../db/schema/locations.js';
import { activities } from '../db/schema/activities.js';
import { rewards } from '../db/schema/rewards.js';
import type { db } from '../db/client.js';

/** Whatever `db.transaction(cb)` hands its callback; accepted here so callers pass their open transaction. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Inserts the default locations, activities and rewards for a brand-new
 * profile. Must run inside the same transaction as the profile insert.
 */
export async function seedProfile(tx: Tx, profileId: string, updatedBy: string): Promise<void> {
  const now = Date.now();

  await tx.insert(locations).values(
    DEFAULT_LOCATIONS.map((location, position) => ({
      id: uuidv7(),
      profile_id: profileId,
      client_updated_at: now,
      updated_by: updatedBy,
      deleted_at: null,
      name: location.name,
      emoji: location.emoji,
      photo_id: null,
      position,
      chip_goal: 5,
      working_for_reward_id: null,
    })),
  );

  await tx.insert(activities).values(
    DEFAULT_ACTIVITIES.map((activity, position) => ({
      id: uuidv7(),
      profile_id: profileId,
      client_updated_at: now,
      updated_by: updatedBy,
      deleted_at: null,
      name: activity.name,
      emoji: activity.emoji,
      photo_id: null,
      chip_value: 1,
      location_id: null,
      recurrence: activity.recurrence ?? null,
      recurrence_weekdays: null,
      recurrence_time: activity.recurrence_time ?? null,
      position,
    })),
  );

  await tx.insert(rewards).values(
    DEFAULT_REWARDS.map((reward, position) => ({
      id: uuidv7(),
      profile_id: profileId,
      client_updated_at: now,
      updated_by: updatedBy,
      deleted_at: null,
      name: reward.name,
      emoji: reward.emoji,
      photo_id: null,
      chip_cost: 5,
      location_id: null,
      // All defaults cost chips, including the three screen-time rewards.
      always_available: false,
      position,
      screen_time_minutes: reward.screen_time_minutes ?? null,
      screen_time_packages: null,
    })),
  );
}
