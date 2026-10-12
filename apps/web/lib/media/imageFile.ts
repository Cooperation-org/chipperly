/** Shown when the browser can't decode a picked photo (HEIC on Chrome desktop, for one). */
export const CANT_OPEN_PHOTO = "This photo type can't be opened on this device. Try a JPG or PNG.";

/** The picked file isn't a picture this browser can draw, so nothing was saved. */
export class PhotoDecodeError extends Error {
  constructor() {
    super(CANT_OPEN_PHOTO);
    this.name = 'PhotoDecodeError';
  }
}

const IMAGE_EXTENSION = /\.(heic|heif|jpe?g|png|gif|webp|avif|bmp)$/i;

/**
 * A picture by its MIME type, or by its extension when the browser gave no useful type
 * (iPhone HEIC files often arrive with an empty type or application/octet-stream).
 */
export function isImageFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith('image/')) return true;
  if (file.type && file.type !== 'application/octet-stream') return false;
  return IMAGE_EXTENSION.test(file.name);
}
