import { describe, expect, it } from 'vitest';
import { readUnsubscribeToken, unsubscribeToken } from './unsubscribe';

const SECRET = 'test-secret-1';

describe('unsubscribe token', () => {
  it('round-trips an address, lowercased', async () => {
    const t = await unsubscribeToken(' Parent@Example.com ', SECRET);
    expect(await readUnsubscribeToken(t, SECRET)).toBe('parent@example.com');
  });
  it('is url safe', async () => {
    expect(await unsubscribeToken('a+b@example.com', SECRET)).toMatch(/^[\w-]+\.[\w-]+$/);
  });
  it('rejects a different secret, a swapped address and junk', async () => {
    const t = await unsubscribeToken('a@example.com', SECRET);
    expect(await readUnsubscribeToken(t, 'other-secret')).toBeNull();
    const other = await unsubscribeToken('b@example.com', SECRET);
    expect(await readUnsubscribeToken(`${other.split('.')[0]}.${t.split('.')[1]}`, SECRET)).toBeNull();
    for (const junk of ['', 'abc', 'a.b.c', '!!.??']) expect(await readUnsubscribeToken(junk, SECRET)).toBeNull();
  });
});
