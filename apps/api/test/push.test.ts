import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every test gets a fresh module graph: push.ts's own `import { env }` must
// resolve to the same env instance a test mutates, and its *internal*
// `await import('firebase-admin/...')` calls must pick up that test's own
// vi.doMock rather than a previous test's cached resolution.
beforeEach(() => {
  vi.resetModules();
});

describe('push console transport', () => {
  it('logs to console and resolves [] when Firebase is unconfigured', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { sendPush } = await import('../src/lib/push.js');

    const stale = await sendPush({ tokens: ['t1'], title: 'Chipperly', body: 'Benny is now at School.' });

    expect(stale).toEqual([]);
    expect(logSpy.mock.calls.join('\n')).toContain('Benny is now at School.');
    logSpy.mockRestore();
  });
});

describe('push Firebase transport', () => {
  it('returns only the tokens Firebase reports as unregistered, and never throws', async () => {
    vi.doMock('firebase-admin/app', () => ({
      initializeApp: vi.fn().mockReturnValue({}),
      cert: vi.fn().mockReturnValue({}),
    }));
    vi.doMock('firebase-admin/messaging', () => ({
      getMessaging: vi.fn().mockReturnValue({
        sendEachForMulticast: vi.fn().mockResolvedValue({
          responses: [
            { success: true },
            { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          ],
        }),
      }),
    }));

    const { env } = await import('../src/env.js');
    env.pushEnabled = true;
    env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"project_id":"test"}';

    const { sendPush } = await import('../src/lib/push.js');
    const stale = await sendPush({ tokens: ['good-token', 'stale-token'], title: 'Chipperly', body: 'hi' });

    expect(stale).toEqual(['stale-token']);
  });

  it('resolves [] instead of throwing when the Firebase call itself fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.doMock('firebase-admin/app', () => ({
      initializeApp: vi.fn().mockReturnValue({}),
      cert: vi.fn().mockReturnValue({}),
    }));
    vi.doMock('firebase-admin/messaging', () => ({
      getMessaging: vi.fn().mockReturnValue({
        sendEachForMulticast: vi.fn().mockRejectedValue(new Error('network down')),
      }),
    }));

    const { env } = await import('../src/env.js');
    env.pushEnabled = true;
    env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"project_id":"test"}';

    const { sendPush } = await import('../src/lib/push.js');
    await expect(sendPush({ tokens: ['t1'], title: 'Chipperly', body: 'hi' })).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
