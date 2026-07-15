import type { PlayerSong } from "@/lib/player/use-player-store";
import { loadCatalogTracks } from "@/lib/catalog/load-catalog-tracks";
import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import { getHomeRecommendations } from "./recommendation.api";
import type {
  Artwork,
  RecommendationResponse,
} from "./recommendation.types";

const DAILY_MIX_ID_PATTERN = /^daily-mix-[a-f0-9]{32}(?:-\d+)?$/;

export type DailyMix = {
  id: string;
  title: string;
  curatorName: string;
  description: string;
  artwork?: Artwork;
  trackIds: string[];
  tracks: PlayerSong[];
};

export function isDailyMixId(playlistId: string): boolean {
  return DAILY_MIX_ID_PATTERN.test(playlistId);
}

export function getDailyMix(
  response: RecommendationResponse,
  playlistId: string,
): DailyMix | null {
  const playlist = response.resources?.playlists[playlistId];
  if (!playlist || playlist.attributes?.playlistType !== "system-personalized") {
    return null;
  }

  const trackReferences = playlist.relationships?.tracks?.data ?? [];
  const trackIds = trackReferences
    .filter((reference) => reference.type === "songs")
    .map((reference) => reference.id);
  const description = playlist.attributes.description;

  return {
    id: playlist.id,
    title: playlist.attributes.name ?? "Daily Mix",
    curatorName: playlist.attributes.curatorName ?? "Musical",
    description: description?.standard || description?.short || "",
    artwork: playlist.attributes.artwork,
    trackIds,
    tracks: [],
  };
}

export async function loadDailyMix(playlistId: string): Promise<DailyMix | null> {
  const response = await getHomeRecommendations();
  const mix = getDailyMix(response, playlistId);
  if (!mix || mix.trackIds.length === 0) return mix;

  const tracksById = new Map(
    (await loadCatalogTracks(mix.trackIds)).map((track) => [track.id, track]),
  );
  const sourcePlaylist = {
    id: mix.id,
    name: mix.title,
    artworkUrl: getArtworkRenditionUrl(mix.artwork, 316),
    artworkSrcSet: getArtworkSrcSet(mix.artwork, [296, 316, 592, 632]),
    artworkBgColor: mix.artwork?.bgColor,
  };

  return {
    ...mix,
    tracks: mix.trackIds.flatMap((id) => {
      const track = tracksById.get(id);
      return track ? [{ ...track, sourcePlaylist }] : [];
    }),
  };
}
