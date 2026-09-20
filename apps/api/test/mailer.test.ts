import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
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

describe('mailer Resend transport failure (never blocks the caller)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    env.mailEnabled = false;
  });

  it('resolves instead of throwing when Resend rejects the send, and logs it', async () => {
    env.mailEnabled = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve('validation_error') }),
    );

    await expect(
      sendMail({ to: 'kid@example.com', subject: 'Verify your Chipperly email', text: 'link' }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
  });
});
