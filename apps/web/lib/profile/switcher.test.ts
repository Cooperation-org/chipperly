import { describe, expect, it } from 'vitest';
import { filterByName, groupByAccount, needsSearch, sortByName } from './switcher';

describe('switcher helpers', () => {
  it('shows search only above 8 people', () => {
    expect(needsSearch(8)).toBe(false);
    expect(needsSearch(9)).toBe(true);
  });

  it('filters ignoring case and accents', () => {
    const list = [{ name: 'José' }, { name: 'Zoë' }, { name: 'Amy' }];
    expect(filterByName(list, 'JOSE')).toEqual([{ name: 'José' }]);
    expect(filterByName(list, 'zoe')).toEqual([{ name: 'Zoë' }]);
    expect(filterByName(list, '  ')).toEqual(list);
    expect(filterByName(list, 'xyz')).toEqual([]);
  });

  it('groups by account in account order and drops empty groups', () => {
    const accounts = [
      { id: 'a', name: 'Home' },
      { id: 'b', name: 'Clinic' },
      { id: 'c', name: 'Empty' },
    ];
    const profiles = [
      { account_id: 'b', name: '1' },
      { account_id: 'a', name: '2' },
      { account_id: 'b', name: '3' },
    ];
    const g = groupByAccount(profiles, accounts);
    expect(g.map((x) => x.accountName)).toEqual(['Home', 'Clinic']);
    expect(g[1]!.profiles.map((p) => p.name)).toEqual(['1', '3']);
  });

  it('sorts by name ignoring case and accents, inside each account group', () => {
    const list = [{ name: 'zoe' }, { name: '\u00c9mile' }, { name: 'Amy' }];
    expect(sortByName(list).map((p) => p.name)).toEqual(['Amy', '\u00c9mile', 'zoe']);
    const g = groupByAccount(
      [
        { account_id: 'a', name: 'Zed' },
        { account_id: 'a', name: 'abe' },
      ],
      [{ id: 'a', name: 'Home' }],
    );
    expect(g[0]!.profiles.map((p) => p.name)).toEqual(['abe', 'Zed']);
  });
});
