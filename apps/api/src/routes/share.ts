import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { ShareViewSchema } from '@chipperly/shared/schemas/share';
import { todayIso } from '@chipperly/shared/helpers/date';
import { balanceFor } from '@chipperly/shared/helpers/chips';
import { db } from '../db/client.js';
import { profiles } from '../db/schema/profiles.js';
import { locations } from '../db/schema/locations.js';
import { rewards } from '../db/schema/rewards.js';
import { activities } from '../db/schema/activities.js';
import { schedule_items } from '../db/schema/schedule.js';
import { chip_ledger } from '../db/schema/chips.js';
import { AppError } from '../plugins/errors.js';

export default async function shareRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/share/:token',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const { token } = z.object({ token: z.string().min(1) }).parse(request.params);

      const [profile] = await db.select().from(profiles).where(eq(profiles.share_token, token)).limit(1);
      if (!profile || profile.deleted_at !== null) {
        throw new AppError(404, 'not_found', 'Share link not found');
      }

      const today = todayIso();

      const items = await db
        .select({
          id: schedule_items.id,
          activity_name: activities.name,
          activity_emoji: activities.emoji,
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
        items,
        chip_balance,
        working_for_reward,
        updated_at: Date.now(),
      });
    },
  );
}
