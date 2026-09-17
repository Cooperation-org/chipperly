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

  it('returns nothing when no name matches', () => {
    expect(filterAndSection(items, 'xyz')).toEqual([]);
  });
});
