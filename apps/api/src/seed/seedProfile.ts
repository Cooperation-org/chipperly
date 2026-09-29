import { v7 as uuidv7 } from 'uuid';
import { DEFAULT_ACTIVITIES, DEFAULT_LOCATIONS, DEFAULT_REWARDS } from '@chipperly/shared/constants/defaults';
import { buildSeed } from '@chipperly/shared/constants/setup';
import type { SetupAnswers } from '@chipperly/shared/schemas/profile';
import { locations } from '../db/schema/locations.js';
import { activities, activity_steps } from '../db/schema/activities.js';
import { rewards } from '../db/schema/rewards.js';
import type { db } from '../db/client.js';

/** Whatever `db.transaction(cb)` hands its callback; accepted here so callers pass their open transaction. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Inserts the starter locations, activities (routines included) and rewards
 * for a brand-new profile. With the setup interview's answers, the content
 * comes from buildSeed and fits the person; without them, the old fixed
 * default lists. Must run inside the same transaction as the profile insert.
 */
export async function seedProfile(tx: Tx, profileId: string, updatedBy: string, setup?: SetupAnswers): Promise<void> {
  const now = Date.now();
  const sync = { profile_id: profileId, client_updated_at: now, updated_by: updatedBy, deleted_at: null };

  const plan = setup
    ? buildSeed(setup)
    : {
        locations: DEFAULT_LOCATIONS,
        activities: DEFAULT_ACTIVITIES,
        rewards: DEFAULT_REWARDS.map((reward) => ({
          ...reward,
          chip_cost: 5,
          // All defaults cost chips, including the three screen-time rewards.
          always_available: false,
        })),
      };

  await tx.insert(locations).values(
    plan.locations.map((location, position) => ({
      id: uuidv7(),
      ...sync,
      name: location.name,
      emoji: location.emoji,
      photo_id: null,
      position,
      chip_goal: 5,
      working_for_reward_id: null,
    })),
  );

  for (const [position, activity] of plan.activities.entries()) {
    const activityId = uuidv7();
    await tx.insert(activities).values({
      id: activityId,
      ...sync,
      name: activity.name,
      emoji: activity.emoji,
      photo_id: null,
      chip_value: 1,
      location_id: null,
      recurrence: activity.recurrence ?? null,
      recurrence_weekdays: null,
      recurrence_time: activity.recurrence_time ?? null,
      position,
    });
    const steps = 'steps' in activity ? activity.steps : undefined;
    if (steps && steps.length > 0) {
      await tx.insert(activity_steps).values(
        steps.map((step, stepPosition) => ({
          id: uuidv7(),
          ...sync,
          activity_id: activityId,
          parent_step_id: null,
          position: stepPosition,
          name: step.name,
          emoji: step.emoji,
          photo_id: null,
          duration_minutes: step.duration_minutes ?? null,
        })),
      );
    }
  }

  await tx.insert(rewards).values(
    plan.rewards.map((reward, position) => ({
      id: uuidv7(),
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
    })),
  );
}
