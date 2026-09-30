import { describe, expect, it } from 'vitest';
import { isSelfManaged, settingsCopy } from './settingsCopy';

describe('isSelfManaged', () => {
  it('is true only for an individual account', () => {
    expect(isSelfManaged({ kind: 'individual' })).toBe(true);
    expect(isSelfManaged({ kind: 'household' })).toBe(false);
    expect(isSelfManaged({ kind: 'agency' })).toBe(false);
    // 'supported' is someone else's account, held for them: not self-managed.
    expect(isSelfManaged({ kind: 'supported' })).toBe(false);
    expect(isSelfManaged(undefined)).toBe(false);
  });
});

describe('settingsCopy', () => {
  const self = settingsCopy(true, 'Celia');
  const team = settingsCopy(false, 'Celia');

  it('self-managed never mentions others supporting anyone, or "Alert me"', () => {
    const text = JSON.stringify({ ...self, can: self.can('choose the reward') });
    expect(text).not.toContain('others supporting');
    expect(text).not.toContain('Alert me');
    expect(text).not.toContain('Celia');
    expect(self.reviewHint).toBeNull();
    expect(self.rewardToggle.startsWith('Remind me')).toBe(true);
  });

  it('team wording keeps the name-first voice', () => {
    expect(team.viewTitle).toBe("Celia's view");
    expect(team.reviewHint).toBe('Just for you; others supporting Celia choose their own.');
    expect(team.rewardToggle).toBe('Alert me when Celia wants a reward');
    expect(team.can('redeem rewards')).toBe('Celia can redeem rewards');
  });

  it('self-managed can() uses you', () => {
    expect(self.can('redeem rewards')).toBe('You can redeem rewards');
  });
});
