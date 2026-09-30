import type { Location } from '@chipperly/shared/schemas/location';
import type { Activity, ActivityStep } from '@chipperly/shared/schemas/activity';
import type { Reward } from '@chipperly/shared/schemas/reward';
import type { SetupAnswers } from '@chipperly/shared/schemas/profile';
import { buildSeed } from '@chipperly/shared/constants/setup';
import { db } from '../db/db';
import { newId } from '../ids';

export interface SeedRows {
  locations: Location[];
  activities: Activity[];
  activity_steps: ActivityStep[];
  rewards: Reward[];
}

/**
 * The starter rows for a new profile, the same ones apps/api/src/seed/seedProfile.ts inserts on
 * the server (keep the two in step): Home first and the only place with activities, routines as
 * activities with steps, rewards from the setup answers. `version: 0` is what an unsynced row carries.
 */
export function buildSeedRows(profileId: string, updatedBy: string, setup: SetupAnswers, now: number): SeedRows {
  const plan = buildSeed(setup);
  const sync = { profile_id: profileId, version: 0, client_updated_at: now, updated_by: updatedBy, deleted_at: null };

  const locations: Location[] = plan.locations.map((location, position) => ({
    id: newId(),
    ...sync,
    name: location.name,
    emoji: location.emoji,
    photo_id: null,
    position,
    chip_goal: 5,
    working_for_reward_id: null,
    lat: null,
    lng: null,
    radius_m: null,
  }));
  const homeId = locations[0]!.id;

  const activities: Activity[] = [];
  const activity_steps: ActivityStep[] = [];
  for (const [position, activity] of plan.activities.entries()) {
    const id = newId();
    activities.push({
      id,
      ...sync,
      name: activity.name,
      emoji: activity.emoji,
      photo_id: null,
      chip_value: 1,
      location_id: homeId,
      recurrence: activity.recurrence ?? null,
      recurrence_weekdays: null,
      recurrence_time: activity.recurrence_time ?? null,
      position,
    });
    for (const [stepPosition, step] of (activity.steps ?? []).entries()) {
      activity_steps.push({
        id: newId(),
        ...sync,
        activity_id: id,
        parent_step_id: null,
        position: stepPosition,
        name: step.name,
        emoji: step.emoji,
        photo_id: null,
        duration_minutes: step.duration_minutes ?? null,
      });
    }
  }

  const rewards: Reward[] = plan.rewards.map((reward, position) => ({
    id: newId(),
    ...sync,
    name: reward.name,
    emoji: reward.emoji,
    photo_id: null,
    chip_cost: reward.chip_cost,
    location_id: null,
    always_available: reward.always_available ?? false,
    position,
    screen_time_minutes: reward.screen_time_minutes ?? null,
    screen_time_packages: null,
  }));

  return { locations, activities, activity_steps, rewards };
}

/** Direct writes, no outbox: a guest's rows never leave the device. */
export async function seedProfileLocally(profileId: string, updatedBy: string, setup: SetupAnswers): Promise<void> {
  const rows = buildSeedRows(profileId, updatedBy, setup, Date.now());
  await db.transaction('rw', db.locations, db.activities, db.activity_steps, db.rewards, async () => {
    await db.locations.bulkPut(rows.locations);
    await db.activities.bulkPut(rows.activities);
    await db.activity_steps.bulkPut(rows.activity_steps);
    await db.rewards.bulkPut(rows.rewards);
  });
}
