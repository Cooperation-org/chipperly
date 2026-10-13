import { describe, expect, it } from 'vitest';
import { canContinueAbout, everyoneAccess, familyInvitesLine, splitEmails, stepFromState, suggestedPlanLine } from './orgSetup';

describe('suggestedPlanLine', () => {
  it.each([
    [1, 'Pilot', 25],
    [25, 'Pilot', 25],
    [26, 'Small', 100],
    [100, 'Small', 100],
    [101, 'Growth', 250],
    [250, 'Growth', 250],
    [251, 'Scale', 500],
    [500, 'Scale', 500],
    [501, 'Enterprise', 1000],
  ])('%i people is %s', (n, name, max) => {
    const line = suggestedPlanLine(n);
    expect(line).toContain(name);
    expect(line).toContain(max.toLocaleString('en-US'));
  });

  it('is custom above 1,000', () => {
    expect(suggestedPlanLine(1001)).toContain('custom');
  });

  it('is empty without a usable number', () => {
    expect(suggestedPlanLine(0)).toBe('');
    expect(suggestedPlanLine(NaN)).toBe('');
  });
});

describe('step navigation', () => {
  it('reads the step from a history entry and ignores junk', () => {
    expect(stepFromState({ orgStep: 3 })).toBe(3);
    expect(stepFromState({ orgStep: 6 })).toBe(0);
    expect(stepFromState({ orgStep: -1 })).toBe(0);
    expect(stepFromState({ orgStep: '2' })).toBe(0);
    expect(stepFromState(null)).toBe(0);
  });

  it('needs a name and a type to leave step 1', () => {
    expect(canContinueAbout('  ', 'aba')).toBe(false);
    expect(canContinueAbout('Bright Path', null)).toBe(false);
    expect(canContinueAbout('Bright Path', 'aba')).toBe(true);
  });
});

describe('invite helpers', () => {
  it('splits and dedupes emails', () => {
    expect(splitEmails('a@x.org, b@y.org\na@x.org;;')).toEqual(['a@x.org', 'b@y.org']);
  });

  it('counts family invites per parent', () => {
    expect(familyInvitesLine(0)).toContain('No family emails');
    expect(familyInvitesLine(1)).toContain('1 family invite,');
    expect(familyInvitesLine(3)).toContain('3 family invites');
  });

  it('"Everyone" is every group, plus the people in no group', () => {
    const people = [
      { profile_id: 'p1', cluster_id: 'c1' },
      { profile_id: 'p2', cluster_id: 'c2' },
      { profile_id: 'p3', cluster_id: null },
    ];
    expect(everyoneAccess(people, [{ id: 'c1' }, { id: 'c2' }])).toEqual({ profileIds: ['p3'], clusterIds: ['c1', 'c2'] });
  });
});
