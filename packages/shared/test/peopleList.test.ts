import { describe, expect, it } from 'vitest';
import { parsePeopleList } from '../src/lib/peopleList.js';

describe('parsePeopleList', () => {
  it('reads one name per line and skips blanks', () => {
    const r = parsePeopleList('Ana\n\n Ben \r\n');
    expect(r.people.map((p) => p.name)).toEqual(['Ana', 'Ben']);
    expect(r.errors).toEqual([]);
  });

  it('reads name, group and parent email without a header', () => {
    const r = parsePeopleList('Ana,North,ana@x.org');
    expect(r.people).toEqual([{ name: 'Ana', cluster_name: 'North', parent_email: 'ana@x.org' }]);
  });

  it('uses the header to find columns', () => {
    const r = parsePeopleList('name,parent email,group\nAna,ana@x.org,South');
    expect(r.people).toEqual([{ name: 'Ana', cluster_name: 'South', parent_email: 'ana@x.org' }]);
  });

  it('handles quoted cells', () => {
    expect(parsePeopleList('"Lee, Sam",North').people[0]).toEqual({ name: 'Lee, Sam', cluster_name: 'North' });
  });

  it('reports a missing name and a bad email with the line number', () => {
    const r = parsePeopleList('name,group,parent email\nAna,,nope\n,North');
    expect(r.people).toEqual([]);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it('stops at 1000 people', () => {
    const r = parsePeopleList(Array.from({ length: 1002 }, (_, i) => `P${i}`).join('\n'));
    expect(r.people).toHaveLength(1000);
    expect(r.errors).toHaveLength(1);
  });
});
