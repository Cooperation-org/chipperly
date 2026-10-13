import { afterEach, describe, expect, it } from 'vitest';
import { fromApp } from './appSecret';

const req = (secret?: string) => new Request('https://x/internal/waitlist', { headers: secret === undefined ? {} : { 'x-cron-secret': secret } });

describe('fromApp', () => {
  afterEach(() => {
    delete process.env.NEWSLETTER_API_SECRET;
  });
  it('accepts only the exact shared secret, and nothing when it is unset', () => {
    expect(fromApp(req('s3cret'))).toBe(false);
    process.env.NEWSLETTER_API_SECRET = 's3cret';
    expect(fromApp(req('s3cret'))).toBe(true);
    expect(fromApp(req('s3cres'))).toBe(false);
    expect(fromApp(req('s3cret-longer'))).toBe(false);
    expect(fromApp(req())).toBe(false);
  });
});
