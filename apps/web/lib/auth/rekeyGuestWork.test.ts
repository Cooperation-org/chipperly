import { describe, expect, it } from 'vitest';
import { buildSeed, defaultAnswers } from '@chipperly/shared/constants/setup';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { buildSeedRows } from '../profile/seedLocal';
import { rekeyGuestWork } from './rekeyGuestWork';

const GUEST_PROFILE = '0190a000-0000-7000-8000-000000000001';
const GUEST_USER = '0190a000-0000-7000-8000-000000000002';
const NEW_PROFILE = '0190b000-0000-7000-8000-000000000001';
const NEW_ACCOUNT = '0190b000-0000-7000-8000-000000000002';
const NEW_USER = '0190b000-0000-7000-8000-000000000003';

const guestProfile: Profile = {
  id: GUEST_PROFILE,
  account_id: '0190a000-0000-7000-8000-000000000003',
  name: 'Mia',
  avatar_emoji: '🦊',
  avatar_photo_id: null,
  share_token: null,
  first_then_activity_id: null,
  first_then_reward_id: null,
  settings: { age_band: '8-12', day_goal_text: 'Stay on task' },
  version: 0,
  client_updated_at: 5_000,
  updated_by: GUEST_USER,
  deleted_at: null,
};
const serverProfile: Profile = {
  ...guestProfile,
  id: NEW_PROFILE,
  account_id: NEW_ACCOUNT,
  name: 'Sample child',
  avatar_emoji: null,
  settings: {},
  version: 7,
  client_updated_at: 9_000,
  updated_by: NEW_USER,
};

function guestRows() {
  const seed = buildSeedRows(GUEST_PROFILE, GUEST_USER, defaultAnswers('8-12'), 1000);
  const activity = seed.activities[0]!;
  return {
    ...seed,
    schedule_items: [
      {
        id: 'item-1', profile_id: GUEST_PROFILE, version: 0, client_updated_at: 1000, updated_by: GUEST_USER, deleted_at: null,
        date: '2026-10-01', position: 0, activity_id: activity.id, start_time: null, part_of_day: null, source: 'manual',
      },
    ],
  } as unknown as Parameters<typeof rekeyGuestWork>[1];
}

describe('rekeyGuestWork', () => {
  const target = { serverProfile, userId: NEW_USER, now: 2_000 };

  it('moves every row onto the new profile and user, leaving nothing on the guest ids', () => {
    const rows = guestRows();
    const out = rekeyGuestWork(guestProfile, rows, target);
    const total = Object.values(rows).reduce((n, list) => n + (list?.length ?? 0), 0);
    expect(out.rows).toHaveLength(total);
    for (const { row } of out.rows) {
      expect(row.profile_id).toBe(NEW_PROFILE);
      expect(row.updated_by).toBe(NEW_USER);
    }
    expect(JSON.stringify(out)).not.toContain(GUEST_PROFILE);
    expect(JSON.stringify(out)).not.toContain(GUEST_USER);
  });

  it('keeps row ids and the references between rows consistent', () => {
    const out = rekeyGuestWork(guestProfile, guestRows(), target);
    const ids = new Set(out.rows.map((r) => (r.row as { id: string }).id));
    const ref = (table: string, key: string) =>
      out.rows.filter((r) => r.table === table).map((r) => (r.row as unknown as Record<string, string | null>)[key]);
    for (const activityId of [...ref('activity_steps', 'activity_id'), ...ref('schedule_items', 'activity_id')]) expect(ids.has(activityId!)).toBe(true);
    for (const locationId of ref('activities', 'location_id')) expect(ids.has(locationId!)).toBe(true);
    expect(out.rows.filter((r) => r.table === 'activity_steps').length).toBe(
      buildSeed(defaultAnswers('8-12')).activities.reduce((n, a) => n + (a.steps?.length ?? 0), 0),
    );
  });

  it('puts parents before children', () => {
    const order = rekeyGuestWork(guestProfile, guestRows(), target).rows.map((r) => r.table);
    const first = (t: string) => order.indexOf(t as never);
    expect(first('locations')).toBeLessThan(first('activities'));
    expect(first('activities')).toBeLessThan(first('activity_steps'));
    expect(first('activities')).toBeLessThan(first('schedule_items'));
  });

  it("keeps the server's identity for the profile and the guest's content, and outranks the server copy", () => {
    const { profile } = rekeyGuestWork(guestProfile, guestRows(), target);
    expect(profile).toMatchObject({ id: NEW_PROFILE, account_id: NEW_ACCOUNT, version: 7, updated_by: NEW_USER });
    expect(profile).toMatchObject({ name: 'Mia', avatar_emoji: '🦊', settings: guestProfile.settings });
    expect(profile.client_updated_at).toBe(9_001);
  });

  it('uses now when it is already ahead of the server copy', () => {
    const { profile } = rekeyGuestWork(guestProfile, guestRows(), { ...target, now: 50_000 });
    expect(profile.client_updated_at).toBe(50_000);
  });

  it('does not mutate its input', () => {
    const rows = guestRows();
    const before = JSON.stringify(rows);
    rekeyGuestWork(guestProfile, rows, target);
    expect(JSON.stringify(rows)).toBe(before);
  });
});
