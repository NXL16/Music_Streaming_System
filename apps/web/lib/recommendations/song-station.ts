import { http } from '@/lib/api/http';
import { loadCatalogTracks } from '@/lib/catalog/load-catalog-tracks';
import {
  usePlayerStore,
  type PlayerSong,
} from '@/lib/player/use-player-store';
import { appendStationTracks } from '@/lib/recommendations/station-playback';

export type SongStationResponse = {
  stationId: string;
  name: string;
  description: string;
  artworkUrl: string;
  artworkBgColor: string;
  trackIds: string[];
  artworkReady: boolean;
  /** Album that supplies the Station's seed-song playback and artwork context. */
  seedAlbumId?: string;
};

const inFlightSongStations = new Map<string, Promise<boolean>>();
const SONG_STATION_REFILL_SIZE = 20;

export async function getSongStation(stationId: string): Promise<SongStationResponse> {
  const response = await http.get<SongStationResponse>(
    `/me/recommendations/song-stations/${encodeURIComponent(stationId)}`,
  );
  return response.data;
}

async function renderSongStationArtwork(
  stationId: string,
): Promise<SongStationResponse> {
  const response = await http.post<SongStationResponse>(
    `/me/recommendations/song-stations/${encodeURIComponent(stationId)}/artwork`,
  );
  return response.data;
}

export async function playSongStation(
  station: SongStationResponse,
  seedSongId = station.trackIds[0],
  seedTrack?: PlayerSong,
  sourceAlbumId = station.seedAlbumId ?? '',
): Promise<boolean> {
  const [loadedTracks, resolvedSeedTracks] = await Promise.all([
    loadCatalogTracks(station.trackIds),
    sourceAlbumId && !seedTrack
      ? loadCatalogTracks([seedSongId], undefined, { albumId: sourceAlbumId })
      : Promise.resolve([]),
  ]);
  const tracksById = new Map(loadedTracks.map((track) => [track.id, track]));
  const sourceStation = {
    id: station.stationId,
    name: station.name,
    description: station.description,
    artworkUrl: station.artworkUrl,
    artworkBgColor: station.artworkBgColor,
    artworkReady: station.artworkReady,
    artworkStyle: 'song-context' as const,
  };
  const resolvedSeedTrack =
    seedTrack ?? resolvedSeedTracks[0];
  const tracks = station.trackIds.flatMap((trackId) => {
    // A recording can belong to several releases. When Station is created
    // from the currently playing row, retain that exact release identity
    // instead of letting the generic catalog batch select another release.
    const track =
      trackId === seedSongId
        ? (resolvedSeedTrack ?? tracksById.get(trackId))
        : tracksById.get(trackId);
    return track
      ? [{
          ...track,
          sourceStation,
        }]
      : [];
  });
  if (!tracks.length) return false;

  const player = usePlayerStore.getState();
  const preservesCurrentSeed =
    resolvedSeedTrack?.id === player.currentSong?.id &&
    resolvedSeedTrack?.releaseTrackId === player.currentSong?.releaseTrackId;
  player.startStation(tracks, seedSongId, preservesCurrentSeed);
  return true;
}

export async function refillSongStation(
  sourceStation: NonNullable<PlayerSong['sourceStation']>,
  excludedSongIds: string[],
): Promise<number> {
  const response = await http.post<{ trackIds: string[] }>(
    `/me/recommendations/song-stations/${encodeURIComponent(sourceStation.id)}/tracks`,
    {
      excludedSongIds,
      limit: SONG_STATION_REFILL_SIZE,
    },
  );
  const trackIds = response.data.trackIds ?? [];
  if (!trackIds.length) return 0;

  return appendStationTracks(sourceStation, trackIds);
}

export function createAndPlaySongStation(
  songId: string,
  sourceAlbumId = '',
  seedTrack?: PlayerSong,
): Promise<boolean> {
  const normalizedSongId = songId.trim();
  const normalizedSourceAlbumId = sourceAlbumId.trim();
  // A Song can appear on several releases. Each release is an independent
  // Station presentation because its cover is the source for Station artwork.
  const requestKey = [
    normalizedSongId,
    normalizedSourceAlbumId,
    seedTrack?.releaseTrackId ?? "",
  ].join(":");
  const existing = inFlightSongStations.get(requestKey);
  if (existing) return existing;

  const request = createAndPlaySongStationOnce(
    normalizedSongId,
    normalizedSourceAlbumId,
    seedTrack,
  );
  inFlightSongStations.set(requestKey, request);
  const clearInFlightRequest = () => {
    if (inFlightSongStations.get(requestKey) === request) {
      inFlightSongStations.delete(requestKey);
    }
  };
  void request.then(clearInFlightRequest, clearInFlightRequest);
  return request;
}

async function createAndPlaySongStationOnce(
  songId: string,
  sourceAlbumId: string,
  seedTrack?: PlayerSong,
): Promise<boolean> {
  const response = await http.post<SongStationResponse>(
    '/me/recommendations/song-stations',
    { songId, sourceAlbumId },
  );
  const station = response.data;
  const started = await playSongStation(
    station,
    songId,
    seedTrack,
    sourceAlbumId,
  );
  if (!started || station.artworkReady) return started;

  void renderSongStationArtwork(station.stationId)
    .then((updatedStation) => {
      if (!updatedStation.artworkReady) return;
      usePlayerStore.getState().updateStationArtwork(updatedStation.stationId, {
        url: updatedStation.artworkUrl,
        bgColor: updatedStation.artworkBgColor,
      });
    })
    .catch(() => undefined);
  return started;
}
