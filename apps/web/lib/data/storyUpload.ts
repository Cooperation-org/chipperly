import { pickAndStoreImage } from './media';
import { saveStory } from './stories';

/** Image files in page order: natural filename sort, so "page2" comes before "page10". */
export function sortUploadFiles<T extends { name: string; type: string }>(files: T[]): T[] {
  return files
    .filter((f) => f.type.startsWith('image/'))
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
 * A picture that cannot be read is left out and counted in `skipped`; throws only when none could be read.
 */
export async function createFromImages(
  profileId: string,
  files: File[],
): Promise<{ storyId: string; skipped: number } | null> {
  const sorted = sortUploadFiles(files);
  if (sorted.length === 0) return null;
  const ids: string[] = [];
  for (const file of sorted) {
    try {
      ids.push(await pickAndStoreImage(file));
    } catch {
      // Left out; the caller says how many.
    }
  }
  if (ids.length === 0) throw new Error('No picture could be read');
  const storyId = await saveStory({
    profile_id: profileId,
    title: titleFromFileName(sorted[0]?.name ?? ''),
    emoji: null,
    cover_photo_id: ids[0] ?? null,
    pages: pagesFromMedia(ids),
  });
  return { storyId, skipped: sorted.length - ids.length };
}
