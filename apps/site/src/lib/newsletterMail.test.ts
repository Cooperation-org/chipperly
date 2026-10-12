import { describe, expect, it, vi } from 'vitest';
import { buildMail, sendBatch } from './newsletterMail';
import { readUnsubscribeToken } from './unsubscribe';

const SECRET = 'test-secret-1';

describe('buildMail', () => {
  it('adds a working unsubscribe link and the one-click headers', async () => {
    const m = await buildMail({ to: 'Mum@Example.com', subject: 'Hi', body: 'Hello\n\nSee https://chipperlyapp.com/blog', secret: SECRET, siteUrl: 'https://site.test' });
    const link = /<(https:\/\/site\.test\/unsubscribe\?t=[^>]+)>/.exec(m.headers['List-Unsubscribe'])?.[1] ?? '';
    expect(link).not.toBe('');
    expect(await readUnsubscribeToken(new URL(link).searchParams.get('t') ?? '', SECRET)).toBe('mum@example.com');
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.text).toContain(link);
    expect(m.html).toContain(`href="${link}"`);
    expect(m.html).toContain('<p>Hello</p>');
  });
  it('escapes html in the body', async () => {
    const m = await buildMail({ to: 'a@example.com', subject: 's', body: '<script>x</script>', secret: SECRET });
    expect(m.html).not.toContain('<script>');
  });
});

describe('sendBatch', () => {
  const mails = Array.from({ length: 250 }, (_, i) => ({ to: `u${i}@example.com`, subject: 's', text: 't', html: 'h', headers: {} }));
  it('sends in batches of 100 and counts them', async () => {
    const f = vi.fn(async () => new Response('{}'));
    expect(await sendBatch(mails, { apiKey: 'k', from: 'a@b.c' }, f as never)).toEqual({ sent: 250, failed: 0 });
    expect(f).toHaveBeenCalledTimes(3);
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body)[0]).toMatchObject({ from: 'a@b.c', reply_to: 'info@chipperlyapp.com' });
  });
  it('counts a refused batch as failed and carries on', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('no', { status: 422 })).mockResolvedValue(new Response('{}'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await sendBatch(mails, { apiKey: 'k', from: 'a@b.c' }, f as never)).toEqual({ sent: 150, failed: 100 });
  });
});
