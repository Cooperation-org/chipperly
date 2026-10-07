import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../src/env.js';
import { renderEmail, siteOrigin, SITE_URL } from '../src/lib/emailTemplate.js';
import { noticeMail } from '../src/lib/stripe.js';

const original = env.APP_ORIGIN;
afterEach(() => {
  env.APP_ORIGIN = original;
});

describe('renderEmail', () => {
  it('builds an HTML button and a plain-text twin, and escapes what it is given', () => {
    const { text, html } = renderEmail({
      heading: 'Join <Team> on Chipperly',
      paragraphs: ['Hi & welcome'],
      action: { label: 'Accept', url: 'https://app.chipperlyapp.com/invite/?token=a&b=1' },
      note: 'Expires in 7 days.',
    });
    expect(html).toContain('<a href="https://app.chipperlyapp.com/invite/?token=a&amp;b=1"');
    expect(html).toContain('Join &lt;Team&gt; on Chipperly');
    expect(html).not.toContain('<Team>');
    expect(text).toContain('Accept: https://app.chipperlyapp.com/invite/?token=a&b=1');
    expect(text).toContain('Expires in 7 days.');
  });
});

describe('the site address in emails', () => {
  it('never points at localhost, even when this machine runs the app locally', () => {
    env.APP_ORIGIN = 'http://127.0.0.1:8091';
    expect(siteOrigin()).toBe(SITE_URL);
    for (const kind of ['started', 'cancel_scheduled', 'payment_failed', 'ended'] as const) {
      const mail = noticeMail(kind, Date.UTC(2026, 10, 7));
      expect(mail.text).not.toContain('127.0.0.1');
      expect(mail.html).not.toContain('127.0.0.1');
      expect(mail.html).toContain(`${SITE_URL}/settings/billing/`);
    }
  });

  it('uses the configured origin when it is a real one', () => {
    env.APP_ORIGIN = 'https://staging.chipperlyapp.com';
    expect(siteOrigin()).toBe('https://staging.chipperlyapp.com');
  });
});
