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
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('pickAndStoreImage: encode failed');

  const media_id = newId();
  await db.media_blobs.put({ media_id, blob, uploaded: 0 });
  return media_id;
}

/** Object URL from the local blob if we have it (revoked on unmount/change), else the API route. */
export function useMediaUrl(mediaId: string | null | undefined): string | null {
  const row = useLiveQuery(() => (mediaId ? db.media_blobs.get(mediaId) : undefined), [mediaId]);
  const objectUrl = useMemo(() => (row ? URL.createObjectURL(row.blob) : null), [row]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  if (!mediaId) return null;
  return row ? objectUrl : withBase(`/api/media/${mediaId}`);
}
