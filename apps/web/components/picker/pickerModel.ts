export interface Named {
  name: string;
}

/** Case-insensitive "name contains" filter, trimmed. Empty query returns `items` unchanged. */
export function filterAndSection<T extends Named>(items: readonly T[], query: string): readonly T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.name.toLowerCase().includes(q));
}
