import { http } from "@/lib/api/http";
import { withPlaylistPlaybackSource } from "@/lib/player/playlist-playback-source";
import { usePlayerStore } from "@/lib/player/use-player-store";
import {
  projectSongSummary,
  type SongSummaryProjectionSource,
} from "@/lib/songs/project-song-summary";

type UserPlaylistTrack = SongSummaryProjectionSource;

type UserPlaylist = {
  id: string;
  name: string;
  artwork?: { url?: string; bgColor?: string };
  songs: UserPlaylistTrack[];
};

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

  const request = http
    .get<{ playlist: UserPlaylist }>(
      `/playlists/${encodeURIComponent(playlistId)}`,
    )
    .then(({ data }) => {
      const playlist = data.playlist;
      const tracks = playlist.songs.map(projectSongSummary);
      if (!tracks.some((track) => track.playbackUrl)) return false;

      const artworkUrl = context.artworkUrl || playlist.artwork?.url || "";
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
          artworkBgColor:
            context.artworkBgColor || playlist.artwork?.bgColor,
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
