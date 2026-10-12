import { describe, expect, it } from 'vitest';
import { isImageFile } from './imageFile';

describe('isImageFile', () => {
  it('trusts an image MIME type', () => {
    expect(isImageFile({ name: 'x', type: 'image/png' })).toBe(true);
    expect(isImageFile({ name: 'IMG_1.HEIC', type: 'image/heic' })).toBe(true);
  });

  it('falls back to the extension when the type is empty or octet-stream', () => {
    expect(isImageFile({ name: 'IMG_1.HEIC', type: '' })).toBe(true);
    expect(isImageFile({ name: 'IMG_2.heif', type: 'application/octet-stream' })).toBe(true);
    expect(isImageFile({ name: 'page.jpeg', type: '' })).toBe(true);
    expect(isImageFile({ name: 'notes.txt', type: '' })).toBe(false);
  });

  it('does not guess past a real non-image type', () => {
    expect(isImageFile({ name: 'story.pdf', type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ name: 'fake.heic', type: 'application/pdf' })).toBe(false);
  });
});
