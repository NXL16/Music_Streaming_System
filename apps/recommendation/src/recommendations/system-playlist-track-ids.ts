function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts the ordered song IDs from a system playlist snapshot relationship. */
export function systemPlaylistTrackIds(relationships: unknown): string[] {
  if (!isRecord(relationships) || !isRecord(relationships.tracks)) return [];
  const data = relationships.tracks.data;
  if (!Array.isArray(data)) return [];

  return data.flatMap((item) => {
    if (!isRecord(item) || item.type !== 'songs' || typeof item.id !== 'string') {
      return [];
    }
    return [item.id];
  });
}
