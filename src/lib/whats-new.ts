/** One changelog entry as "what's new" sees it: which patch, and which aircraft it touched. */
export type RecentChange = { key: string; version: string | null; touched: string[] };

/**
 * The entries newer than the last one this browser has seen, newest first.
 * Nothing for a first visit (nothing seen yet — a newcomer isn't "behind");
 * everything when the last one seen has dropped out of the list.
 */
export function unseenChanges(changes: readonly RecentChange[], seen: string | null): RecentChange[] {
  if (seen === null) return [];
  const index = changes.findIndex((change) => change.key === seen);
  return index === -1 ? [...changes] : changes.slice(0, index);
}

/** The favourites any of these entries changed, in the favourites' own order. */
export function favoritesTouched(changes: readonly RecentChange[], favorites: readonly string[]): string[] {
  const touched = new Set(changes.flatMap((change) => change.touched));
  return favorites.filter((id) => touched.has(id));
}
