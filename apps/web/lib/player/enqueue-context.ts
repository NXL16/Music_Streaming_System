import {
  catalogArtworkSrcSet,
  catalogArtworkUrl,
  mapCatalogTracks,
} from "@/lib/catalog/catalog.mapper";
import {
  getCatalogAlbum,
  getCatalogPlaylist,
  getCatalogResources,
} from "@/lib/catalog/catalog.api";
import { playlistRoute } from "@/lib/catalog/playlist-route";
import type { ContextMenuContext } from "@/lib/context-menu/types";
import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import {
  getAllUserPlaylistTracks,
  getUserPlaylist,
} from "@/lib/playlists/user-playlists.api";
import { getMySong } from "@/lib/songs/song.api";
import { projectSongSummary } from "@/lib/songs/project-song-summary";
import { withPlaylistPlaybackSource } from "./playlist-playback-source";
import {
  type PlayerSong,
  type QueueInsertionPosition,
  usePlayerStore,
} from "./use-player-store";

async function resolveCatalogCollectionTracks(
  resourceType: "albums" | "playlists",
  resourceId: string,
) {
  const response =
    resourceType === "albums"
      ? await getCatalogAlbum(resourceId)
      : await getCatalogPlaylist(resourceId);
  let tracks = mapCatalogTracks(response);

  if (resourceType === "playlists") {
    const root = response.data.find(
      (reference) => reference.type === "playlists",
    );
    const playlist = root ? response.resources.playlists[root.id] : undefined;
    if (playlist) {
      const artwork = playlist.attributes.artwork;
      tracks = withPlaylistPlaybackSource(tracks, {
        id: playlist.id,
        name: playlist.attributes.name,
        curatorName: playlist.attributes.curatorName,
        href: playlistRoute(playlist.attributes.url, playlist.id),
        artworkUrl:
          catalogArtworkUrl(artwork, 316) ?? tracks[0]?.artworkUrl ?? "",
        artworkSrcSet:
          catalogArtworkSrcSet(artwork, [40, 80, 316, 632]) ||
          tracks[0]?.artworkSrcSet,
        artworkBgColor: artwork?.bgColor
          ? `#${artwork.bgColor.replace(/^#/, "")}`
          : tracks[0]?.artworkBgColor,
      });
    }
  }

  return tracks;
}

async function resolveUserPlaylistTracks(resourceId: string) {
  const [playlist, songs] = await Promise.all([
    getUserPlaylist(resourceId),
    getAllUserPlaylistTracks(resourceId),
  ]);
  const tracks = songs.map(projectSongSummary);
  const artworkUrl = playlist.artworkUrl || "";

  return withPlaylistPlaybackSource(tracks, {
    id: playlist.id,
    name: playlist.name,
    playlistKind: "user",
    isUserPlaylist: true,
    href: `/library/playlist/${encodeURIComponent(playlist.id)}`,
    artworkUrl,
    artworkSrcSet: artworkUrl || undefined,
    artworkBgColor: undefined,
  });
}

async function resolveFavoriteTracks(context: ContextMenuContext) {
  await useFavoriteStore.getState().hydrate();
  const tracks = useFavoriteStore.getState().songs.map(projectSongSummary);
  const collection = useFavoriteStore.getState().collection;

  return withPlaylistPlaybackSource(tracks, {
    id: "favorite",
    name: context.kind === "collection" ? context.title : "Favourite Songs",
    playlistKind: "favorite",
    href: "/library/playlist/favorite",
    artworkUrl: context.kind === "collection" ? context.artworkUrl || "" : "",
    artworkSrcSet:
      context.kind === "collection"
        ? context.artworkUrl || undefined
        : undefined,
    artworkBgColor: undefined,
    curatorName: collection?.title ? "You" : undefined,
  });
}

async function resolveSongTracks(songId: string): Promise<PlayerSong[]> {
  try {
    const catalogTracks = mapCatalogTracks(
      await getCatalogResources([{ id: songId, type: "songs" }]),
    );
    if (catalogTracks.length) return catalogTracks;
  } catch {
    // Fall through to the authenticated private-song lookup below.
  }

  const { song } = await getMySong(songId);
  return [
    projectSongSummary({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      durationSec: song.durationSec,
    }),
  ];
}

async function resolveContextTracks(
  context: ContextMenuContext,
): Promise<PlayerSong[]> {
  if (context.kind === "song") return resolveSongTracks(context.songId);
  if (context.kind !== "collection") return [];

  if (context.sourceOrigin === "favorite")
    return resolveFavoriteTracks(context);
  if (context.sourceOrigin === "user-playlist") {
    return resolveUserPlaylistTracks(context.resourceId);
  }
  return resolveCatalogCollectionTracks(
    context.resourceType,
    context.resourceId,
  );
}

/** Resolves menu context into canonical PlayerSong data and inserts it in queue. */
export async function enqueueContext(
  context: ContextMenuContext,
  position: QueueInsertionPosition,
) {
  const tracks = await resolveContextTracks(context);
  if (!tracks.some((track) => track.playbackUrl)) return false;

  usePlayerStore.getState().enqueue(tracks, position);
  return true;
}
