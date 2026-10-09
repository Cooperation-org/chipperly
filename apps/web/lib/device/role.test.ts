import { describe, expect, it } from 'vitest';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { childViewProfileId, isCaregiverDevice } from './role';

const p = (id: string, uses = true) => ({ id, settings: uses ? {} : { child_uses_app: false } }) as Profile;

describe('childViewProfileId', () => {
  const benny = p('benny');
  const maya = p('maya');
  const adult = p('adult', false);

  it('a hard lock wins over everything', () => {
    expect(childViewProfileId('maya', { kind: 'child', profile_id: 'benny' }, benny, [benny, maya])).toBe('maya');
  });
  it("then this device's child", () => {
    expect(childViewProfileId(null, { kind: 'child', profile_id: 'maya' }, benny, [benny, maya])).toBe('maya');
  });
  it('skips an active profile who does not use the app', () => {
    expect(childViewProfileId(null, null, adult, [adult, maya])).toBe('maya');
  });
  it("ignores a device child that's gone", () => {
    expect(childViewProfileId(null, { kind: 'child', profile_id: 'gone' }, benny, [benny])).toBe('benny');
  });
});

describe('isCaregiverDevice', () => {
  const mine = { id: 'me', account_id: 'solo', settings: {} } as Profile;
  const kid = { id: 'kid', account_id: 'fam', settings: {} } as Profile;
  const solo = new Set(['solo']);

  it('a self-managed person with no device answer is their own caregiver', () => {
    expect(isCaregiverDevice(null, [mine], solo)).toBe(true);
  });
  it('a family account with no answer still opens to the child view', () => {
    expect(isCaregiverDevice(null, [kid], solo)).toBe(false);
  });
  it('mixed accounts do not count as self-managed', () => {
    expect(isCaregiverDevice(null, [mine, kid], solo)).toBe(false);
  });
  it('an explicit child device stays a child device', () => {
    expect(isCaregiverDevice({ kind: 'child', profile_id: 'me' }, [mine], solo)).toBe(false);
  });
  it('a caregiver role always wins', () => {
    expect(isCaregiverDevice({ kind: 'caregiver' }, [kid], solo)).toBe(true);
  });
});
