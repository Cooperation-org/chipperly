import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { buildTestApp, request } from './helpers.js';
import { db } from '../src/db/client.js';
import { users } from '../src/db/schema/accounts.js';
import { issueTokens } from '../src/lib/tokens.js';
import { env } from '../src/env.js';
import { isPrivateAddress, licenseLabel, resetOpenverseCache } from '../src/lib/openverse.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const IMAGE_ID = '11111111-1111-4111-8111-111111111111';
const PUBLIC_URL = 'https://93.184.216.34/cat.png'; // literal public IP: no DNS in tests

function raw(over: Record<string, unknown> = {}) {
  return {
    id: IMAGE_ID,
    title: 'A cat',
    creator: 'Jo',
    license: 'by',
    license_version: '4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    url: PUBLIC_URL,
    thumbnail: 'https://api.openverse.org/v1/images/x/thumb/',
    foreign_landing_url: 'https://example.org/cat',
    attribution: '"A cat" by Jo is licensed under CC BY 4.0.',
    width: 100,
    height: 50,
    ...over,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const png = (headers: Record<string, string> = {}) =>
  new Response(PNG, { status: 200, headers: { 'content-type': 'image/png', ...headers } });

/** Routes a mocked fetch by URL; the returned array records every URL it saw. */
function mockFetch(handlers: {
  token?: () => Response;
  search?: () => Response;
  detail?: () => Response;
  image?: () => Response;
}): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/auth_tokens/token/')) {
        return (handlers.token ?? (() => json({ access_token: 'tok', expires_in: 43200 })))();
      }
      if (url.includes('/v1/images/?')) {
        return (handlers.search ?? (() => json({ results: [raw()], result_count: 1, page_count: 1 })))();
      }
      if (url.includes('/v1/images/')) return (handlers.detail ?? (() => json(raw())))();
      return (handlers.image ?? (() => png()))();
    }),
  );
  return calls;
}

