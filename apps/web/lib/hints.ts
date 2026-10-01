/** First-visit hints (ScreenHint): one kv row per dismissed hint, so "Show tips again" can clear them by prefix. */
export const HINT_PREFIX = 'hint_dismissed:';

export function hintKey(id: string): string {
  return `${HINT_PREFIX}${id}`;
}

export function isHintKey(key: string): boolean {
  return key.startsWith(HINT_PREFIX);
}
