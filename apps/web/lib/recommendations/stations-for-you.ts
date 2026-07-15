import { loadCatalogTracks } from "@/lib/catalog/load-catalog-tracks";
import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { getHomeRecommendations } from "./recommendation.api";

const STATION_ID_PATTERN = /^station-for-you-[a-f0-9]{32}-\d+$/;

export function isStationsForYouId(stationId: string): boolean {
  return STATION_ID_PATTERN.test(stationId);
}

export async function playStationsForYou(stationId: string): Promise<boolean> {
  if (!isStationsForYouId(stationId)) return false;

  const response = await getHomeRecommendations();
  const station = response.resources?.stations[stationId];
  if (station?.attributes?.kind !== "system-personalized") return false;

  const trackIds = (station.relationships?.tracks?.data ?? [])
    .filter((reference) => reference.type === "songs")
    .map((reference) => reference.id);
  if (trackIds.length === 0) return false;

  const tracksById = new Map(
    (await loadCatalogTracks(trackIds)).map((track) => [track.id, track]),
  );

  const stationArtwork = station.attributes.artwork;
  const sourceStation = {
    id: stationId,
    name: station.attributes.name ?? "Station",
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
