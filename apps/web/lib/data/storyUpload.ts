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

/** Turns picked images into a new story (stored locally and queued for upload like any other picture). */
export async function createFromImages(profileId: string, files: File[]): Promise<string> {
  const sorted = sortUploadFiles(files);
  const ids: string[] = [];
  for (const file of sorted) ids.push(await pickAndStoreImage(file));
  return saveStory({
    profile_id: profileId,
    title: titleFromFileName(sorted[0]?.name ?? ''),
    emoji: null,
    cover_photo_id: ids[0] ?? null,
    pages: pagesFromMedia(ids),
  });
}