describe('licenseLabel and isPrivateAddress', () => {
  it('labels licenses', () => {
    expect(licenseLabel('by', '4.0')).toBe('CC BY 4.0');
    expect(licenseLabel('by-sa', '2.0')).toBe('CC BY-SA 2.0');
    expect(licenseLabel('cc0', '1.0')).toBe('CC0 1.0');
  });
  it('flags non-public addresses', () => {
    const priv = ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0'];
    for (const ip of priv) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});

async function newAuth(): Promise<{ authorization: string }> {
  const id = uuidv7();
  await db.insert(users).values({ id, email: `img-${id}@example.com`, display_name: 'Img', created_at: Date.now() });
  return { authorization: `Bearer ${(await issueTokens(id)).access_token}` };
}

describe('image search routes', () => {
  let app: FastifyInstance;
  let auth: { authorization: string };
  const saved = { enabled: env.openverseEnabled, id: env.OPENVERSE_CLIENT_ID, secret: env.OPENVERSE_CLIENT_SECRET };

  function enable(): void {
    env.openverseEnabled = true;
    env.OPENVERSE_CLIENT_ID = 'cid';
    env.OPENVERSE_CLIENT_SECRET = 'csecret';
  }

  beforeAll(async () => {
    app = await buildTestApp();
    auth = await newAuth();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetOpenverseCache();
    env.openverseEnabled = saved.enabled;
    env.OPENVERSE_CLIENT_ID = saved.id;
    env.OPENVERSE_CLIENT_SECRET = saved.secret;
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => request(app, { method: 'GET', url: `/api${url}`, headers: auth });
  const importImg = (id = IMAGE_ID) =>
    request(app, { method: 'POST', url: '/api/images/import', headers: auth, payload: { id } });

  it('is off without credentials: status says so, search and import 404', async () => {
    const status = await request(app, { method: 'GET', url: '/api/images/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ enabled: false });
    expect((await get('/images/search?q=cat')).statusCode).toBe(404);
    expect((await importImg()).statusCode).toBe(404);
  });

  it('status reports enabled once configured', async () => {
    enable();
    expect((await request(app, { method: 'GET', url: '/api/images/status' })).json()).toEqual({ enabled: true });
  });

  it('requires a signed-in user', async () => {
    enable();
    expect((await request(app, { method: 'GET', url: '/api/images/search?q=cat' })).statusCode).toBe(401);
  });

  it('maps results, sends the license filter, and never leaks the credentials', async () => {
    enable();
    const calls = mockFetch({});
    const res = await get('/images/search?q=Cat');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      results: [
        {
          id: IMAGE_ID,
          title: 'A cat',
          creator: 'Jo',
          license: 'CC BY 4.0',
          license_url: 'https://creativecommons.org/licenses/by/4.0/',
          thumbnail: 'https://api.openverse.org/v1/images/x/thumb/',
          attribution: '"A cat" by Jo is licensed under CC BY 4.0.',
          landing_url: 'https://example.org/cat',
          width: 100,
          height: 50,
        },
      ],
      total: 1,
      page: 1,
      page_count: 1,
    });
    expect(res.body).not.toContain('csecret');
    const search = calls.find((c) => c.includes('/v1/images/?')) ?? '';
    expect(search).toContain('license_type=commercial%2Cmodification');
    expect(search).toContain('mature=false');
    expect(search).toContain('page_size=24');
  });

  it('caches the token and the search results', async () => {
    enable();
    const calls = mockFetch({});
    await get('/images/search?q=dog');
    await get('/images/search?q=%20DOG%20'); // same normalized query: cache hit
    await get('/images/search?q=dog&page=2'); // new page: new search, same token
    expect(calls.filter((c) => c.includes('/auth_tokens/token/'))).toHaveLength(1);
    expect(calls.filter((c) => c.includes('/v1/images/?'))).toHaveLength(2);
  });

  it('answers a friendly busy error when Openverse rate limits or fails', async () => {
    enable();
    mockFetch({ search: () => json({}, 429) });
    const res = await get('/images/search?q=bird');
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('image_search_busy');
    resetOpenverseCache();
    mockFetch({ token: () => json({}, 500) });
    expect((await get('/images/search?q=fish')).json().error.code).toBe('image_search_busy');
  });

  it('rate limits search per user', async () => {
    enable();
    mockFetch({});
    const fresh = await newAuth(); // its own counter: the other tests share `auth`
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) {
      codes.push((await request(app, { method: 'GET', url: '/api/images/search?q=cat', headers: fresh })).statusCode);
    }
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes[30]).toBe(429);
  });

  it('imports bytes with the attribution header', async () => {
    enable();
    const calls = mockFetch({});
    const res = await importImg();
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(decodeURIComponent(String(res.headers['x-image-attribution']))).toBe('"A cat" by Jo is licensed under CC BY 4.0.');
    expect(decodeURIComponent(String(res.headers['x-image-source']))).toBe('https://example.org/cat');
    expect(res.rawPayload.equals(PNG)).toBe(true);
    expect(calls).toContain(PUBLIC_URL);
  });

  it('rejects a body that is not an Openverse id', async () => {
    enable();
    mockFetch({});
    const res = await request(app, {
      method: 'POST',
      url: '/api/images/import',
      headers: auth,
      payload: { id: 'http://169.254.169.254/' },
    });
    expect(res.statusCode).toBe(400);
  });

  it.each([
    ['plain http', { url: 'http://93.184.216.34/cat.png' }],
    ['loopback', { url: 'https://127.0.0.1/cat.png' }],
    ['localhost', { url: 'https://localhost/cat.png' }],
    ['private v4', { url: 'https://10.0.0.5/cat.png' }],
    ['metadata address', { url: 'https://169.254.169.254/latest' }],
    ['private v6', { url: 'https://[::1]/cat.png' }],
    ['non-commercial license', { license: 'by-nc' }],
    ['mature', { mature: true }],
  ])('refuses to import: %s', async (_name, over) => {
    enable();
    const calls = mockFetch({ detail: () => json(raw(over)) });
    const res = await importImg();
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('bad_image');
    expect(calls.filter((c) => !c.includes('openverse.org'))).toHaveLength(0);
  });

  it('refuses a redirect to a private host', async () => {
    enable();
    mockFetch({ image: () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/x.png' } }) });
    expect((await importImg()).statusCode).toBe(422);
  });

  it('refuses the wrong content type', async () => {
    enable();
    mockFetch({ image: () => new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }) });
    expect((await importImg()).statusCode).toBe(422);
  });

  it('refuses an oversize image, by header and by streamed size', async () => {
    enable();
    mockFetch({ image: () => png({ 'content-length': String(9 * 1024 * 1024) }) });
    expect((await importImg()).statusCode).toBe(422);
    mockFetch({
      image: () => new Response(Buffer.alloc(9 * 1024 * 1024), { status: 200, headers: { 'content-type': 'image/png' } }),
    });
    expect((await importImg()).statusCode).toBe(422);
  });
});
