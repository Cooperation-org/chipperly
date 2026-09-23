import { describe, expect, it } from 'vitest';
import type { MediaBlobEntry } from '../db/db';
import { localMediaBlob } from './upload';

describe('localMediaBlob', () => {
  it('reads the current bytes/type rows', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const blob = localMediaBlob({ media_id: 'a', bytes, type: 'image/jpeg', uploaded: 1 });
    expect(blob?.type).toBe('image/jpeg');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('reads a row written before ArrayBuffer storage, which held a Blob in `blob`', () => {
    const legacy = { media_id: 'a', blob: new Blob([new Uint8Array([9])], { type: 'image/jpeg' }), uploaded: 1 };
    expect(localMediaBlob(legacy as unknown as MediaBlobEntry)?.size).toBe(1);
  });

  it('returns null for a row with nothing usable, so the caller falls back to the server copy', () => {
    // `new Blob([undefined])` would quietly make a blob of the text "undefined": a broken image.
    expect(localMediaBlob({ media_id: 'a', uploaded: 1 } as unknown as MediaBlobEntry)).toBeNull();
    expect(localMediaBlob(undefined)).toBeNull();
  });
});
