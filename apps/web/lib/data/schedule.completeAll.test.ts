import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for Dexie: just the calls setCompleted / setStepCompleted make.
const tables = vi.hoisted(() => ({ data: {} as Record<string, Record<string, unknown>[]>, kv: new Map<string, unknown>(), n: 0 }));

vi.mock('../db/db', () => {
  const table = (name: string) => ({
    get: async (id: string) => tables.data[name]?.find((row) => row.id === id),
    where: (field: string) => ({
      equals: (value: unknown) => ({ toArray: async () => (tables.data[name] ?? []).filter((row) => row[field] === value) }),
    }),
  });
  return { db: new Proxy({}, { get: (_target, name: string) => table(name) }) };
});
vi.mock('../sync/mutate', () => ({
  upsert: async (name: string, row: { id: string }) => {
    const rows = (tables.data[name] ??= []);
    const at = rows.findIndex((r) => r.id === row.id);
    if (at >= 0) rows[at] = row;
    else rows.push(row);
  },
  softDelete: async (name: string, id: string) => {
    const row = tables.data[name]?.find((r) => r.id === id);
    if (row) row.deleted_at = 1;
  },
}));
vi.mock('../sync/engine', () => ({ pullProfile: async () => {} }));
vi.mock('../db/kv', () => ({
  getKv: async (key: string) => tables.kv.get(key) ?? null,
  setKv: async (key: string, value: unknown) => void tables.kv.set(key, value),
}));
vi.mock('../ids', () => ({ newId: () => `id-${(tables.n += 1)}` }));
vi.mock('../clock', () => ({ now: () => 1000 }));
vi.mock('./mood', () => ({ getMoodLevel: async () => null }));
vi.mock('./locations', () => ({ getActiveLocationId: async () => null, useActiveLocation: () => ({}) }));

import { setCompleted, setStepCompleted } from './schedule';

const CHIPS = 3;

function seed(): void {
  tables.n = 0;
  tables.kv.clear();
  tables.data = {
    profiles: [{ id: 'p1', settings: {} }],
    activities: [{ id: 'a1', location_id: null, chip_value: CHIPS }],
    activity_steps: ['s1', 's2', 's3'].map((id, position) => ({
      id,
      activity_id: 'a1',
      parent_step_id: null,
      position,
      deleted_at: null,
    })),
    schedule_items: [{ id: 'i1', profile_id: 'p1', activity_id: 'a1', completed_at: null, completed_by: null, deleted_at: null }],
    step_completions: [],
    chip_ledger: [],
  };
}

const live = (name: string) => (tables.data[name] ?? []).filter((row) => row.deleted_at === null || row.deleted_at === undefined);
const chipTotal = () => live('chip_ledger').reduce((sum, row) => sum + (row.delta as number), 0);
const doneSteps = () => live('step_completions').map((row) => row.activity_step_id).sort();

describe('completing a whole routine in one go', () => {
  beforeEach(seed);

  it('earns the same chips as ticking every step one by one', async () => {
    await setCompleted('i1', true, 'u1');
    const oneTap = { chips: chipTotal(), steps: doneSteps() };

    seed();
    for (const id of ['s1', 's2', 's3']) await setStepCompleted('i1', id, true, 'u1');

    expect(oneTap).toEqual({ chips: CHIPS, steps: ['s1', 's2', 's3'] });
    expect(chipTotal()).toBe(CHIPS);
    expect(doneSteps()).toEqual(oneTap.steps);
  });

  it('does not pay twice when some steps were already done', async () => {
    await setStepCompleted('i1', 's1', true, 'u1');
    expect(chipTotal()).toBe(0);
    await setCompleted('i1', true, 'u1');
    expect(chipTotal()).toBe(CHIPS);
    expect(doneSteps()).toEqual(['s1', 's2', 's3']);
    expect(live('step_completions')).toHaveLength(3);
  });

  it('a second tap on an already finished routine adds nothing', async () => {
    await setCompleted('i1', true, 'u1');
    await setCompleted('i1', true, 'u1');
    expect(chipTotal()).toBe(CHIPS);
    expect(live('step_completions')).toHaveLength(3);
  });

  it('undoing takes the chips back and restores the steps that were done before', async () => {
    await setStepCompleted('i1', 's1', true, 'u1');
    await setCompleted('i1', true, 'u1');
    await setCompleted('i1', false, 'u1');
    expect(chipTotal()).toBe(0);
    expect(doneSteps()).toEqual(['s1']);
  });
});
