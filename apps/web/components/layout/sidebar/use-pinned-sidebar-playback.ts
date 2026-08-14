import { playCatalogResource } from "@/lib/catalog/play-catalog-resource";
import { playFavoritePlaylist } from "@/lib/favorites/play-favorite-playlist";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { playUserPlaylist } from "@/lib/playlists/play-user-playlist";
import { projectSongSummary } from "@/lib/songs/project-song-summary";
import type { SidebarItem } from "./sidebar-types";

export function usePinnedSidebarPlayback(item: SidebarItem, enabled = false) {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playing = usePlayerStore((state) => state.playing);
  const togglePlayback = usePlayerStore((state) => state.togglePlayback);
  const setSong = usePlayerStore((state) => state.setSong);
  const resource = item.variant !== "pin" ? item : undefined;
  const resourceType = resource?.resourceType;
  const resourceId = resource?.resourceId;
  const isUserPlaylist = resource?.isUserPlaylist === true;
  const isCurrentPin =
    enabled &&
    !!resourceId &&
    (resourceType === "songs"
      ? currentSong?.id === resourceId
      : resourceType === "albums"
        ? currentSong?.albumId === resourceId
        : resourceType === "playlists"
          ? currentSong?.sourcePlaylist?.id === resourceId
          : false);

  const playPin = () => {
    if (!enabled || !resourceType || !resourceId) return;

    if (isCurrentPin) {
      togglePlayback();
      return;
    }

    if (resourceType === "songs") {
      setSong(
        resource?.playbackSong
          ? projectSongSummary(resource.playbackSong)
          : {
              id: resourceId,
              title: item.label,
              artist: resource?.subtitle || "Unknown Artist",
              album: "",
              durationSec: 0,
              artworkUrl: resource?.artworkUrl || "",
              artworkSrcSet: resource?.artworkSrcSet,
              thumbnailArtworkSrcSet: resource?.artworkSrcSet,
              contentRating: resource?.isExplicit ? "explicit" : undefined,
              url: resource?.href,
              playbackUrl: `mse:${resourceId}`,
            },
      );
      return;
    }

    if (resourceType === "playlists" && resourceId === "favorite") {
      void playFavoritePlaylist({
        title: item.label,
        artworkUrl: resource?.artworkUrl,
      });
      return;
    }

    if (resourceType === "playlists" && isUserPlaylist) {
      void playUserPlaylist({
        id: resourceId,
        title: item.label,
        artworkUrl: resource?.artworkUrl,
        href: resource?.href,
      });
      return;
    }

    void playCatalogResource(resourceType, resourceId);
  };

  return {
    isCurrentPin,
    isPinPlaying: isCurrentPin && playing,
    playPin,
    resourceId,
  };
}
