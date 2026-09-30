import { describe, expect, it } from 'vitest';
import { placeIdsFor, togglePlace, type GuidedItem, type GuidedPlace } from './guidedSetup';

const home: GuidedPlace = { id: 'h', name: 'Home', emoji: '🏠', photo_id: null };
const school: GuidedPlace = { id: 's', name: 'School', emoji: '🏫', photo_id: null };
const item = (location_ids: string[]): GuidedItem => ({ name: 'Art', emoji: '🎨', photo_id: null, chip_cost: null, location_ids });

describe('guided setup helpers', () => {
  it('placeIdsFor drops places that were removed and falls back to the first place', () => {
    expect(placeIdsFor(item(['s', 'h']), [home, school])).toEqual(['s', 'h']);
    expect(placeIdsFor(item(['s']), [home])).toEqual(['h']);
    expect(placeIdsFor(item([]), [home, school])).toEqual(['h']);
  });

  it('togglePlace adds, removes, and keeps the last one', () => {
    expect(togglePlace(['h'], 's')).toEqual(['h', 's']);
    expect(togglePlace(['h', 's'], 'h')).toEqual(['s']);
    expect(togglePlace(['h'], 'h')).toEqual(['h']);
  });
});
