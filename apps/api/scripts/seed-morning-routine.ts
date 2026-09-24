/**
 * One-off: adds MORNING_ROUTINE (daily, 6:00, 11 steps) to every live
 * profile that doesn't already have it, and makes it replace the morning:
 * standalone activities named like one of its steps stop repeating, their
 * unchecked rows from yesterday on are removed, and the routine's own rows
 * move to the top of their day. Safe to re-run. Every write bumps
 * `client_updated_at` and gets a new `version` from the sync trigger, so
 * devices pull it on the next sync.
 *
 *   node --env-file=.env --import tsx scripts/seed-morning-routine.ts [--dry-run]
 */
import { and, eq, gte, inArray, isNotNull, isNull, min, ne, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { MORNING_ROUTINE } from '@chipperly/shared/constants/defaults';
import { closeDb, db } from '../src/db/client.js';
import { accounts } from '../src/db/schema/accounts.js';
import { activities, activity_steps } from '../src/db/schema/activities.js';
import { profiles } from '../src/db/schema/profiles.js';
import { schedule_items } from '../src/db/schema/schedule.js';

const STEP_NAMES = MORNING_ROUTINE.steps.map((step) => step.name);
// Yesterday covers profiles whose local date is behind the server's.
const FROM_DATE = sql<string>`current_date - 1`;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, owner: accounts.owner_user_id, account: accounts.name })
    .from(profiles)
    .innerJoin(accounts, eq(accounts.id, profiles.account_id))
    .where(isNull(profiles.deleted_at));

  for (const p of rows) {
    const label = `${p.account} / ${p.name}`;
    const [existing] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.profile_id, p.id), eq(activities.name, MORNING_ROUTINE.name), isNull(activities.deleted_at)));
    const replaced = await db
      .select({ id: activities.id, name: activities.name })
      .from(activities)
      .where(
        and(
          eq(activities.profile_id, p.id),
          inArray(activities.name, STEP_NAMES),
          isNotNull(activities.recurrence),
          isNull(activities.deleted_at),
        ),
      );
    console.log(
      `${dryRun ? 'dry  ' : '     '} ${label}: ${existing ? 'has routine' : 'add routine'}; stop repeating [${replaced.map((a) => a.name).join(', ')}]`,
    );
    if (dryRun) continue;

    const now = Date.now();
    const sync = { profile_id: p.id, client_updated_at: now, updated_by: p.owner, deleted_at: null };
    const routineId = existing?.id ?? uuidv7();
    await db.transaction(async (tx) => {
      if (!existing) {
        // position -1 puts it first in the library without renumbering the rest.
        await tx.insert(activities).values({
          id: routineId,
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
            activity_id: routineId,
            parent_step_id: null,
            position,
            name: step.name,
            emoji: step.emoji,
            photo_id: null,
            duration_minutes: null,
          })),
        );
      }

      const replacedIds = replaced.map((a) => a.id);
      if (replacedIds.length > 0) {
        // The activities stay in the library, they just stop filling Today.
        await tx
          .update(activities)
          .set({ recurrence: null, recurrence_weekdays: null, client_updated_at: now, updated_by: p.owner })
          .where(inArray(activities.id, replacedIds));
        // Checked rows stay: they are the child's history.
        await tx
          .update(schedule_items)
          .set({ deleted_at: now, client_updated_at: now, updated_by: p.owner })
          .where(
            and(
              inArray(schedule_items.activity_id, replacedIds),
              eq(schedule_items.source, 'recurring'),
              isNull(schedule_items.completed_at),
              isNull(schedule_items.deleted_at),
              gte(schedule_items.date, FROM_DATE),
            ),
          );
      }

      // Days already built before the routine existed got it appended last.
      const routineItems = await tx
        .select({ id: schedule_items.id, date: schedule_items.date })
        .from(schedule_items)
        .where(and(eq(schedule_items.activity_id, routineId), isNull(schedule_items.deleted_at), gte(schedule_items.date, FROM_DATE)));
      for (const item of routineItems) {
        const [first] = await tx
          .select({ pos: min(schedule_items.position) })
          .from(schedule_items)
          .where(
            and(
              eq(schedule_items.profile_id, p.id),
              eq(schedule_items.date, item.date),
              isNull(schedule_items.deleted_at),
              ne(schedule_items.id, item.id),
            ),
          );
        if (first?.pos == null) continue;
        await tx
          .update(schedule_items)
          .set({ position: first.pos - 1, client_updated_at: now, updated_by: p.owner })
          .where(eq(schedule_items.id, item.id));
      }
    });
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
