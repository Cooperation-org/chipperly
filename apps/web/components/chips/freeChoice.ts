import type { Reward } from '@chipperly/shared/schemas/reward';
import type { ScheduleItem } from '@chipperly/shared/schemas/schedule';

export type FreeChoiceState =
  | { kind: 'open' }
  /** Costs chips; `short` is how many more the child needs (0 = affordable). */
  | { kind: 'chips'; cost: number; short: number }
  /** Not yet: says why, e.g. "After homework". */
  | { kind: 'locked'; reason: string };

export interface FreeChoiceContext {
  balance: number;
  /** Activity ids finished today (see `completedActivityIds`). */
  doneToday: ReadonlySet<string>;
  /** Live activity names by id. */
  activityNames: ReadonlyMap<string, string>;
}

/** Activity ids with a completed, non-deleted schedule item among today's `items`. */
export function completedActivityIds(items: readonly Pick<ScheduleItem, 'activity_id' | 'completed_at' | 'deleted_at'>[]): Set<string> {
  return new Set(items.filter((i) => i.deleted_at === null && i.completed_at !== null).map((i) => i.activity_id));
}

/**
 * Whether a reward can be picked right now. A task requirement is checked first;
 * then chip cost. A reward with neither (every legacy always-available reward) is open.
 * A requirement pointing at a deleted activity is ignored, so it never locks forever.
 */
export function freeChoiceState(reward: Reward, ctx: FreeChoiceContext): FreeChoiceState {
  const needed = reward.requires_activity_id ?? null;
  if (needed !== null && !ctx.doneToday.has(needed)) {
    const name = ctx.activityNames.get(needed);
    if (name !== undefined) return { kind: 'locked', reason: `After ${name}` };
  }
  if (!reward.always_available && reward.chip_cost !== null) {
    return { kind: 'chips', cost: reward.chip_cost, short: Math.max(0, reward.chip_cost - ctx.balance) };
  }
  return { kind: 'open' };
}
