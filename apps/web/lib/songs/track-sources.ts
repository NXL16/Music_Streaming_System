export type TrackSource = {
  songId: string;
  sourceAlbumId: string;
};

/** Preserves the displayed album for each song when copying a collection. */
export function toTrackSources(
  tracks: ReadonlyArray<{ id: string; albumId?: string }>,
): TrackSource[] {
  return tracks.flatMap((track) =>
    track.albumId
      ? [{ songId: track.id, sourceAlbumId: track.albumId }]
      : [],
  );
}
