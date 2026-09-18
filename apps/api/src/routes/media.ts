import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { uuidSchema } from '@chipperly/shared/schemas/common';
import type { MediaUploadResponse } from '@chipperly/shared/schemas/media';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { media } from '../db/schema/media.js';
import { processImage, processVideo } from '../media/pipeline.js';
import { getStorageDriver, S3Driver } from '../media/storage.js';
import { videoQueue } from '../media/queue.js';
import { requireAccount, requireUser } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']);

/** Content-type first; falls back to sniffing magic bytes for a generic/missing content type. */
function detectKind(mimetype: string, buffer: Buffer): 'image' | 'video' | null {
  const normalized = mimetype.toLowerCase();
  if (IMAGE_MIME_TYPES.has(normalized)) return 'image';
  if (VIDEO_MIME_TYPES.has(normalized)) return 'video';
  return sniffKind(buffer);
}

function sniffKind(buffer: Buffer): 'image' | 'video' | null {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image'; // PNG
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image'; // JPEG
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'GIF8') {
    return 'image'; // GIF
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image'; // WebP
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    // ISO base media file format box: HEIC brands are images, everything else in this family (mp4, mov/qt) is video.
    const brand = buffer.subarray(8, 12).toString('ascii');
    const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);
    return heicBrands.has(brand) ? 'image' : 'video';
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'video'; // EBML header: webm/mkv
  }
  return null;
}

function mediaUrl(id: string): string {
  return `${env.BASE_PATH}/api/media/${id}`;
}

export default async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/media', { preHandler: [requireUser, requireAccount] }, async (
    request,
    reply,
  ): Promise<MediaUploadResponse | { id: string; status: 'processing' }> => {
    const user = request.user;
    const accountId = request.accountId;
    if (!user || !accountId) throw new AppError(401, 'unauthorized', 'Sign-in required');

    const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
    if (!file) throw new AppError(400, 'missing_file', 'multipart field "file" is required');

    const buffer = await file.toBuffer();
    if (file.file.truncated) throw new AppError(413, 'file_too_large', 'File exceeds 50MB');

    const kind = detectKind(file.mimetype, buffer);
    if (kind === null) {
      throw new AppError(415, 'unsupported_media_type', `Unsupported content type: ${file.mimetype}`);
    }

    const mediaId = randomUUID();
    const createdAt = Date.now();

    if (kind === 'image') {
      const processed = await processImage(buffer);
      const key = `${accountId}/${mediaId}.webp`;
      await getStorageDriver().put(key, processed.buffer, processed.content_type);
      await db.insert(media).values({
        id: mediaId,
        account_id: accountId,
        kind: 'image',
        status: 'ready',
        storage_key: key,
        content_type: processed.content_type,
        width: processed.width,
        height: processed.height,
        duration_ms: null,
        bytes: processed.buffer.length,
        original_bytes: buffer.length,
        created_by: user.id,
        created_at: createdAt,
      });
      reply.code(201);
      return {
        id: mediaId,
        url: mediaUrl(mediaId),
        kind: 'image',
        status: 'ready',
        width: processed.width,
        height: processed.height,
        bytes: processed.buffer.length,
      };
    }

    // Video: write to a temp file, insert a `processing` row, transcode off the request in the queue.
    const tmpIn = path.join(os.tmpdir(), `chipperly-upload-${mediaId}${path.extname(file.filename) || '.mp4'}`);
    await writeFile(tmpIn, buffer);

    await db.insert(media).values({
      id: mediaId,
      account_id: accountId,
      kind: 'video',
      status: 'processing',
      storage_key: '',
      content_type: file.mimetype,
      width: null,
      height: null,
      duration_ms: null,
      bytes: 0,
      original_bytes: buffer.length,
      created_by: user.id,
      created_at: createdAt,
    });

    void videoQueue.add(() => runVideoJob(mediaId, accountId, tmpIn));

    reply.code(202);
    return { id: mediaId, status: 'processing' };
  });

  app.get('/media/:id', { exposeHeadRoute: false }, mediaGetHandler);
  app.head('/media/:id', mediaGetHandler);
}

async function runVideoJob(mediaId: string, accountId: string, tmpIn: string): Promise<void> {
  const tmpOut = `${tmpIn}.out.mp4`;
  try {
    await processVideo(tmpIn, tmpOut);
    const outBuffer = await readFile(tmpOut);
    const key = `${accountId}/${mediaId}.mp4`;
    await getStorageDriver().put(key, outBuffer, 'video/mp4');
    await db
      .update(media)
      .set({ status: 'ready', storage_key: key, content_type: 'video/mp4', bytes: outBuffer.length })
      .where(eq(media.id, mediaId));
  } catch {
    await db.update(media).set({ status: 'failed' }).where(eq(media.id, mediaId));
  } finally {
    await Promise.allSettled([unlink(tmpIn), unlink(tmpOut)]);
  }
}

const paramsSchema = z.object({ id: uuidSchema });

/** Public: media ids are unguessable uuids. Shared by GET and HEAD so headers stay identical. */
async function mediaGetHandler(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  const { id } = paramsSchema.parse(request.params);

  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row || row.status !== 'ready') {
    throw new AppError(404, 'not_found', 'Media not found');
  }

  const driver = getStorageDriver();
  if (driver instanceof S3Driver && env.MEDIA_PUBLIC_BASE) {
    return reply.code(302).header('Location', driver.publicUrl(row.storage_key)).send();
  }

  const object = await driver.get(row.storage_key);
  if (!object) throw new AppError(404, 'not_found', 'Media not found');

  reply
    .header('Content-Type', object.contentType)
    .header('Cache-Control', 'public, max-age=31536000, immutable')
    .header('ETag', row.id)
    .header('Content-Length', String(object.size));

  if (request.method === 'HEAD') {
    object.stream.destroy();
    return reply.send();
  }
  return reply.send(object.stream);
}
