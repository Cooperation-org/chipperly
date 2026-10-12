import { describe, expect, it } from 'vitest';
import type { Reward } from '@chipperly/shared/schemas/reward';
import { filterRewards } from './rewards';

const HOME = '00000000-0000-7000-8000-000000000001';
const PARK = '00000000-0000-7000-8000-000000000002';

function reward(name: string, places: string[], position: number, positions?: Record<string, number>): Reward {
  return {
    id: name,
    profile_id: 'p',
    version: 0,
    client_updated_at: 0,
    updated_by: '',
    deleted_at: null,
    name,
    emoji: null,
    photo_id: null,
    chip_cost: 1,
    location_id: places.length === 1 ? (places[0] as string) : null,
    location_ids: places,
    always_available: false,
    position,
    positions,
  };
}

const names = (rows: Reward[]) => rows.map((r) => r.name);

describe('filterRewards order per place', () => {
  it('uses position when no place order was saved, place rewards before Every place ones', () => {
    const rows = [reward('e1', [], 0), reward('h1', [HOME], 1), reward('e2', [], 2), reward('h2', [HOME], 3)];
    expect(names(filterRewards(rows, { location_id: HOME }))).toEqual(['h1', 'h2', 'e1', 'e2']);
    expect(names(filterRewards(rows, {}))).toEqual(['e1', 'h1', 'e2', 'h2']);
  });

  it('a reward in two places keeps a separate spot in each', () => {
    const rows = [
      reward('both', [HOME, PARK], 0, { [HOME]: 1, [PARK]: 0 }),
      reward('h', [HOME], 1, { [HOME]: 0 }),
      reward('p', [PARK], 2, { [PARK]: 1 }),
    ];
    expect(names(filterRewards(rows, { location_id: HOME }))).toEqual(['h', 'both']);
    expect(names(filterRewards(rows, { location_id: PARK }))).toEqual(['both', 'p']);
  });

  it('Every place rewards follow the Every place order, in every place', () => {
    const rows = [reward('e1', [], 0, { all: 1 }), reward('e2', [], 1, { all: 0 }), reward('h', [HOME], 2)];
    expect(names(filterRewards(rows, { location_id: null }))).toEqual(['e2', 'e1']);
    expect(names(filterRewards(rows, { location_id: HOME }))).toEqual(['h', 'e2', 'e1']);
    expect(names(filterRewards(rows, { location_id: PARK }))).toEqual(['e2', 'e1']);
  });
});
