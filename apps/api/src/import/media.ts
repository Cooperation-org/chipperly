import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { media } from '../db/schema/media.js';
import { processImage } from '../media/pipeline.js';
import { getStorageDriver, S3Driver } from '../media/storage.js';
import { railsId } from './ids.js';
import type { RailsActiveStorageAttachmentRow, RailsActiveStorageBlobRow } from './types.js';

/** Whatever `db.transaction(cb)` hands its callback; same alias as importRails.ts. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Where to read Rails Active Storage blob bytes from. `undefined` means no
 * `--rails-storage-dir`/`--rails-s3-*` flag was given at all — every
 * attachment is then counted but never fetched (see `resolveMediaId`).
 */
export type RailsMediaSource =
  | { readonly kind: 'disk'; readonly root: string }
  | { readonly kind: 's3'; readonly driver: S3Driver };

export interface RailsMediaSourceOptions {
  readonly railsStorageDir?: string;
  readonly railsS3Endpoint?: string;
  readonly railsS3Bucket?: string;
  readonly railsS3AccessKey?: string;
  readonly railsS3Secret?: string;
  readonly railsS3Region?: string;
}

/** Builds the Rails blob source from CLI flags, or `undefined` when none were given. */
export function openRailsMediaSource(opts: RailsMediaSourceOptions): RailsMediaSource | undefined {
  if (opts.railsStorageDir) return { kind: 'disk', root: opts.railsStorageDir };
  const s3Flags = [opts.railsS3Endpoint, opts.railsS3Bucket, opts.railsS3AccessKey, opts.railsS3Secret];
  if (s3Flags.every((v) => v === undefined)) return undefined;
  if (s3Flags.some((v) => v === undefined)) {
    throw new Error('--rails-s3-endpoint, --rails-s3-bucket, --rails-s3-access-key and --rails-s3-secret must all be given together');
  }
  return {
    kind: 's3',
    driver: new S3Driver(opts.railsS3Endpoint!, opts.railsS3Bucket!, opts.railsS3AccessKey!, opts.railsS3Secret!, opts.railsS3Region ?? 'auto'),
  };
}

/**
 * Reads one blob's full bytes from the Rails source. Disk layout is
 * ActiveStorage::Service::DiskService's own: `<root>/<key[0,2]>/<key[2,4]>/<key>`.
 * Throws on any read failure (missing file, network error, ...); callers
 * catch it and count the attachment as skipped rather than aborting the import.
 */
export async function fetchRailsBlob(source: RailsMediaSource, key: string): Promise<Buffer> {
  if (source.kind === 'disk') {
    const filePath = path.join(source.root, key.slice(0, 2), key.slice(2, 4), key);
    return readFile(filePath);
  }
  const object = await source.driver.get(key);
  if (!object) throw new Error(`blob key ${key} not found in Rails S3 source`);
  const chunks: Buffer[] = [];
  for await (const chunk of object.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export interface RailsBlobInfo {
  readonly blob_id: number;
  readonly key: string;
  readonly filename: string;
  readonly content_type: string | null;
}

/** `active_storage_attachments` + `active_storage_blobs`, joined and keyed by `record_type:record_id:name`. */
export function buildAttachmentIndex(
  attachments: readonly RailsActiveStorageAttachmentRow[],
  blobs: readonly RailsActiveStorageBlobRow[],
): ReadonlyMap<string, RailsBlobInfo> {
  const blobById = new Map(blobs.map((b) => [b.id, b]));
  const index = new Map<string, RailsBlobInfo>();
  for (const a of attachments) {
    const blob = blobById.get(a.blob_id);
    if (!blob) continue; // orphaned attachment row (blob deleted); nothing to fetch
    index.set(`${a.record_type}:${a.record_id}:${a.name}`, {
      blob_id: blob.id,
      key: blob.key,
      filename: blob.filename,
      content_type: blob.content_type,
    });
  }
  return index;
}

export interface MediaLookup {
  readonly index: ReadonlyMap<string, RailsBlobInfo>;
  readonly source: RailsMediaSource | undefined;
  readonly dryRun: boolean;
}

export interface MediaResolution {
  readonly media_id: string | null;
}

/**
 * Looks up the Rails attachment for `(recordType, recordId, attachmentName)` and, when a
 * source was given, fetches + processes + stores it, returning the media id to point a
 * `*_photo_id` column at (or `null` when there is nothing to point at).
 *
 * Idempotent: a `media` row already present for this blob is left untouched, only its id
 * is returned so the caller can (re)point the foreign key.
 *
 * Only images are ever processed here: of the seven Rails attachment kinds this importer
 * reads, six are `:photo`/`:image` (this function's whole job); the seventh,
 * `social_stories.video`, has no destination column in our model and is never looked up
 * through this function — see the dedicated video-skip note in `importRails.ts`.
 * ponytail: no video branch/`processVideo` call here because it would never run; add one
 * if a future column gives story videos a home.
 */
export async function resolveMediaId(
  tx: Tx,
  lookup: MediaLookup,
  recordType: string,
  recordId: number,
  attachmentName: string,
  accountId: string,
  adminUserId: string,
  bump: (key: string, n?: number) => void,
  notes: string[],
): Promise<MediaResolution> {
  const blob = lookup.index.get(`${recordType}:${recordId}:${attachmentName}`);
  if (!blob) return { media_id: null };

  const mediaId = railsId('active_storage_blobs', blob.blob_id);

  // Checked first, before the dry-run/no-source branches below: a row already imported by an
  // earlier run (with a source) is only re-pointed, never re-fetched — including on a later dry
  // run, or a later run given no source at all, so that run can't null out a `*_photo_id` a
  // previous run had already resolved.
  const [existing] = await tx.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).limit(1);
  if (existing) {
    bump('media');
    return { media_id: mediaId };
  }

  if (!lookup.source) {
    bump('_media_no_storage');
    return { media_id: null };
  }

  if (lookup.dryRun) {
    bump('media');
    return { media_id: mediaId };
  }

  let raw: Buffer;
  try {
    raw = await fetchRailsBlob(lookup.source, blob.key);
  } catch (err) {
    bump('media_skipped');
    notes.push(`media for ${recordType} ${recordId}: blob ${blob.blob_id} (${blob.filename}) could not be read — ${(err as Error).message}`);
    return { media_id: null };
  }

  try {
    const processed = await processImage(raw);
    const key = `${accountId}/${mediaId}.webp`;
    await getStorageDriver().put(key, processed.buffer, processed.content_type);
    await tx
      .insert(media)
      .values({
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
        original_bytes: raw.length,
        created_by: adminUserId,
        created_at: Date.now(),
      })
      .onConflictDoNothing({ target: media.id });
    bump('media');
    return { media_id: mediaId };
  } catch (err) {
    bump('media_skipped');
    notes.push(`media for ${recordType} ${recordId}: blob ${blob.blob_id} (${blob.filename}) failed processing — ${(err as Error).message}`);
    return { media_id: null };
  }
}
