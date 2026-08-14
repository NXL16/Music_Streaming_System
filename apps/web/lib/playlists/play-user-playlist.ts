import {
  getAllUserPlaylistTracks,
  getUserPlaylist,
} from "@/lib/playlists/user-playlists.api";
import { withPlaylistPlaybackSource } from "@/lib/player/playlist-playback-source";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { projectSongSummary } from "@/lib/songs/project-song-summary";

export type UserPlaylistPlaybackContext = {
  id: string;
  title: string;
  curatorName?: string;
  artworkUrl?: string;
  artworkBgColor?: string;
  href?: string;
};

const pendingRequests = new Map<string, Promise<boolean>>();

/** Loads and plays an authenticated user's playlist without using catalog APIs. */
export function playUserPlaylist(
  context: UserPlaylistPlaybackContext,
): Promise<boolean> {
  const playlistId = context.id.trim();
  if (!playlistId) return Promise.resolve(false);

  const existing = pendingRequests.get(playlistId);
  if (existing) return existing;

  const request = Promise.all([
    getUserPlaylist(playlistId),
    getAllUserPlaylistTracks(playlistId),
  ])
    .then(([playlist, songs]) => {
      const tracks = songs.map(projectSongSummary);
      if (!tracks.some((track) => track.playbackUrl)) return false;

      const artworkUrl = context.artworkUrl || playlist.artworkUrl || "";
      usePlayerStore.getState().setQueue(
        withPlaylistPlaybackSource(tracks, {
          id: playlist.id,
          name: playlist.name,
          playlistKind: "user",
          isUserPlaylist: true,
          curatorName: context.curatorName,
          href:
            context.href ||
            `/library/playlist/${encodeURIComponent(playlist.id)}`,
          artworkUrl,
          artworkSrcSet: artworkUrl || undefined,
          artworkBgColor: context.artworkBgColor,
        }),
      );
      return true;
    })
    .catch(() => false)
    .finally(() => {
      pendingRequests.delete(playlistId);
    });

  pendingRequests.set(playlistId, request);
  return request;
}
