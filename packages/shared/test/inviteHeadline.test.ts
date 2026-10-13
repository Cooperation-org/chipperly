import { describe, expect, it } from 'vitest';
import { inviteHeadline } from '../src/helpers/inviteHeadline.js';

describe('inviteHeadline', () => {
  it('names the people when the account is named after the inviter', () => {
    expect(inviteHeadline('Sam', 'Sam', ['Ava', 'Ben', 'Cy'])).toBe('Sam invited you to help with Ava, Ben and Cy');
  });
  it('names the person when the account is named after them (supported)', () => {
    expect(inviteHeadline('Sam', 'Grandpa Joe', ['Grandpa Joe'])).toBe('Sam invited you to help with Grandpa Joe');
  });
  it('names an organization', () => {
    expect(inviteHeadline('Sam', 'Sunrise Therapy', ['Ava'])).toBe('Sam invited you to Sunrise Therapy');
  });
  it('never says "Sam invited you to Sam"', () => {
    expect(inviteHeadline('Sam', 'Sam', [])).toBe('Sam invited you to Chipperly');
  });
});
