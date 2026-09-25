import { revalidatePath } from 'next/cache';

// Payload hooks also run from the seed script, outside a Next request, where
// revalidatePath throws. Nothing is cached there, so skipping is correct.
/** Every page: for changes that show in the shared layout (Site settings). */
export function revalidateAll() {
  try {
    revalidatePath('/', 'layout');
  } catch {
    // not inside Next
  }
}

export function revalidate(...paths: string[]) {
  try {
    for (const path of paths) revalidatePath(path);
    revalidatePath('/sitemap.xml');
    revalidatePath('/blog/rss.xml');
    revalidatePath('/llms.txt');
    revalidatePath('/llms-full.txt');
  } catch {
    // not inside Next
  }
}
