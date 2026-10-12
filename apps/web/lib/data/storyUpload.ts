import { pickAndStoreImage } from './media';
import { saveStory } from './stories';
import { isImageFile, PhotoDecodeError } from '../media/imageFile';

/** Image files (by type, or by extension when the type is blank) in page order: natural sort, so "page2" comes before "page10". */
export function sortUploadFiles<T extends { name: string; type: string }>(files: T[]): T[] {
  return files
    .filter(isImageFile)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Story title from the first file name: extension and "page 1" style tails dropped. */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/(?:^|[\s_-]+)(?:page|p)?[\s_-]*\d+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base || 'Uploaded story';
}

/** One story page per picture; the first picture is also the cover. */
export function pagesFromMedia(mediaIds: string[]): { text: string; emoji: null; photo_id: string }[] {
  return mediaIds.map((photo_id) => ({ text: '', emoji: null, photo_id }));
}

/**
 * Turns picked images into a new story (stored locally and queued for upload like any other picture).
 * Null when none of the files is a picture (a PDF picked through "All files"), so no empty story is made.
 * A picture that cannot be read is left out and counted in `skipped`; one this browser can't decode (HEIC on
 * Chrome desktop) is also named in `cantOpen`. Throws only when none could be read.
 */
export async function createFromImages(
  profileId: string,
  files: File[],
): Promise<{ storyId: string; skipped: number; cantOpen: string[] } | null> {
  const sorted = sortUploadFiles(files);
  if (sorted.length === 0) return null;
  const ids: string[] = [];
  const cantOpen: string[] = [];
  for (const file of sorted) {
    try {
      ids.push(await pickAndStoreImage(file));
    } catch (err) {
      // Left out; the caller says how many.
      if (err instanceof PhotoDecodeError) cantOpen.push(file.name);
    }
  }
  if (ids.length === 0) throw cantOpen.length === sorted.length ? new PhotoDecodeError() : new Error('No picture could be read');
  const storyId = await saveStory({
    profile_id: profileId,
    title: titleFromFileName(sorted[0]?.name ?? ''),
    emoji: null,
    cover_photo_id: ids[0] ?? null,
    pages: pagesFromMedia(ids),
  });
  return { storyId, skipped: sorted.length - ids.length, cantOpen };
}
