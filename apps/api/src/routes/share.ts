import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { ShareViewSchema } from '@chipperly/shared/schemas/share';
import { todayIso } from '@chipperly/shared/helpers/date';
import { balanceFor } from '@chipperly/shared/helpers/chips';
import { db } from '../db/client.js';
import { profiles } from '../db/schema/profiles.js';
import { locations } from '../db/schema/locations.js';
import { rewards } from '../db/schema/rewards.js';
import { activities, activity_steps } from '../db/schema/activities.js';
import { schedule_items, step_completions } from '../db/schema/schedule.js';
import { chip_ledger } from '../db/schema/chips.js';
import { AppError } from '../plugins/errors.js';

export default async function shareRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/share/:token',
    {
      config: {
        rateLimit:
          process.env.TEST_ENDPOINTS === '1'
            ? { max: 1000, timeWindow: '1 minute' }
            : { max: 60, timeWindow: '1 minute' },
      },
    },
    async (request) => {
      const { token } = z.object({ token: z.string().min(1) }).parse(request.params);

      const [profile] = await db.select().from(profiles).where(eq(profiles.share_token, token)).limit(1);
      if (!profile || profile.deleted_at !== null) {
        throw new AppError(404, 'not_found', 'Share link not found');
      }

      const today = todayIso();

      const scheduleRows = await db
        .select({
          id: schedule_items.id,
          activity_id: schedule_items.activity_id,
          activity_name: activities.name,
          activity_emoji: activities.emoji,
          activity_photo_id: activities.photo_id,
          start_time: schedule_items.start_time,
          part_of_day: schedule_items.part_of_day,
          completed_at: schedule_items.completed_at,
        })
        .from(schedule_items)
        .innerJoin(activities, eq(schedule_items.activity_id, activities.id))
        .where(
          and(eq(schedule_items.profile_id, profile.id), eq(schedule_items.date, today), isNull(schedule_items.deleted_at)),
        )
        .orderBy(schedule_items.position);

      const activityIds = [...new Set(scheduleRows.map((r) => r.activity_id))];
      const steps =
        activityIds.length > 0
          ? await db
              .select()
              .from(activity_steps)
              .where(and(inArray(activity_steps.activity_id, activityIds), isNull(activity_steps.deleted_at)))
              .orderBy(activity_steps.position)
          : [];
      const stepsByActivity = new Map<string, typeof steps>();
      for (const step of steps) {
        const list = stepsByActivity.get(step.activity_id) ?? [];
        list.push(step);
        stepsByActivity.set(step.activity_id, list);
      }

      const scheduleItemIds = scheduleRows.map((r) => r.id);
      const completions =
        scheduleItemIds.length > 0
          ? await db
              .select({ schedule_item_id: step_completions.schedule_item_id, activity_step_id: step_completions.activity_step_id })
              .from(step_completions)
              .where(and(inArray(step_completions.schedule_item_id, scheduleItemIds), isNull(step_completions.deleted_at)))
          : [];
      const completedKeys = new Set(completions.map((c) => `${c.schedule_item_id}:${c.activity_step_id}`));

      const items = scheduleRows.map((row) => ({
        ...row,
        steps: (stepsByActivity.get(row.activity_id) ?? []).map((step) => ({
          name: step.name,
          emoji: step.emoji,
          completed: completedKeys.has(`${row.id}:${step.id}`),
        })),
      }));

      const profileLocations = await db
        .select()
        .from(locations)
        .where(and(eq(locations.profile_id, profile.id), isNull(locations.deleted_at)))
        .orderBy(locations.position);
      // "the location the working-for reward is on (or the first location)"
      const workingLocation =
        profileLocations.find((l) => l.working_for_reward_id !== null) ?? profileLocations[0] ?? null;

      const ledger = await db
        .select({ location_id: chip_ledger.location_id, delta: chip_ledger.delta, deleted_at: chip_ledger.deleted_at })
        .from(chip_ledger)
        .where(eq(chip_ledger.profile_id, profile.id));
      const chip_balance = balanceFor(ledger, workingLocation?.id ?? null);

      let working_for_reward: { name: string; emoji: string | null; chip_cost: number | null } | null = null;
      if (workingLocation?.working_for_reward_id) {
        const [reward] = await db.select().from(rewards).where(eq(rewards.id, workingLocation.working_for_reward_id)).limit(1);
        if (reward) working_for_reward = { name: reward.name, emoji: reward.emoji, chip_cost: reward.chip_cost };
      }

      return ShareViewSchema.parse({
        profile_name: profile.name,
        profile_emoji: profile.avatar_emoji,
        profile_avatar_photo_id: profile.avatar_photo_id,
        items,
        chip_balance,
        working_for_reward,
        updated_at: Date.now(),
      });
    },
  );
}
