import { describe, expect, it } from 'vitest';
import { ruleBody, validLocalPart } from './emailRouting';

describe('validLocalPart', () => {
  it('accepts plain addresses and the catch-all', () => {
    for (const v of ['info', 'taymar', 'first.last', 'team-2', 'a', '*']) expect(validLocalPart(v)).toBe(true);
  });
  it('rejects anything that is not a bare lowercase local part', () => {
    for (const v of ['Info', 'info@chipperlyapp.com', '.dot', 'dash-', 'has space', '', 'x'.repeat(65), 42, null]) {
      expect(validLocalPart(v)).toBe(false);
    }
  });
});

describe('ruleBody', () => {
  it('builds a literal rule for one address', () => {
    expect(ruleBody({ localPart: 'support', destination: ' Tamar.Pixley@gmail.com ', enabled: true }, 'chipperlyapp.com')).toEqual({
      name: 'support@chipperlyapp.com (managed in /admin)',
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: 'support@chipperlyapp.com' }],
      actions: [{ type: 'forward', value: ['tamar.pixley@gmail.com'] }],
    });
  });
  it('hands addresses with extra recipients to the fan-out Worker', () => {
    const body = ruleBody({ localPart: 'info', destination: 'a@b.co', enabled: true, fanout: true }, 'chipperlyapp.com');
    expect(body.actions).toEqual([{ type: 'worker', value: ['chipperly-mail'] }]);
    expect(body.matchers).toEqual([{ type: 'literal', field: 'to', value: 'info@chipperlyapp.com' }]);
  });
  it('builds the catch-all rule for "*"', () => {
    const body = ruleBody({ localPart: '*', destination: 'a@b.co', enabled: false }, 'chipperlyapp.com');
    expect(body.matchers).toEqual([{ type: 'all' }]);
    expect(body.enabled).toBe(false);
  });
});
