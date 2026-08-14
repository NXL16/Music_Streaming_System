import { useFavoriteStore } from "@/lib/favorites/use-favorite-store";
import type { MediaArtwork } from "@/lib/media/media-card.types";
import { getCoverArtwork } from "@/lib/media/artwork-slots";
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

  const { collection, songs } = useFavoriteStore.getState();
  const artwork = collection?.artwork as MediaArtwork | undefined;
  const { imageUrl: artworkUrl, imageSrcSet: artworkSrcSet } = getCoverArtwork(
    artwork,
    context.artworkUrl,
  );
  const tracks = songs.map(projectSongSummary);
  if (!tracks.some((track) => track.playbackUrl)) return false;

  usePlayerStore.getState().setQueue(
    withPlaylistPlaybackSource(tracks, {
      id: "favorite",
      name: context.title,
      playlistKind: "favorite",
      curatorName: context.curatorName,
      href: "/library/playlist/favorite",
      artworkUrl,
      artworkSrcSet: artworkSrcSet || undefined,
      artworkBgColor: context.artworkBgColor,
    }),
  );
  return true;
}
