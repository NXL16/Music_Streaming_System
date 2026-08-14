import type { PlayerSong } from "./use-player-store";

export type PlaylistPlaybackSource = NonNullable<PlayerSong["sourcePlaylist"]>;

/**
 * Tags every queued track with the playlist that started playback.
 * AppPlayerBar uses this single source of truth for listening events and the
 * Recently Played shelf.
 */
export function withPlaylistPlaybackSource(
  tracks: PlayerSong[],
  source: PlaylistPlaybackSource,
): PlayerSong[] {
  return tracks.map((track) => ({ ...track, sourcePlaylist: source }));
}
