import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// request() reads tokens/account/lock state from lib/db/kv before every call; stubbed (vi.mock
// calls are hoisted above this import) so this file never touches the real Dexie/IndexedDB,
// which isn't available in the node test environment.
const { kv } = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock('../db/kv', () => ({
  getKv: vi.fn((key: string) => Promise.resolve(kv.get(key))),
  setKv: vi.fn((key: string, value: unknown) => {
    kv.set(key, value);
    return Promise.resolve();
  }),
}));

import { api, ApiError, buildHeaders, TimeoutError } from './client';

describe('buildHeaders', () => {
  it('omits Content-Type when there is no body', () => {
    const headers = buildHeaders({ hasBody: false });
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type: application/json when there is a body', () => {
    const headers = buildHeaders({ hasBody: true });
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('adds Authorization, X-Account-Id and X-Locked only when given', () => {
    const bare = buildHeaders({ hasBody: false });
    expect(bare.Authorization).toBeUndefined();
    expect(bare['X-Account-Id']).toBeUndefined();
    expect(bare['X-Locked']).toBeUndefined();

    const full = buildHeaders({ hasBody: true, accessToken: 'tok', accountId: 'acc-1', locked: true });
    expect(full.Authorization).toBe('Bearer tok');
    expect(full['X-Account-Id']).toBe('acc-1');
    expect(full['X-Locked']).toBe('1');
  });
});

describe('api schema validation', () => {
  const schema = z.object({ ok: z.literal(true) });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a good body against the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await expect(api.get('/whatever', { schema })).resolves.toEqual({ ok: true });
  });

  it('throws ApiError bad_response when the body fails the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 200 })),
    );

    const error = await api.get('/whatever', { schema }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as InstanceType<typeof ApiError>).status).toBe(502);
    expect((error as InstanceType<typeof ApiError>).code).toBe('bad_response');
  });
});

describe('401 retry-with-refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    kv.clear();
  });

  it('does not attempt a refresh-retry for /auth/* calls, so a wrong caregiver password never wipes an unrelated active session', async () => {
    kv.set('auth_tokens', { access_token: 'a', refresh_token: 'r', expires_in: 900, obtained_at: Date.now() });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'invalid_credentials' } }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await api.post('/auth/login', { email: 'a@b.com', password: 'wrong' }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(kv.get('auth_tokens')).not.toBeNull();
  });

  it('does attempt a refresh-retry for a non-auth 401, using the cached refresh token', async () => {
    kv.set('auth_tokens', { access_token: 'stale', refresh_token: 'r', expires_in: 900, obtained_at: Date.now() });
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) => {
        if (String(url).includes('/auth/refresh')) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'r2', token_type: 'Bearer', expires_in: 900 }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 401 }));
      });
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/whatever').catch(() => undefined);

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/refresh'))).toBe(true);
  });

  it('refreshes once for parallel 401s, and a rotated-away token does not sign the user out', async () => {
    kv.set('auth_tokens', { access_token: 'stale', refresh_token: 'r', expires_in: 900, obtained_at: Date.now() });
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/auth/refresh')) {
        // Like the server: the first use of 'r' rotates it, any second use is rejected.
        const used = fetchMock.mock.calls.filter(([u]) => String(u).includes('/auth/refresh')).length > 1;
        return Promise.resolve(
          used
            ? new Response(JSON.stringify({ error: { code: 'invalid_refresh' } }), { status: 401 })
            : new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'r2', token_type: 'Bearer', expires_in: 900 }), { status: 200 }),
        );
      }
      const auth = new Headers(init?.headers).get('Authorization');
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: auth === 'Bearer fresh' ? 200 : 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([api.get('/sync/pull?a'), api.get('/sync/pull?b'), api.get('/me')]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'))).toHaveLength(1);
    expect(kv.get('auth_tokens')).toMatchObject({ refresh_token: 'r2' });
  });
});

describe('request timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    kv.clear();
  });

  /** A fetch that never answers, but honours its AbortSignal like the real one. */
  function stalledFetch() {
    return vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
  }

  it('rejects with a TimeoutError (a TypeError, like an offline fetch) after the default 20s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalledFetch());

    const pending = api.get('/me').catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(19_999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('honours opts.timeoutMs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalledFetch());

    const pending = api.get('/me', { timeoutMs: 500 }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBeInstanceOf(TimeoutError);
  });

  it('still lets a caller abort the request, with the abort error rather than a timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalledFetch());
    const ctl = new AbortController();

    const pending = api.get('/me', { signal: ctl.signal }).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(1_000);
    ctl.abort();
    const error = await pending;
    expect(error).not.toBeInstanceOf(TimeoutError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('does not touch a fast response, and leaves no timer behind', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));

    await expect(api.get('/me')).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the tokens when the refresh itself times out', async () => {
    kv.set('auth_tokens', { access_token: 'stale', refresh_token: 'r', expires_in: 900, obtained_at: Date.now() });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        String(url).includes('/auth/refresh')
          ? Promise.reject(new TypeError('timed out'))
          : Promise.resolve(new Response(JSON.stringify({}), { status: 401 })),
      ),
    );

    await api.get('/me').catch(() => undefined);

    expect(kv.get('auth_tokens')).toMatchObject({ refresh_token: 'r' });
  });
});
