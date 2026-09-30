import { parseNominatim, type AddressHit } from './places';

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
// Nominatim policy: at most 1 request per second. Searches only run on an
// explicit submit (never per keystroke), and this gap is enforced on top.
const MIN_GAP_MS = 1100;
let lastRequestAt = 0;

export type AddressSearchResult =
  | { ok: true; hits: AddressHit[] }
  | { ok: false; reason: 'offline' | 'failed' };

/** Fails soft: never throws, so a dead network can't block saving a place. */
export async function searchAddress(query: string): Promise<AddressSearchResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  try {
    const url = `${ENDPOINT}?${new URLSearchParams({ format: 'json', limit: '5', q: query })}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, reason: 'failed' };
    return { ok: true, hits: parseNominatim(await res.json()) };
  } catch {
    return { ok: false, reason: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'failed' };
  }
}
