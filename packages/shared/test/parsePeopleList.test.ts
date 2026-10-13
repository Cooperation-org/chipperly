import { describe, expect, it } from 'vitest';
import { parsePeopleList } from '../src/helpers/parsePeopleList.js';

describe('parsePeopleList', () => {
  it('reads one name per line and skips blank lines', () => {
    const r = parsePeopleList('Ava\n\n  Ben  \r\nCal\n');
    expect(r.people.map((p) => p.name)).toEqual(['Ava', 'Ben', 'Cal']);
    expect(r.errors).toEqual([]);
  });

  it('keeps a comma inside a name when there is no header', () => {
    expect(parsePeopleList('Lee, Sam').people).toEqual([{ name: 'Lee, Sam' }]);
  });

  it('reads a header row in any order and case, with a BOM', () => {
    const r = parsePeopleList('﻿Parent Email,NAME,Cluster\nmum@x.org,Ava,North clinic\n,Ben,\n');
    expect(r.people).toEqual([{ name: 'Ava', cluster_name: 'North clinic', parent_email: 'mum@x.org' }, { name: 'Ben' }]);
    expect(r.errors).toEqual([]);
  });

  it('reads quoted fields, commas and quotes inside them, and line breaks inside quotes', () => {
    const r = parsePeopleList('name,cluster\n"Lee, Sam","Ms. ""L"", caseload"\n"Two\nlines",A\nZed,B');
    expect(r.people).toEqual([
      { name: 'Lee, Sam', cluster_name: 'Ms. "L", caseload' },
      { name: 'Two\nlines', cluster_name: 'A' },
      { name: 'Zed', cluster_name: 'B' },
    ]);
    expect(r.errors).toEqual([]);
  });

  it('reports bad rows with their line number and keeps the good ones', () => {
    const r = parsePeopleList('name,parent email\nAva,not-an-email\n,x@y.org\nBen,B@Y.ORG');
    expect(r.people).toEqual([{ name: 'Ben', parent_email: 'b@y.org' }]);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it('treats a name-only header as a header, not a person', () => {
    expect(parsePeopleList('Name\nAva').people).toEqual([{ name: 'Ava' }]);
  });

  it('returns nothing for empty input', () => {
    expect(parsePeopleList('  \n\n')).toEqual({ people: [], errors: [] });
    expect(parsePeopleList('')).toEqual({ people: [], errors: [] });
  });

  it('rejects an over-long name', () => {
    expect(parsePeopleList('x'.repeat(101)).errors).toHaveLength(1);
  });
});
