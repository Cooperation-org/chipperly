import { describe, expect, it } from 'vitest';
import { addHelper, canAddRow, familyCounter, familyPeople, prefillName, tempPasswordError, type PersonDraft } from './setupFlow';

const p = (id: string, name: string): PersonDraft => ({ id, name, emoji: null, photo_id: null });

describe('prefillName', () => {
  it('keeps a real name and trims it', () => {
    expect(prefillName('  Sam Lee ')).toBe('Sam Lee');
  });
  it('is empty for an email or nothing', () => {
    expect(prefillName('sam@example.com')).toBe('');
    expect(prefillName('Sam@home')).toBe('');
    expect(prefillName(null)).toBe('');
    expect(prefillName(undefined)).toBe('');
  });
});

describe('family list', () => {
  it('counts "n of 6"', () => {
    expect(familyCounter(3)).toBe('3 of 6');
  });

  it('lets the admin count toward the 6', () => {
    expect(canAddRow(5, false)).toBe(true);
    expect(canAddRow(6, false)).toBe(false);
    expect(canAddRow(5, true)).toBe(false);
    expect(canAddRow(4, true)).toBe(true);
  });

  it('drops blank rows and puts the admin last', () => {
    const people = familyPeople([p('a', ' Ava '), p('b', '  '), p('c', 'Ben')], p('me', 'Sam'));
    expect(people.map((x) => x.name)).toEqual(['Ava', 'Ben', 'Sam']);
  });

  it('never returns more than 6', () => {
    const rows = Array.from({ length: 7 }, (_, i) => p(String(i), `P${i}`));
    expect(familyPeople(rows, null)).toHaveLength(6);
  });

  it('skips an admin row with no name', () => {
    expect(familyPeople([p('a', 'Ava')], p('me', ' ')).map((x) => x.name)).toEqual(['Ava']);
  });
});

describe('temporary password', () => {
  it('needs 8 characters, like the server', () => {
    expect(tempPasswordError('1234567')).toBeDefined();
    expect(tempPasswordError('12345678')).toBeUndefined();
  });
});

describe('addHelper', () => {
  it('adds a lower-cased email with its role', () => {
    expect(addHelper([], ' Nan@X.org ', 'viewer')).toEqual([{ email: 'nan@x.org', role: 'viewer' }]);
  });
  it('ignores a bad address and a repeat', () => {
    const one = addHelper([], 'a@x.org', 'admin');
    expect(addHelper(one, 'nope', 'admin')).toEqual(one);
    expect(addHelper(one, 'A@x.org', 'viewer')).toEqual(one);
  });
});
