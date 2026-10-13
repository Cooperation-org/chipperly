import { describe, expect, it } from 'vitest';
import { cloneGuidedPicks, placeIdsFor, togglePlace, type GuidedItem, type GuidedPlace } from './guidedSetup';

const home: GuidedPlace = { id: 'h', name: 'Home', emoji: '🏠', photo_id: null };
const school: GuidedPlace = { id: 's', name: 'School', emoji: '🏫', photo_id: null };
const item = (location_ids: string[]): GuidedItem => ({ name: 'Art', emoji: '🎨', photo_id: null, chip_cost: null, location_ids });

describe('guided setup helpers', () => {
  it('placeIdsFor drops places that were removed and falls back to the first place', () => {
    expect(placeIdsFor(item(['s', 'h']), [home, school])).toEqual(['s', 'h']);
    expect(placeIdsFor(item(['s']), [home])).toEqual(['h']);
    expect(placeIdsFor(item([]), [home, school])).toEqual(['h']);
  });

  it('cloneGuidedPicks gives the copy its own place ids and keeps items pointing at them', () => {
    let n = 0;
    const picks = { places: [home, school], free: [item(['s'])], earned: [{ ...item(['h', 's']), chip_cost: 5 }] };
    const copy = cloneGuidedPicks(picks, () => `new${++n}`);
    expect(copy.places.map((p) => p.id)).toEqual(['new1', 'new2']);
    expect(copy.places.map((p) => p.name)).toEqual(['Home', 'School']);
    expect(copy.free[0]?.location_ids).toEqual(['new2']);
    expect(copy.earned[0]?.location_ids).toEqual(['new1', 'new2']);
    expect(picks.places[0]?.id).toBe('h');
    expect(picks.free[0]?.location_ids).toEqual(['s']);
  });

  it('togglePlace adds, removes, and keeps the last one', () => {
    expect(togglePlace(['h'], 's')).toEqual(['h', 's']);
    expect(togglePlace(['h', 's'], 'h')).toEqual(['s']);
    expect(togglePlace(['h'], 'h')).toEqual(['h']);
  });
});
