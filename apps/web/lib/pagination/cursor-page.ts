type Identifiable = { id: string };

/** Adds only unseen records when cursor pages overlap at a boundary. */
export function appendUniqueById<T extends Identifiable>(
  current: T[],
  incoming: T[] | undefined,
) {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...(incoming ?? []).filter((item) => !ids.has(item.id))];
}

/**
 * Stops pagination on malformed or repeated cursors instead of fetching a loop.
 * The caller owns `seenCursors` and resets it whenever the source changes.
 */
export function getSafeNextCursor(
  page: { hasMore?: boolean; nextCursor?: string | null },
  seenCursors: Set<string>,
) {
  const cursor = page.nextCursor?.trim() ?? "";
  if (!page.hasMore || !cursor || seenCursors.has(cursor)) return "";
  seenCursors.add(cursor);
  return cursor;
}
