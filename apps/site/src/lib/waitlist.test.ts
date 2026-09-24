import { describe, expect, it } from 'vitest';
import { checkWaitlist } from './waitlist';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('checkWaitlist', () => {
  it('normalises a valid entry and drops unknown roles', () => {
    expect(checkWaitlist(fd({ email: '  Ann@Example.COM ', name: ' Ann ', role: 'admin', source: '/' }))).toEqual({
      bot: false,
      email: 'ann@example.com',
      data: { email: 'ann@example.com', name: 'Ann', role: undefined, source: '/' },
    });
  });

  it('keeps a known role', () => {
    const r = checkWaitlist(fd({ email: 'a@b.co', role: 'professional' }));
    expect('data' in r && r.data.role).toBe('professional');
  });

  it('rejects a bad email', () => {
    expect(checkWaitlist(fd({ email: 'not-an-email' }))).toEqual({ error: 'Please enter a valid email address.' });
    expect(checkWaitlist(fd({ email: `${'a'.repeat(250)}@b.co` }))).toHaveProperty('error');
  });

  it('flags the honeypot before anything else', () => {
    expect(checkWaitlist(fd({ email: 'bad', company: 'Acme' }))).toEqual({ bot: true });
  });
});
