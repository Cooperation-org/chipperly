'use client';

import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { newId } from '../ids';
import { withBase } from '../api/base';

export { uploadPending } from '../media/upload';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/** Resizes to at most 1600px on the long edge, stores the JPEG blob locally, queues it for upload. */
export async function pickAndStoreImage(file: File | Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('pickAndStoreImage: canvas 2d context unavailable');
  // JPEG has no alpha: without a fill, a transparent PNG (clip art, logos) encodes with a black background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('pickAndStoreImage: encode failed');

  const media_id = newId();
  const bytes = await blob.arrayBuffer();
  await db.media_blobs.put({ media_id, bytes, type: blob.type, uploaded: 0 });
  return media_id;
}

/** Object URL from the local bytes if we have them (revoked on unmount/change), else the API route. */
export function useMediaUrl(mediaId: string | null | undefined): string | null {
  const row = useLiveQuery(() => (mediaId ? db.media_blobs.get(mediaId) : undefined), [mediaId]);
  const objectUrl = useMemo(() => (row ? URL.createObjectURL(new Blob([row.bytes], { type: row.type })) : null), [row]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  if (!mediaId) return null;
  // Falls through to the API route both when there's no local row yet (a
  // caregiver's other device) and when there is one but it couldn't be
  // turned into a blob -- never gets stuck showing nothing for a row that
  // exists but is unusable.
  return objectUrl ?? withBase(`/api/media/${mediaId}`);
}
