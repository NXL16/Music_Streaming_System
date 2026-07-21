import { loadCatalogTracks } from "@/lib/catalog/load-catalog-tracks";
import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { getHomeRecommendations } from "./recommendation.api";

const SYSTEM_STATION_ID_PATTERN = /^(?:station-for-you|mood-station)-[a-f0-9]{32}-\d+$/;
const PLAYABLE_SYSTEM_STATION_KINDS = new Set([
  "system-personalized",
  "system-mood",
]);

export function isPlayableSystemStationId(stationId: string): boolean {
  return SYSTEM_STATION_ID_PATTERN.test(stationId);
}

/** Plays both personalised and mood stations from their persisted tracklist. */
export async function playSystemStation(stationId: string): Promise<boolean> {
  if (!isPlayableSystemStationId(stationId)) return false;

  const response = await getHomeRecommendations();
  const station = response.resources?.stations[stationId];
  const attributes = station?.attributes;
  const kind = typeof attributes?.kind === "string" ? attributes.kind : "";
  if (!station || !attributes || !PLAYABLE_SYSTEM_STATION_KINDS.has(kind)) {
    return false;
  }

  const trackIds = (station.relationships?.tracks?.data ?? [])
    .filter((reference) => reference.type === "songs")
    .map((reference) => reference.id);
  if (trackIds.length === 0) return false;

  const tracksById = new Map(
    (await loadCatalogTracks(trackIds)).map((track) => [track.id, track]),
  );

  const stationArtwork = attributes.artwork;
  const sourceStation = {
    id: stationId,
    name: typeof attributes.name === "string" ? attributes.name : "Station",
    artworkUrl: getArtworkRenditionUrl(stationArtwork, 632),
    artworkSrcSet: getArtworkSrcSet(stationArtwork, [296, 316, 592, 632]),
    artworkBgColor: stationArtwork?.bgColor
      ? `#${stationArtwork.bgColor.replace(/^#/, "")}`
      : undefined,
  };

  const tracks = trackIds.flatMap((id) => {
    const track = tracksById.get(id);
    return track ? [{ ...track, sourceStation }] : [];
  });
  if (tracks.length === 0) return false;

  usePlayerStore.getState().startStation(tracks);
  return true;
}

// Kept as a compatibility alias for callers that only know the original
// personalised-station name. The implementation now supports mood stations.
export const isStationsForYouId = isPlayableSystemStationId;
export const playStationsForYou = playSystemStation;
