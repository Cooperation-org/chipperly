import { describe, expect, it } from 'vitest';
import { groupRows, mergePlaces, parseNominatim } from './places';

describe('mergePlaces', () => {
  it('replace swaps the set and dedupes', () => {
    expect(mergePlaces(['a'], ['b', 'c', 'b'], 'replace')).toEqual(['b', 'c']);
    expect(mergePlaces(['a'], [], 'replace')).toEqual([]);
  });
  it('add keeps what the row has', () => {
    expect(mergePlaces(['a'], ['b', 'a'], 'add')).toEqual(['a', 'b']);
  });
  it('add to every place stays every place', () => {
    expect(mergePlaces([], ['b'], 'add')).toEqual([]);
  });
});

describe('groupRows', () => {
  const rows = [
    { id: 1, k: ['pm'] },
    { id: 2, k: ['am'] },
    { id: 3, k: ['am', 'pm'] },
    { id: 4, k: ['zz'] },
  ];
  it('follows order, allows several groups per row, appends unknown keys, drops empty', () => {
    const g = groupRows(rows, (r) => r.k, ['am', 'none', 'pm']);
    expect(g.map((x) => x.key)).toEqual(['am', 'pm', 'zz']);
    expect(g[0]?.rows.map((r) => r.id)).toEqual([2, 3]);
    expect(g[1]?.rows.map((r) => r.id)).toEqual([1, 3]);
  });
});

describe('parseNominatim', () => {
  it('parses string coordinates and skips junk', () => {
    const hits = parseNominatim([
      { display_name: 'A', lat: '51.5', lon: '-0.12' },
      { display_name: 'bad', lat: 'x', lon: '1' },
      { display_name: 'far', lat: '99', lon: '1' },
      null,
    ]);
    expect(hits).toEqual([{ label: 'A', lat: 51.5, lng: -0.12 }]);
    expect(parseNominatim({ error: 'x' })).toEqual([]);
  });
});
