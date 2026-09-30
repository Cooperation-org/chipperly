import { describe, expect, it } from 'vitest';
import { buildSeed, defaultAnswers } from '@chipperly/shared/constants/setup';
import { ActivitySchema, ActivityStepSchema } from '@chipperly/shared/schemas/activity';
import { LocationSchema } from '@chipperly/shared/schemas/location';
import { RewardSchema } from '@chipperly/shared/schemas/reward';
import { buildSeedRows } from './seedLocal';

const PROFILE = '0190a000-0000-7000-8000-000000000001';
const USER = '0190a000-0000-7000-8000-000000000002';

describe('buildSeedRows', () => {
  for (const band of ['0-2', '2-7', '8-12', '13-17', '18+'] as const) {
    it(`matches buildSeed for ${band} and every row passes its schema`, () => {
      const setup = defaultAnswers(band);
      const plan = buildSeed(setup);
      const rows = buildSeedRows(PROFILE, USER, setup, 1234);

      expect(rows.locations.map((l) => [l.name, l.emoji, l.position])).toEqual(plan.locations.map((l, i) => [l.name, l.emoji, i]));
      expect(rows.activities.map((a) => [a.name, a.recurrence, a.recurrence_time])).toEqual(
        plan.activities.map((a) => [a.name, a.recurrence ?? null, a.recurrence_time ?? null]),
      );
      expect(rows.activity_steps).toHaveLength(plan.activities.reduce((n, a) => n + (a.steps?.length ?? 0), 0));
      expect(rows.rewards.map((r) => [r.name, r.chip_cost, r.always_available])).toEqual(
        plan.rewards.map((r) => [r.name, r.chip_cost, r.always_available ?? false]),
      );

      for (const row of rows.locations) LocationSchema.parse(row);
      for (const row of rows.activities) ActivitySchema.parse(row);
      for (const row of rows.activity_steps) ActivityStepSchema.parse(row);
      for (const row of rows.rewards) RewardSchema.parse(row);
    });
  }

  it('puts every activity at Home and every step under an existing activity', () => {
    const rows = buildSeedRows(PROFILE, USER, defaultAnswers('8-12'), 1);
    const home = rows.locations[0]!.id;
    expect(rows.activities.length).toBeGreaterThan(0);
    expect(rows.activities.every((a) => a.location_id === home)).toBe(true);
    const ids = new Set(rows.activities.map((a) => a.id));
    expect(rows.activity_steps.every((s) => ids.has(s.activity_id))).toBe(true);
  });

  it('stamps sync columns the way an unsynced local row has them', () => {
    const rows = buildSeedRows(PROFILE, USER, defaultAnswers('8-12'), 777);
    for (const row of [...rows.locations, ...rows.activities, ...rows.rewards]) {
      expect(row).toMatchObject({ profile_id: PROFILE, updated_by: USER, version: 0, client_updated_at: 777, deleted_at: null });
    }
  });
});
