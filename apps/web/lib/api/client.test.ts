import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// request() reads tokens/account/lock state from lib/db/kv before every call; stubbed (vi.mock
// calls are hoisted above this import) so this file never touches the real Dexie/IndexedDB,
// which isn't available in the node test environment.
vi.mock('../db/kv', () => ({
  getKv: vi.fn().mockResolvedValue(undefined),
  setKv: vi.fn().mockResolvedValue(undefined),
}));

import { api, ApiError, buildHeaders } from './client';

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
