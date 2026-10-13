import { describe, expect, it } from 'vitest';
import { MAX_BULK, parsePeople } from './parsePeople';

describe('parsePeople', () => {
  it('reads names, groups and parent emails', () => {
    const r = parsePeople('Ava\nBen, North clinic\nCy, North clinic, cy.mum@example.com\n\n');
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { name: 'Ava' },
      { name: 'Ben', cluster_name: 'North clinic' },
      { name: 'Cy', cluster_name: 'North clinic', parent_email: 'cy.mum@example.com' },
    ]);
  });
  it('skips a header row and handles CRLF and quotes', () => {
    const r = parsePeople('name,group,parent email\r\n"Lee, Jo","Ms. Lee",\r\n');
    expect(r.rows).toEqual([{ name: 'Lee, Jo', cluster_name: 'Ms. Lee' }]);
  });
  it('reports a bad email and a missing name by line', () => {
    const r = parsePeople('Ava,,nope\n,North');
    expect(r.rows).toEqual([]);
    expect(r.problems.map((p) => p.line)).toEqual([1, 2]);
  });
  it('flags more than the bulk limit', () => {
    const r = parsePeople(Array.from({ length: MAX_BULK + 1 }, (_, i) => `P${i}`).join('\n'));
    expect(r.problems.some((p) => p.line === 0)).toBe(true);
  });
});
