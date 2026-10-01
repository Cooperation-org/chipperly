import type { ImageCredit, ProfileSettings } from '@chipperly/shared/schemas/profile';
import { api, ApiError, getTokens } from './api/client';
import { apiBase } from './api/base';
import { isGuestMode } from './auth/guest';
import { getKv } from './db/kv';
import { collectUnreferencedUploaded } from './data/mediaCleanup';

/** One search hit, as GET /images/search returns it (apps/api/src/lib/openverse.ts). */
export interface ImageResult {
  id: string;
  title: string;
  creator: string | null;
  license: string;
  license_url: string | null;
  thumbnail: string | null;
  attribution: string;
  landing_url: string | null;
  width: number | null;
  height: number | null;
}

export interface ImageSearchPage {
  results: ImageResult[];
  total: number;
  page: number;
  page_count: number;
}

export const BUSY_MESSAGE = 'Image search is busy. Try again in a minute.';

export function searchPath(query: string, page: number): string {
  return `/images/search?q=${encodeURIComponent(query.trim())}&page=${page}`;
}

/** Appends a page of results, dropping any a later page repeats. */
export function mergeResults(prev: readonly ImageResult[], next: readonly ImageResult[]): ImageResult[] {
  const seen = new Set(prev.map((r) => r.id));
  return [...prev, ...next.filter((r) => !seen.has(r.id))];
}

/** The credit the import route sends back in its headers (URL-encoded, so they survive any character). */
export function creditFromHeaders(headers: Pick<Headers, 'get'>): ImageCredit | null {
  const text = decodeURIComponent(headers.get('X-Image-Attribution') ?? '').trim();
  if (!text) return null;
  const url = decodeURIComponent(headers.get('X-Image-Source') ?? '').trim();
  return { text, url: url || null };
}

export function withCredit(settings: ProfileSettings, mediaId: string, credit: ImageCredit): ProfileSettings {
  return { ...settings, image_credits: { ...settings.image_credits, [mediaId]: credit } };
}

/**
 * Credits whose picture is still used somewhere in `rows` (an old pick that was since replaced
 * or removed drops out). Same "any string anywhere" reference test the blob cleanup uses.
 */
export function creditsInUse(
  credits: ProfileSettings['image_credits'],
  rows: Iterable<unknown>,
): Array<ImageCredit & { media_id: string }> {
  const entries = Object.entries(credits ?? {});
  const unused = new Set(
    collectUnreferencedUploaded(
      entries.map(([media_id]) => ({ media_id, uploaded: 1 as const })),
      rows,
    ),
  );
  return entries.filter(([id]) => !unused.has(id)).map(([media_id, credit]) => ({ media_id, ...credit }));
}

// Remembered for the tab: the answer only changes when the owner sets the keys and restarts the server.
let enabledCache: boolean | undefined;

/** Whether the server has image search on. False for guests and when the check can't be made (offline); only a real answer is remembered. */
export async function imageSearchEnabled(): Promise<boolean> {
  if (isGuestMode()) return false;
  if (enabledCache !== undefined) return enabledCache;
  try {
    const { enabled } = await api.get<{ enabled: boolean }>('/images/status');
    enabledCache = enabled === true;
    return enabledCache;
  } catch {
    return false;
  }
}

/** Page 1 or later of results for a query. A 429 (ours or Openverse's) throws an ApiError with BUSY_MESSAGE. */
export function searchImages(query: string, page: number, signal?: AbortSignal): Promise<ImageSearchPage> {
  return api.get<ImageSearchPage>(searchPath(query, page), { signal });
}

/** Downloads a result through the server (never a client-chosen URL) as a File ready for pickAndStoreImage. */
export async function importImage(id: string): Promise<{ file: File; credit: ImageCredit | null }> {
  const tokens = await getTokens();
  const accountId = await getKv<string>('active_account_id');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tokens?.access_token) headers.Authorization = `Bearer ${tokens.access_token}`;
  if (accountId) headers['X-Account-Id'] = accountId;
  const res = await fetch(`${apiBase}/images/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, payload?.error?.code ?? 'unknown_error', payload?.error?.message);
  }
  const blob = await res.blob();
  return { file: new File([blob], 'image', { type: blob.type }), credit: creditFromHeaders(res.headers) };
}
