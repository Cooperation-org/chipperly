/** Pure helpers for the library: bulk place merging, grouping, address search parsing. */

export type PlaceMode = 'add' | 'replace';

/**
 * The places a row ends up with. `current` and the result use the
 * `effectiveLocationIds` convention: [] means every place.
 * - replace: exactly `chosen`.
 * - add: `current` plus `chosen`, deduped. A row already in every place stays
 *   in every place (adding to "everywhere" changes nothing).
 * "Every place" is not a merge, callers write [] directly.
 */
export function mergePlaces(current: readonly string[], chosen: readonly string[], mode: PlaceMode): string[] {
  if (mode === 'replace') return [...new Set(chosen)];
  if (current.length === 0) return [];
  return [...new Set([...current, ...chosen])];
}

export interface Group<T> {
  key: string;
  rows: T[];
}

/**
 * Buckets rows by the keys `keysOf` returns (a row may land in several).
 * Groups follow `order`; keys not in `order` come after, first-seen first.
 * Empty groups are dropped.
 */
export function groupRows<T>(rows: readonly T[], keysOf: (row: T) => readonly string[], order: readonly string[]): Group<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    for (const key of new Set(keysOf(row))) {
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
  }
  const keys = [...order.filter((k) => map.has(k)), ...[...map.keys()].filter((k) => !order.includes(k))];
  return keys.map((key) => ({ key, rows: map.get(key) ?? [] }));
}

export interface AddressHit {
  label: string;
  lat: number;
  lng: number;
}

/** Nominatim returns lat/lon as strings. Anything malformed is skipped, never thrown on. */
export function parseNominatim(json: unknown): AddressHit[] {
  if (!Array.isArray(json)) return [];
  const hits: AddressHit[] = [];
  for (const item of json as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { display_name, lat, lon } = item as Record<string, unknown>;
    const la = Number(lat);
    const ln = Number(lon);
    if (typeof display_name !== 'string' || !Number.isFinite(la) || !Number.isFinite(ln)) continue;
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) continue;
    hits.push({ label: display_name, lat: la, lng: ln });
  }
  return hits;
}
