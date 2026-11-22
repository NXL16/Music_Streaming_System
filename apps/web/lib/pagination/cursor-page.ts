type Identifiable = { id: string };

/** Adds only unseen records when cursor pages overlap at a boundary. */
export function appendUniqueById<T extends Identifiable>(
  current: T[],
  incoming: T[] | undefined,
  keyOf: (item: T) => string = (item) => item.id,
) {
  const ids = new Set(current.map(keyOf));
  return [
    ...current,
    ...(incoming ?? []).filter((item) => !ids.has(keyOf(item))),
  ];
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
