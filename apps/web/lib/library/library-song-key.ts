/** A recording can be saved independently from more than one release. */
export function librarySongKey(songId: string, sourceAlbumId?: string) {
  return sourceAlbumId ? JSON.stringify([sourceAlbumId, songId]) : songId;
}
