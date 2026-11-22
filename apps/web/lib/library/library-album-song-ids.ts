import {
  isLibraryResourcePendingRemoval,
  type LibraryResource,
} from "./library-resources.api";

export function libraryAlbumSongIds(
  resources: readonly LibraryResource[],
  albumIds: readonly string[],
): string[] {
  const albums = new Set(albumIds);
  const songIds = new Set<string>();
  for (const resource of resources) {
    if (
      resource.resourceType === "songs" &&
      albums.has(resource.sourceAlbumId ?? "") &&
      !isLibraryResourcePendingRemoval(
        "songs",
        resource.resourceId,
        resource.sourceAlbumId,
      )
    ) {
      songIds.add(resource.resourceId);
    }
  }
  return [...songIds];
}
