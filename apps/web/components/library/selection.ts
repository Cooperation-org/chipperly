/** Pure multi-select helpers for the library bulk actions. */

export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function allSelected(selected: ReadonlySet<string>, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

/** Select all when anything is unselected, otherwise clear. */
export function toggleAll(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  return allSelected(selected, ids) ? new Set() : new Set(ids);
}

/** Drops ids that are no longer listed (deleted, or synced away). */
export function pruneSelection(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const live = new Set(ids);
  return new Set([...selected].filter((id) => live.has(id)));
}
