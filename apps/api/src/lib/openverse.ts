import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { env } from '../env.js';

const API = 'https://api.openverse.org/v1';
export const MAX_PAGE_SIZE = 24;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SEARCH_TTL_MS = 10 * 60_000;
const SEARCH_CACHE_MAX = 200;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/** Failures the route turns into a friendly answer; `busy` = Openverse said 429 or is down. */
export class OpenverseError extends Error {
  constructor(readonly code: 'busy' | 'bad_image' | 'not_found') {
    super(code);
  }
}

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
export interface SearchPage {
  results: ImageResult[];
  total: number;
  page: number;
  page_count: number;
}

interface RawImage {
  id: string;
  title?: string | null;
  creator?: string | null;
  license?: string;
  license_version?: string | null;
  license_url?: string | null;
  url?: string;
  thumbnail?: string | null;
  foreign_landing_url?: string | null;
  attribution?: string | null;
  mature?: boolean;
  width?: number | null;
  height?: number | null;
}

/** 'by' + '4.0' -> 'CC BY 4.0'; cc0 and pdm read as their own names. */
export function licenseLabel(license: string | undefined, version?: string | null): string {
  const l = (license ?? '').toLowerCase();
  if (l === 'cc0') return 'CC0 1.0';
  if (l === 'pdm') return 'Public Domain';
  if (!l) return 'Unknown license';
  return `CC ${l.toUpperCase()}${version ? ` ${version}` : ''}`;
}

/** Links handed to the browser must be https; anything else is dropped rather than trusted. */
function httpsOrNull(url: string | null | undefined): string | null {
  return url?.startsWith('https://') ? url : null;
}

export function mapImage(raw: RawImage): ImageResult {
  const license = licenseLabel(raw.license, raw.license_version);
  const title = raw.title?.trim() || 'Untitled';
  return {
    id: raw.id,
    title,
    creator: raw.creator?.trim() || null,
    license,
    license_url: httpsOrNull(raw.license_url),
    thumbnail: httpsOrNull(raw.thumbnail),
    attribution: raw.attribution?.trim() || `"${title}"${raw.creator ? ` by ${raw.creator}` : ''} (${license})`,
    landing_url: httpsOrNull(raw.foreign_landing_url),
    width: raw.width ?? null,
    height: raw.height ?? null,
  };
}

// --- token: one in-flight refresh, reused until a minute before it expires ---
let token: { value: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const res = await fetch(`${API}/auth_tokens/token/`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.OPENVERSE_CLIENT_ID ?? '',
      client_secret: env.OPENVERSE_CLIENT_SECRET ?? '',
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new OpenverseError('busy');
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new OpenverseError('busy');
  token = { value: body.access_token, expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
  return token.value;
}

function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return Promise.resolve(token.value);
  tokenInFlight ??= fetchToken().finally(() => {
    tokenInFlight = null;
  });
  return tokenInFlight;
}

async function apiGet(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw err instanceof OpenverseError ? err : new OpenverseError('busy');
  }
  if (res.status === 401) token = null; // expired early: the next call fetches a new one
  if (res.status === 404) throw new OpenverseError('not_found');
  if (!res.ok) throw new OpenverseError('busy');
  return res.json();
}

// --- search, with a small TTL cache (insertion order doubles as LRU order) ---
const searchCache = new Map<string, { at: number; value: SearchPage }>();

export async function searchImages(q: string, page: number): Promise<SearchPage> {
  const query = q.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = `${page}:${query}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) {
    searchCache.delete(key);
    searchCache.set(key, hit);
    return hit.value;
  }
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: String(MAX_PAGE_SIZE),
    license_type: 'commercial,modification',
    mature: 'false',
  });
  const raw = (await apiGet(`/images/?${params}`)) as {
    results?: RawImage[];
    result_count?: number;
    page_count?: number;
  };
  const value: SearchPage = {
    results: (raw.results ?? []).filter((r) => !r.mature).map(mapImage),
    total: raw.result_count ?? 0,
    page,
    page_count: raw.page_count ?? 0,
  };
  searchCache.set(key, { at: Date.now(), value });
  if (searchCache.size > SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value as string);
  return value;
}

// --- import: server-side fetch of the image bytes ---

/** True for loopback, private, link-local, CGNAT, multicast and unspecified addresses (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped?.[1]) return isPrivateAddress(mapped[1]);
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
}

/** https only, and every address the host resolves to must be public. (DNS can change between this check and the fetch; the size/type limits cap what that could do.) */
export async function assertPublicHttps(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OpenverseError('bad_image');
  }
  if (url.protocol !== 'https:') throw new OpenverseError('bad_image');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) throw new OpenverseError('bad_image');
  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true }).then((rows) => rows.map((r) => r.address), () => []);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new OpenverseError('bad_image');
  return url;
}

async function fetchImageBytes(start: string): Promise<{ bytes: Buffer; contentType: string }> {
  let url = await assertPublicHttps(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      throw new OpenverseError('bad_image');
    }
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      url = await assertPublicHttps(new URL(next, url).href);
      continue;
    }
    if (!res.ok || !res.body) throw new OpenverseError('bad_image');
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!IMAGE_TYPES.has(contentType)) throw new OpenverseError('bad_image');
    if (Number(res.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new OpenverseError('bad_image');
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) throw new OpenverseError('bad_image');
        chunks.push(Buffer.from(chunk));
      }
    } catch (err) {
      throw err instanceof OpenverseError ? err : new OpenverseError('bad_image');
    }
    return { bytes: Buffer.concat(chunks), contentType };
  }
  throw new OpenverseError('bad_image');
}

/** Looks the image up by Openverse id (never a client-supplied URL) and downloads it. */
export async function importImage(id: string): Promise<{ bytes: Buffer; contentType: string; image: ImageResult }> {
  const raw = (await apiGet(`/images/${encodeURIComponent(id)}/`)) as RawImage;
  const license = (raw.license ?? '').toLowerCase();
  if (raw.mature || !raw.url || /(^|-)(nc|nd)/.test(license) || !license) throw new OpenverseError('bad_image');
  const { bytes, contentType } = await fetchImageBytes(raw.url);
  return { bytes, contentType, image: mapImage(raw) };
}

/** Test hook: forget the cached token and searches. */
export function resetOpenverseCache(): void {
  token = null;
  tokenInFlight = null;
  searchCache.clear();
}
