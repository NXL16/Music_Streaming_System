import { loadCatalogTracks } from '@/lib/catalog/load-catalog-tracks';
import { type PlayerSong, usePlayerStore } from '@/lib/player/use-player-store';

export type ContextStation = {
  stationId: string;
  name: string;
  description: string;
  artworkUrl: string;
  artworkBgColor: string;
  artworkReady: boolean;
};

export function stationSource(station: ContextStation) {
  return {
    id: station.stationId,
    name: station.name,
    description: station.description,
    artworkUrl: station.artworkUrl,
    artworkBgColor: station.artworkBgColor,
    artworkReady: station.artworkReady,
  };
}

export async function loadStationTracks(
  trackIds: string[],
  sourceStation: NonNullable<PlayerSong['sourceStation']>,
): Promise<PlayerSong[]> {
  const tracksById = new Map(
    (await loadCatalogTracks(trackIds)).map((track) => [track.id, track]),
  );
  return trackIds.flatMap((trackId) => {
    const track = tracksById.get(trackId);
    return track ? [{ ...track, sourceStation }] : [];
  });
}

export async function appendStationTracks(
  sourceStation: NonNullable<PlayerSong['sourceStation']>,
  trackIds: string[],
): Promise<number> {
  if (!trackIds.length) return 0;
  const tracks = await loadStationTracks(trackIds, sourceStation);
  if (!tracks.length) return 0;
  usePlayerStore.getState().appendStationTracks(sourceStation.id, tracks);
  return tracks.length;
}
