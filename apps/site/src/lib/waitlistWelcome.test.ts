import { describe, expect, it } from 'vitest';
import { readUnsubscribeToken } from './unsubscribe';
import { welcomeMail } from './waitlistWelcome';

describe('welcomeMail', () => {
  it('carries a working unsubscribe link for that address and only hosted images', async () => {
    const mail = await welcomeMail('Sam@Example.com', 'test-secret', 'https://chipperlyapp.com');
    const link = mail.headers['List-Unsubscribe']!.slice(1, -1);
    const token = new URL(link).searchParams.get('t')!;
    expect(await readUnsubscribeToken(token, 'test-secret')).toBe('sam@example.com');
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain('src="https://chipperlyapp.com/email/taymar-benny.jpg"');
    expect(mail.html).not.toMatch(/data:|<svg|(src|href)="http:/);
  });
});
