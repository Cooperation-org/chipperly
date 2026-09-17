// technical-plan.md "Base path": next/link and next/font prefix themselves;
// raw fetch/src URLs and the service worker registration do not, so those
// go through withBase()/apiBase here.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? '';

export const apiBase = `${apiOrigin}${basePath}/api`;

/** Prefix a root-relative path with the configured base path. */
export function withBase(path: string): string {
  return `${basePath}${path}`;
}
