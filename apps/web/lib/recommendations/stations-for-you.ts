import { loadCatalogTracks } from "@/lib/catalog/load-catalog-tracks";
import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import { usePlayerStore } from "@/lib/player/use-player-store";
import {
  getSongStation,
  playSongStation,
  type SongStationResponse,
} from "./song-station";
import {
  getArtistStation,
  playArtistStation,
  type ArtistStationResponse,
} from "./artist-station";
import { getHomeRecommendations } from "./recommendation.api";
import type { CatalogResourceAttributes } from "./recommendation.types";

const MOOD_STATION_ID_PATTERN = /^mood-station-[a-f0-9]{32}-\d+$/;
const SONG_STATION_ID_PATTERN = /^song-station-[a-f0-9]{32}$/;
const ARTIST_STATION_ID_PATTERN = /^(artist|artist-play)-station-[a-f0-9]{32}$/;
const PLAYABLE_PERSISTED_STATION_KINDS = new Set(["system-mood"]);

export type SystemStationDetail = {
  id: string;
  name: string;
  description: string;
  artwork: CatalogResourceAttributes["artwork"];
};

type ContextStationResponse = Pick<
  SongStationResponse | ArtistStationResponse,
  "stationId" | "name" | "description" | "artworkUrl" | "artworkBgColor"
>;

function contextStationDetail(
  station: ContextStationResponse,
): SystemStationDetail {
  return {
    id: station.stationId,
    name: station.name,
    description: station.description,
    artwork: {
      url: station.artworkUrl,
      bgColor: station.artworkBgColor,
      width: 1080,
      height: 1080,
    },
  };
}

async function getContextStationDetail<T extends ContextStationResponse>(
  load: () => Promise<T>,
): Promise<SystemStationDetail | null> {
  try {
    return contextStationDetail(await load());
  } catch {
    return null;
  }
}

async function playContextStation<T extends ContextStationResponse>(
  load: () => Promise<T>,
  play: (station: T) => Promise<boolean>,
): Promise<boolean> {
  try {
    return play(await load());
  } catch {
    return false;
  }
}

export function isPlayableSystemStationId(stationId: string): boolean {
  return (
    MOOD_STATION_ID_PATTERN.test(stationId) ||
    SONG_STATION_ID_PATTERN.test(stationId) ||
    ARTIST_STATION_ID_PATTERN.test(stationId)
  );
}

/** Reads persisted Station data without generating a new Station. */
export async function getSystemStationDetail(
  stationId: string,
): Promise<SystemStationDetail | null> {
  if (!isPlayableSystemStationId(stationId)) return null;

  if (SONG_STATION_ID_PATTERN.test(stationId)) {
    return getContextStationDetail(() => getSongStation(stationId));
  }
  if (ARTIST_STATION_ID_PATTERN.test(stationId)) {
    return getContextStationDetail(() => getArtistStation(stationId));
  }

  const response = await getHomeRecommendations();
  const station = response.resources?.stations[stationId];
  const attributes = station?.attributes;
  const kind = typeof attributes?.kind === "string" ? attributes.kind : "";
  if (!station || !attributes || !PLAYABLE_PERSISTED_STATION_KINDS.has(kind)) {
    return null;
  }

  const description =
    typeof attributes.description?.short === "string"
      ? attributes.description.short
      : typeof attributes.description?.standard === "string"
        ? attributes.description.standard
        : "";

  return {
    id: stationId,
    name: typeof attributes.name === "string" ? attributes.name : "Station",
    description,
    artwork: attributes.artwork,
  };
}

/** Plays both personalised and mood stations from their persisted tracklist. */
export async function playSystemStation(stationId: string): Promise<boolean> {
  if (!isPlayableSystemStationId(stationId)) return false;

  if (SONG_STATION_ID_PATTERN.test(stationId)) {
    return playContextStation(
      () => getSongStation(stationId),
      playSongStation,
    );
  }
  if (ARTIST_STATION_ID_PATTERN.test(stationId)) {
    return playContextStation(
      () => getArtistStation(stationId),
      playArtistStation,
    );
  }

  const response = await getHomeRecommendations();
  const station = response.resources?.stations[stationId];
  const attributes = station?.attributes;
  const kind = typeof attributes?.kind === "string" ? attributes.kind : "";
  if (!station || !attributes || !PLAYABLE_PERSISTED_STATION_KINDS.has(kind)) {
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
  const stationDescription =
    typeof attributes.description?.short === "string"
      ? attributes.description.short
      : typeof attributes.description?.standard === "string"
        ? attributes.description.standard
        : "";
  const sourceStation = {
    id: stationId,
    name: typeof attributes.name === "string" ? attributes.name : "Station",
    description: stationDescription,
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

  usePlayerStore.getState().startStation(
    tracks,
    undefined,
  );
  return true;
}
