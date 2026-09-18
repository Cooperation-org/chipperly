import { describe, expect, it } from 'vitest';
import { inviteTokenFromRedirect } from './inviteToken';

describe('inviteTokenFromRedirect', () => {
  it('is null when there is no pending redirect', () => {
    expect(inviteTokenFromRedirect(undefined)).toBeNull();
  });

  it('is null when the pending redirect is not an invite link', () => {
    expect(inviteTokenFromRedirect('/today/')).toBeNull();
  });

  it('extracts and decodes the token from an invite redirect', () => {
    expect(inviteTokenFromRedirect('/invite/?token=abc123')).toBe('abc123');
    expect(inviteTokenFromRedirect('/invite/?token=a%2Fb')).toBe('a/b');
  });
});
