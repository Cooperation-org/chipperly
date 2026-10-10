import { describe, expect, it } from 'vitest';
import rows from './all.json';
import { searchEmoji, type EmojiRow } from './search';

const all = rows as EmojiRow[];

describe('searchEmoji', () => {
  it('finds an emoji by a word of its name or a keyword', () => {
    expect(searchEmoji(all, 'pizza')).toContain('🍕');
    expect(searchEmoji(all, 'bathroom')).toContain('🚽');
  });

  it('matches every word, each as a prefix, in any case', () => {
    expect(searchEmoji(all, 'Tooth BR')).toEqual(['🪥']);
  });

  it('does not match the middle of a word', () => {
    expect(searchEmoji(all, 'izza')).toEqual([]);
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(searchEmoji(all, '  ')).toEqual([]);
    expect(searchEmoji(all, 'face', 5)).toHaveLength(5);
  });
});
