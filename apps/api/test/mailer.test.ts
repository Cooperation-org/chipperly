import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLastMailMessage, sendMail } from '../src/lib/mailer.js';

describe('mailer console transport (sec-3: token redaction)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts the token in what reaches stdout, but keeps it in the stored message', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await sendMail({
      to: 'kid@example.com',
      subject: 'Reset your Chipperly password',
      text: 'Reset your password: https://app.example.com/reset-password/?token=super-secret-raw-token',
    });

    const printed = logSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
    expect(printed).not.toContain('super-secret-raw-token');
    expect(printed).toContain('token=<redacted>');

    expect(getLastMailMessage()?.text).toContain('super-secret-raw-token');
  });
});
