/**
 * One-off: adds MORNING_ROUTINE (daily, 6:00, 11 steps) to every live
 * profile that doesn't already have an activity with that name. Safe to
 * re-run. Rows get their `version` from the sync trigger, so devices pull
 * them on the next sync.
 *
 *   node --env-file=.env --import tsx scripts/seed-morning-routine.ts [--dry-run]
 */
import { and, eq, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { MORNING_ROUTINE } from '@chipperly/shared/constants/defaults';
import { closeDb, db } from '../src/db/client.js';
import { accounts } from '../src/db/schema/accounts.js';
import { activities, activity_steps } from '../src/db/schema/activities.js';
import { profiles } from '../src/db/schema/profiles.js';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, owner: accounts.owner_user_id, account: accounts.name })
    .from(profiles)
    .innerJoin(accounts, eq(accounts.id, profiles.account_id))
    .where(isNull(profiles.deleted_at));

  for (const p of rows) {
    const [existing] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.profile_id, p.id), eq(activities.name, MORNING_ROUTINE.name), isNull(activities.deleted_at)));
    if (existing) {
      console.log(`skip  ${p.account} / ${p.name} (already has it)`);
      continue;
    }
    console.log(`${dryRun ? 'would add' : 'add  '} ${p.account} / ${p.name}`);
    if (dryRun) continue;

    const now = Date.now();
    const sync = { profile_id: p.id, client_updated_at: now, updated_by: p.owner, deleted_at: null };
    const activityId = uuidv7();
    await db.transaction(async (tx) => {
      // position -1 puts it first in the library without renumbering the rest.
      await tx.insert(activities).values({
        id: activityId,
        ...sync,
        name: MORNING_ROUTINE.name,
        emoji: MORNING_ROUTINE.emoji,
        photo_id: null,
        chip_value: 1,
        location_id: null,
        recurrence: MORNING_ROUTINE.recurrence,
        recurrence_weekdays: null,
        recurrence_time: MORNING_ROUTINE.recurrence_time,
        position: -1,
      });
      await tx.insert(activity_steps).values(
        MORNING_ROUTINE.steps.map((step, position) => ({
          id: uuidv7(),
          ...sync,
          activity_id: activityId,
          parent_step_id: null,
          position,
          name: step.name,
          emoji: step.emoji,
          photo_id: null,
          duration_minutes: null,
        })),
      );
    });
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
