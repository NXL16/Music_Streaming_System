import { getCatalogAlbum, getCatalogPlaylist } from "./catalog.api";
import {
  catalogArtworkSrcSet,
  catalogArtworkUrl,
  mapCatalogTracks,
} from "./catalog.mapper";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { recordPlayFromRecommendationOpen } from "@/lib/recommendations/recommendation.api";
import { playlistRoute } from "./playlist-route";
import { withPlaylistPlaybackSource } from "@/lib/player/playlist-playback-source";

const pendingRequests = new Map<string, Promise<boolean>>();

export function playCatalogResource(
  resourceType: string,
  resourceId: string,
): Promise<boolean> {
  if (resourceType !== "albums" && resourceType !== "playlists") {
    return Promise.resolve(false);
  }

  const normalizedId = resourceId.trim();
  if (!normalizedId) return Promise.resolve(false);

  const key = `${resourceType}:${normalizedId}`;
  const existing = pendingRequests.get(key);
  if (existing) return existing;

  const request = (
    resourceType === "albums"
      ? getCatalogAlbum(normalizedId)
      : getCatalogPlaylist(normalizedId)
  )
    .then((response) => {
      let tracks = mapCatalogTracks(response);
      if (!tracks.some((track) => track.playbackUrl)) return false;

      if (resourceType === "playlists") {
        const root = response.data.find(
          (reference) => reference.type === "playlists",
        );
        const playlist = root
          ? response.resources.playlists[root.id]
          : undefined;
        if (!playlist) return false;

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

      usePlayerStore.getState().setQueue(tracks);
      recordPlayFromRecommendationOpen(resourceType, normalizedId);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      pendingRequests.delete(key);
    });

  pendingRequests.set(key, request);
  return request;
}
