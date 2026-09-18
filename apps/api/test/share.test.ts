import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { asc, eq } from 'drizzle-orm';
import { todayIso } from '@chipperly/shared/helpers/date';
import { ShareViewSchema } from '@chipperly/shared/schemas/share';
import { buildTestApp, expectShape, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { users } from '../src/db/schema/accounts.js';
import { profiles } from '../src/db/schema/profiles.js';
import { activities, activity_steps } from '../src/db/schema/activities.js';
import { rewards } from '../src/db/schema/rewards.js';
import { locations } from '../src/db/schema/locations.js';
import { schedule_items, step_completions } from '../src/db/schema/schedule.js';
import { chip_ledger } from '../src/db/schema/chips.js';
import { issueTokens } from '../src/lib/tokens.js';

async function createUser(label: string): Promise<{ id: string; token: string }> {
  const id = uuidv7();
  await db.insert(users).values({ id, email: `${label}-${id}@example.com`, display_name: label, created_at: Date.now() });
  const tokens = await issueTokens(id);
  return { id, token: tokens.access_token };
}

describe('share route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns today's items and the working-for chip balance, and 404s on an unknown token", async () => {
    const admin = await createUser('shareadmin');
    const accountRes = await request(app, {
      method: 'POST',
      url: '/api/accounts',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { kind: 'individual', name: 'Share test account' },
    });
    const { account } = accountRes.json() as { account: { id: string } };

    const profileRes = await request(app, {
      method: 'POST',
      url: `/api/accounts/${account.id}/profiles`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'Sharey', emoji: '🌟' },
    });
    const profile = profileRes.json() as { id: string };

    const seededActivities = await db
      .select()
      .from(activities)
      .where(eq(activities.profile_id, profile.id))
      .orderBy(asc(activities.position));
    const seededLocations = await db
      .select()
      .from(locations)
      .where(eq(locations.profile_id, profile.id))
      .orderBy(asc(locations.position));
    const seededRewards = await db
      .select()
      .from(rewards)
      .where(eq(rewards.profile_id, profile.id))
      .orderBy(asc(rewards.position));
    const activity = seededActivities[0]!;
    const workingLocation = seededLocations[0]!;
    const reward = seededRewards[0]!;

    await db.update(locations).set({ working_for_reward_id: reward.id }).where(eq(locations.id, workingLocation.id));

    const now = Date.now();
    const scheduleItemId = uuidv7();
    await db.insert(schedule_items).values({
      id: scheduleItemId,
      profile_id: profile.id,
      client_updated_at: now,
      updated_by: admin.id,
      deleted_at: null,
      date: todayIso(),
      position: 0,
      activity_id: activity.id,
      start_time: null,
      part_of_day: null,
      source: 'manual',
      completed_at: null,
      completed_by: null,
    });

    const doneStepId = uuidv7();
    const pendingStepId = uuidv7();
    await db.insert(activity_steps).values([
      {
        id: doneStepId,
        profile_id: profile.id,
        client_updated_at: now,
        updated_by: admin.id,
        deleted_at: null,
        activity_id: activity.id,
        position: 0,
        name: 'Brush teeth',
        emoji: '🪥',
        photo_id: null,
      },
      {
        id: pendingStepId,
        profile_id: profile.id,
        client_updated_at: now,
        updated_by: admin.id,
        deleted_at: null,
        activity_id: activity.id,
        position: 1,
        name: 'Wash face',
        emoji: '🧼',
        photo_id: null,
      },
    ]);
    await db.insert(step_completions).values({
      id: uuidv7(),
      profile_id: profile.id,
      client_updated_at: now,
      updated_by: admin.id,
      deleted_at: null,
      schedule_item_id: scheduleItemId,
      activity_step_id: doneStepId,
      completed_at: now,
      completed_by: admin.id,
    });

    await db.insert(chip_ledger).values([
      {
        id: uuidv7(),
        profile_id: profile.id,
        client_updated_at: now,
        updated_by: admin.id,
        deleted_at: null,
        location_id: workingLocation.id,
        delta: 3,
        reason: 'manual',
        ref_id: null,
        created_at: now,
        created_by: admin.id,
      },
      {
        id: uuidv7(),
        profile_id: profile.id,
        client_updated_at: now,
        updated_by: admin.id,
        deleted_at: null,
        location_id: null,
        delta: 1,
        reason: 'manual',
        ref_id: null,
        created_at: now,
        created_by: admin.id,
      },
    ]);

    const shareToken = `share-test-${uuidv7()}`;
    await db.update(profiles).set({ share_token: shareToken }).where(eq(profiles.id, profile.id));

    const shareRes = await request(app, { method: 'GET', url: `/api/share/${shareToken}` });
    expect(shareRes.statusCode).toBe(200);
    const view = expectShape(shareRes, ShareViewSchema);
    expect(view.profile_name).toBe('Sharey');
    expect(view.profile_emoji).toBe('🌟');
    expect(view.profile_avatar_photo_id).toBeNull();
    expect(view.items).toHaveLength(1);
    expect(view.items[0]!.activity_name).toBe(activity.name);
    expect(view.items[0]!.activity_photo_id).toBeNull();
    expect(view.items[0]!.completed_at).toBeNull();
    expect(view.items[0]!.steps).toEqual([
      { name: 'Brush teeth', emoji: '🪥', completed: true },
      { name: 'Wash face', emoji: '🧼', completed: false },
    ]);
    expect(view.chip_balance).toBe(4);
    expect(view.working_for_reward).toEqual({ name: reward.name, emoji: reward.emoji, chip_cost: reward.chip_cost });
    expect(typeof view.updated_at).toBe('number');

    const missingRes = await request(app, { method: 'GET', url: '/api/share/does-not-exist' });
    expect(missingRes.statusCode).toBe(404);
  });
});
