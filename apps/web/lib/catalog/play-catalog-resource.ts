import { getCatalogAlbum, getCatalogPlaylistTracks } from "./catalog.api";
import { mapCatalogTracks } from "./catalog.mapper";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { isDailyMixId, loadDailyMix } from "@/lib/recommendations/daily-mix";
import { recordPlayFromRecommendationOpen } from "@/lib/recommendations/recommendation.api";

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

  if (resourceType === "playlists" && isDailyMixId(normalizedId)) {
    const request = loadDailyMix(normalizedId)
      .then((mix) => {
        if (!mix?.tracks.length) return false;

        usePlayerStore.getState().setQueue(mix.tracks);
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

  const request = (
    resourceType === "albums"
      ? getCatalogAlbum(normalizedId)
      : getCatalogPlaylistTracks(normalizedId)
  )
    .then((response) => {
      const tracks = mapCatalogTracks(response);
      if (!tracks.some((track) => track.playbackUrl)) return false;

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
