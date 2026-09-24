import { describe, expect, it } from 'vitest';
import type { Profile } from '@chipperly/shared/schemas/profile';
import { childViewProfileId } from './role';

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
