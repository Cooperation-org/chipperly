import { describe, expect, it } from 'vitest';
import { creditFromHeaders, creditsInUse, mergeResults, searchPath, withCredit, type ImageResult } from './imageSearch';

const hit = (id: string): ImageResult => ({
  id,
  title: id,
  creator: null,
  license: 'CC BY 4.0',
  license_url: null,
  thumbnail: null,
  attribution: id,
  landing_url: null,
  width: null,
  height: null,
});

describe('searchPath', () => {
  it('trims and encodes the query', () => {
    expect(searchPath('  red fox & kit ', 2)).toBe('/images/search?q=red%20fox%20%26%20kit&page=2');
  });
});

describe('mergeResults', () => {
  it('appends a page and drops repeats', () => {
    expect(mergeResults([hit('a'), hit('b')], [hit('b'), hit('c')]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('creditFromHeaders', () => {
  const headers = (h: Record<string, string>) => new Headers(h);
  it('decodes the attribution and source', () => {
    const text = '"Café cat" by Jo (CC BY 4.0)';
    expect(
      creditFromHeaders(headers({ 'X-Image-Attribution': encodeURIComponent(text), 'X-Image-Source': encodeURIComponent('https://e.org/a?b=1') })),
    ).toEqual({ text, url: 'https://e.org/a?b=1' });
  });
  it('has no url when the source is empty, and no credit without text', () => {
    expect(creditFromHeaders(headers({ 'X-Image-Attribution': 'x', 'X-Image-Source': '' }))).toEqual({ text: 'x', url: null });
    expect(creditFromHeaders(headers({}))).toBeNull();
  });
});

describe('withCredit and creditsInUse', () => {
  it('adds a credit without losing the others', () => {
    const one = withCredit({ read_aloud: true }, 'a', { text: 'A', url: null });
    const two = withCredit(one, 'b', { text: 'B', url: 'https://e.org' });
    expect(two).toEqual({
      read_aloud: true,
      image_credits: { a: { text: 'A', url: null }, b: { text: 'B', url: 'https://e.org' } },
    });
  });
  it('lists only credits whose picture is still used', () => {
    const credits = { a: { text: 'A', url: null }, b: { text: 'B', url: null } };
    expect(creditsInUse(credits, [{ photo_id: 'b' }])).toEqual([{ media_id: 'b', text: 'B', url: null }]);
    expect(creditsInUse(undefined, [])).toEqual([]);
  });
});
