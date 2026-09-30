import { http } from "@/lib/api/http";
import { loadCatalogTracks } from "@/lib/catalog/load-catalog-tracks";
import type { PlayerSong } from "@/lib/player/use-player-store";

type SongStationResponse = { stationId: string; trackIds?: string[] };

function createStation(seed: PlayerSong): Promise<SongStationResponse> {
  return http
    .post<SongStationResponse>("/me/recommendations/song-stations", {
      songId: seed.id,
      sourceAlbumId: seed.albumId ?? "",
    })
    .then((response) => response.data);
}

function selectRandomTracks(trackIds: string[], limit: number): string[] {
  const shuffled = [...trackIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [
      shuffled[target],
      shuffled[index],
    ];
  }
  return shuffled.slice(0, limit);
}

async function loadPersonalizedStationTrackIds(
  stationId: string,
  excludedSongIds: string[],
): Promise<string[]> {
  const response = await http.post<SongStationResponse>(
    `/me/recommendations/song-stations/${encodeURIComponent(stationId)}/tracks`,
    {
      excludedSongIds,
      // Ask for a pool larger than the ten displayed tracks so each Autoplay
      // session can be fresh without reusing a client-side cache.
      limit: 20,
    },
  );
  return response.data.trackIds ?? [];
}

/** Always builds a fresh recommendation context for the active playback seed. */
export async function loadAutoplayTracks(
  seed: PlayerSong,
  excludedSongIds: string[],
  limit: number,
): Promise<PlayerSong[]> {
  const station = await createStation(seed);
  const excluded = new Set(excludedSongIds);
  const requestedIds = selectRandomTracks(
    (await loadPersonalizedStationTrackIds(
      station.stationId,
      excludedSongIds,
    )).filter((id) => !excluded.has(id)),
    limit,
  );
  if (!requestedIds.length) return [];

  const byId = new Map(
    (await loadCatalogTracks(requestedIds)).map((track) => [track.id, track]),
  );
  return requestedIds.flatMap((id) => {
    const track = byId.get(id);
    return track ? [{ ...track, sourceAutoplay: true }] : [];
  });
}
