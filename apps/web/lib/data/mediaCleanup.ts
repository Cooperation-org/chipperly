export interface BlobRef {
  media_id: string;
  uploaded: 0 | 1;
}

/**
 * The media_ids safe to delete: uploaded AND not found as a string anywhere in
 * `rows`. Every string value at any depth counts as a reference (no field-name
 * list to fall out of date), so an over-match only ever keeps a blob.
 */
export function collectUnreferencedUploaded(blobs: readonly BlobRef[], rows: Iterable<unknown>): string[] {
  const candidates = new Set(blobs.filter((b) => b.uploaded === 1).map((b) => b.media_id));
  const walk = (value: unknown): void => {
    if (candidates.size === 0) return;
    if (typeof value === 'string') candidates.delete(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object' && !(value instanceof ArrayBuffer)) Object.values(value).forEach(walk);
  };
  for (const row of rows) walk(row);
  return [...candidates];
}
