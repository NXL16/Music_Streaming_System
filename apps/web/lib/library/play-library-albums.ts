import { librarySongKey } from "./library-song-key";
import { getAllLibrarySongs } from "@/lib/songs/song.api";
import { projectSongSummary } from "@/lib/songs/project-song-summary";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { libraryAlbumSongIds } from "./library-album-song-ids";
import {
  getLibraryResources,
  getLibraryMediaCards,
  isLibraryResourcePendingRemoval,
} from "./library-resources.api";

export async function playLibraryAlbums(
  albumIds: string[],
  options: { shuffle?: boolean; isCurrent?: () => boolean } = {},
): Promise<boolean> {
  const memberships = await getLibraryResources();
  const songIds = libraryAlbumSongIds(memberships, albumIds);
  if (!songIds.length) return false;
  const albums = (await getLibraryMediaCards())
    .filter(
      (album) =>
        album.resourceType === "albums" && albumIds.includes(album.resourceId),
    )
    .sort(
      (a, b) =>
        (new Date(b.createdAt ?? 0).getTime() || 0) -
        (new Date(a.createdAt ?? 0).getTime() || 0),
    );
  const albumOrder = new Map(
    [...new Set([...albums.map((album) => album.resourceId), ...albumIds])].map(
      (id, index) => [id, index],
    ),
  );
  const songAlbums = new Map(
    memberships
      .filter((resource) => resource.resourceType === "songs")
      .map((resource) => [resource.resourceId, resource.sourceAlbumId ?? ""]),
  );
  const trackOrder = new Map<string, number>();
  for (const album of albums) {
    album.songIds?.forEach((id, index) => {
      trackOrder.set(librarySongKey(id, album.resourceId), index);
    });
  }
  const sourceAlbum = (song: { id: string; albumId?: string }) =>
    song.albumId ?? songAlbums.get(song.id);
  const albumRank = (song: { id: string; albumId?: string }) =>
    albumOrder.get(sourceAlbum(song) ?? "") ?? Number.MAX_SAFE_INTEGER;

  // Keep filtered GET URLs bounded for groups containing many saved albums.
  const songs = [];
  for (let offset = 0; offset < songIds.length; offset += 100) {
    if (options.isCurrent && !options.isCurrent()) return false;
    songs.push(
      ...(await getAllLibrarySongs({
        songIds: songIds.slice(offset, offset + 100),
        sortBy: "recently-added",
        direction: "descending",
      })),
    );
  }
  if (options.isCurrent && !options.isCurrent()) return false;
  const allowedIds = new Set(songIds);
  const queue = songs
    .filter(
      (song) =>
        allowedIds.has(song.id) &&
        albumOrder.has(sourceAlbum(song) ?? "") &&
        !isLibraryResourcePendingRemoval("songs", song.id, sourceAlbum(song)),
    )
    .sort(
      (a, b) =>
        albumRank(a) - albumRank(b) ||
        (trackOrder.get(librarySongKey(a.id, sourceAlbum(a))) ??
          Number.MAX_SAFE_INTEGER) -
          (trackOrder.get(librarySongKey(b.id, sourceAlbum(b))) ??
            Number.MAX_SAFE_INTEGER),
    )
    .map(projectSongSummary);
  if (!queue.length) return false;
  const player = usePlayerStore.getState();
  if (options.shuffle && queue.length > 1) player.playShuffledQueue(queue);
  else player.setQueue(queue, 0);
  return true;
}
