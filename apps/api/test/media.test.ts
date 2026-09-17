import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { buildTestApp, request } from './helpers.js';
import { setupProfile } from './fixtures.js';

function buildMultipart(fieldName: string, filename: string, contentType: string, data: Buffer): { body: Buffer; contentType: string } {
  const boundary = `----chipperlyTestBoundary${Math.random().toString(16).slice(2)}`;
  const preamble = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(preamble, 'utf8'), data, Buffer.from(epilogue, 'utf8')]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('media', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('compresses an uploaded PNG to WebP and serves it back with immutable cache headers', async () => {
    const { admin, accountId } = await setupProfile();

    const png = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const { body, contentType } = buildMultipart('file', 'swatch.png', 'image/png', png);
    const upload = await request(app, {
      method: 'POST',
      url: '/api/media',
      headers: { authorization: `Bearer ${admin.token}`, 'x-account-id': accountId, 'content-type': contentType },
      payload: body,
    });

    expect(upload.statusCode).toBe(201);
    const uploaded = upload.json() as {
      id: string;
      url: string;
      kind: string;
      status: string;
      width: number;
      height: number;
      bytes: number;
    };
    expect(uploaded.kind).toBe('image');
    expect(uploaded.status).toBe('ready');
    expect(uploaded.width).toBe(20);
    expect(uploaded.height).toBe(20);
    expect(uploaded.bytes).toBeGreaterThan(0);
    expect(uploaded.url).toBe(`/api/media/${uploaded.id}`);

    const fetched = await request(app, { method: 'GET', url: uploaded.url });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.headers['content-type']).toBe('image/webp');
    expect(fetched.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(fetched.headers.etag).toBe(uploaded.id);
    // WebP magic bytes: 'RIFF'....'WEBP'.
    const bytes = fetched.rawPayload;
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');

    const head = await request(app, { method: 'HEAD', url: uploaded.url });
    expect(head.statusCode).toBe(200);
    expect(head.headers['content-type']).toBe('image/webp');
    expect(head.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('rejects an unsupported content type with 415', async () => {
    const { admin, accountId } = await setupProfile();
    const { body, contentType } = buildMultipart('file', 'notes.txt', 'text/plain', Buffer.from('just some plain text, not media'));

    const upload = await request(app, {
      method: 'POST',
      url: '/api/media',
      headers: { authorization: `Bearer ${admin.token}`, 'x-account-id': accountId, 'content-type': contentType },
      payload: body,
    });

    expect(upload.statusCode).toBe(415);
  });

  it('404s a media id that was never uploaded', async () => {
    const missing = await request(app, {
      method: 'GET',
      url: '/api/media/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
  });
});
