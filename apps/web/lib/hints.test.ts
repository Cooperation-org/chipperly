import { describe, expect, it } from 'vitest';
import { hintKey, isHintKey } from './hints';

describe('hints', () => {
  it('builds the kv key for a hint id', () => {
    expect(hintKey('today')).toBe('hint_dismissed:today');
  });

  it('only matches hint keys', () => {
    expect(isHintKey(hintKey('chips'))).toBe(true);
    expect(isHintKey('lock')).toBe(false);
    expect(isHintKey('device_settings')).toBe(false);
  });
});
