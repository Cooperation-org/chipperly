import { describe, expect, it } from 'vitest';
import { filterAndSection } from './pickerModel';

describe('filterAndSection', () => {
  const items = [{ name: 'Brush teeth' }, { name: 'Go to school' }, { name: 'Movie time' }];

  it('returns everything for an empty query', () => {
    expect(filterAndSection(items, '')).toEqual(items);
  });

  it('filters case-insensitively on a substring', () => {
    expect(filterAndSection(items, 'BRUSH')).toEqual([{ name: 'Brush teeth' }]);
  });

  it('trims whitespace around the query', () => {
    expect(filterAndSection(items, '  movie  ')).toEqual([{ name: 'Movie time' }]);
  });

  it('keeps the input order, so rewards stay in the order the parent set', () => {
    const ordered = [{ name: 'Zoo trip' }, { name: 'Apple' }, { name: 'Movie night' }];
    expect(filterAndSection(ordered, '')).toEqual(ordered);
    expect(filterAndSection(ordered, 'o')).toEqual([{ name: 'Zoo trip' }, { name: 'Movie night' }]);
  });

  it('returns nothing when no name matches', () => {
    expect(filterAndSection(items, 'xyz')).toEqual([]);
  });
});
