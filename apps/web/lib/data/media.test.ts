import { afterEach, describe, expect, it, vi } from 'vitest';

const { put } = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock('../db/db', () => ({ db: { media_blobs: { put } } }));

import { pickAndStoreImage } from './media';
import { CANT_OPEN_PHOTO, PhotoDecodeError } from '../media/imageFile';

afterEach(() => vi.unstubAllGlobals());

describe('pickAndStoreImage', () => {
  it('stores nothing and says so when the browser cannot decode the file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('decode', 'InvalidStateError')));
    const heic = new File(['x'], 'IMG_1.HEIC', { type: '' });
    const err = await pickAndStoreImage(heic).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PhotoDecodeError);
    expect((err as Error).message).toBe(CANT_OPEN_PHOTO);
    expect(put).not.toHaveBeenCalled();
  });
});
