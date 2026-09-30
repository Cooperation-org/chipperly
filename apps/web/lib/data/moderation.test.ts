import { describe, expect, it } from 'vitest';
import { REPORT_REASONS, canModerate, validateNickname } from './moderation';

describe('validateNickname', () => {
  it('accepts good names', () => {
    for (const n of ['abc', 'Sun_Flower-9', '9lives', 'a'.repeat(24)]) expect(validateNickname(n)).toBeNull();
  });
  it('rejects too short and too long', () => {
    expect(validateNickname('ab')).toMatch(/at least 3/);
    expect(validateNickname('a'.repeat(25))).toMatch(/at most 24/);
  });
  it('rejects bad characters and leading punctuation', () => {
    for (const n of ['has space', 'emoji😀x', '-abc', '_abc', 'a.b.c', 'a@b']) expect(validateNickname(n)).not.toBeNull();
  });
  it('leaves the profile-name and email checks to the server', () => {
    // Format-valid names are accepted here even when they would be a profile name or an email local part.
    expect(validateNickname('Maya')).toBeNull();
    expect(validateNickname('jimmy')).toBeNull();
  });
});

describe('REPORT_REASONS', () => {
  it('is the contract union, child_safety first', () => {
    expect(REPORT_REASONS.map((r) => r.value)).toEqual([
      'child_safety',
      'personal_information',
      'harassment',
      'spam',
      'other',
    ]);
  });
});

describe('canModerate', () => {
  it('allows super admin or support only', () => {
    expect(canModerate({ is_super_admin: true })).toBe(true);
    expect(canModerate({ is_support: true })).toBe(true);
    expect(canModerate({})).toBe(false);
    expect(canModerate({ is_super_admin: false, is_support: false })).toBe(false);
    expect(canModerate(null)).toBe(false);
    expect(canModerate(undefined)).toBe(false);
  });
});
