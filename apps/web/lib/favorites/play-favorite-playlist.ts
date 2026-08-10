import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import { withPlaylistPlaybackSource } from "@/lib/player/playlist-playback-source";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { projectSongSummary } from "@/lib/songs/project-song-summary";

export type FavoritePlaylistPlaybackContext = {
  title: string;
  curatorName?: string;
  artworkUrl?: string;
  artworkBgColor?: string;
};

/** Loads the authenticated user's Favourite Songs and starts its queue. */
export async function playFavoritePlaylist(
  context: FavoritePlaylistPlaybackContext,
): Promise<boolean> {
  await useFavoriteStore.getState().hydrate();

  const tracks = useFavoriteStore.getState().songs.map(projectSongSummary);
  if (!tracks.some((track) => track.playbackUrl)) return false;

  usePlayerStore.getState().setQueue(
    withPlaylistPlaybackSource(tracks, {
      id: "favorite",
      name: context.title,
      playlistKind: "favorite",
      curatorName: context.curatorName,
      href: "/library/playlist/favorite",
      artworkUrl: context.artworkUrl || "",
      artworkSrcSet: context.artworkUrl || undefined,
      artworkBgColor: context.artworkBgColor,
    }),
  );
  return true;
}
