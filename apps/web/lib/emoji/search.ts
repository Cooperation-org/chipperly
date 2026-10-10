/** One searchable emoji: the character, then the lower-case words it is found by (lib/emoji/all.json, built by scripts/subset-emoji.py). */
export type EmojiRow = [emoji: string, words: string];

/** Emoji whose words contain every word of the query, as a prefix ("tooth br" finds the toothbrush). */
export function searchEmoji(rows: readonly EmojiRow[], query: string, limit = 60): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const found: string[] = [];
  for (const [emoji, words] of rows) {
    const padded = ` ${words}`;
    if (terms.every((term) => padded.includes(` ${term}`))) {
      found.push(emoji);
      if (found.length === limit) break;
    }
  }
  return found;
}
