import type { Profile } from '@chipperly/shared/schemas/profile';

export interface FirstThenReadiness {
  ready: boolean;
  missingFirst: boolean;
  missingThen: boolean;
  /** Plain sentence naming what is missing; empty when ready. */
  message: string;
}

/** Where a caregiver configures First-Then. */
export const FIRST_THEN_SETUP_PATH = '/first-then/';

export function firstThenReadiness(
  profile: Pick<Profile, 'first_then_activity_id' | 'first_then_reward_id'> | null | undefined,
): FirstThenReadiness {
  const missingFirst = !profile?.first_then_activity_id;
  const missingThen = !profile?.first_then_reward_id;
  const message =
    missingFirst && missingThen
      ? 'First-Then needs setting up first. Pick what comes first and the reward that comes after.'
      : missingFirst
        ? 'First-Then needs setting up first. Pick what comes first.'
        : missingThen
          ? 'First-Then needs setting up first. Pick the reward that comes after.'
          : '';
  return { ready: !missingFirst && !missingThen, missingFirst, missingThen, message };
}
