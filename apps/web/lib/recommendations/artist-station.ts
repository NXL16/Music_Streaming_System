import { http } from '@/lib/api/http';
import { usePlayerStore, type PlayerSong } from '@/lib/player/use-player-store';
import {
  appendStationTracks,
  loadStationTracks,
  stationSource,
} from '@/lib/recommendations/station-playback';

export type ArtistStationResponse = {
  stationId: string;
  name: string;
  description: string;
  artworkUrl: string;
  artworkBgColor: string;
  trackIds: string[];
  artworkReady: boolean;
  artistOnly: boolean;
};
const inFlight = new Map<string, Promise<boolean>>();
const artworkInFlight = new Map<string, Promise<boolean>>();
const REFILL_SIZE = 20;
const ARTWORK_RENDER_CONCURRENCY = 2;

export async function getArtistStation(stationId: string) {
  return (
    await http.get<ArtistStationResponse>(
      `/me/recommendations/artist-stations/${encodeURIComponent(stationId)}`,
    )
  ).data;
}

async function renderArtwork(stationId: string, primaryArtworkUrl?: string) {
  return (
    await http.post<ArtistStationResponse>(
      `/me/recommendations/artist-stations/${encodeURIComponent(stationId)}/artwork`,
      { primaryArtworkUrl },
    )
  ).data;
}

/**
 * Gives an Artist Station its canonical composite cover before it is shown in
 * a recommendation shelf. The server treats this as idempotent; this local
 * map only avoids duplicate requests from concurrent Home consumers.
 */
export function ensureArtistStationArtwork(stationId: string): Promise<boolean> {
  const id = stationId.trim();
  if (!id) return Promise.resolve(false);
  const existing = artworkInFlight.get(id);
  if (existing) return existing;

  const request = getArtistStation(id)
    .then((station) => renderArtwork(station.stationId))
    .then((updated) => updated.artworkReady)
    .finally(() => {
      if (artworkInFlight.get(id) === request) artworkInFlight.delete(id);
    });
  artworkInFlight.set(id, request);
  return request;
}

/** Limits Home's initial cover work without changing which cards are ready. */
export async function ensureArtistStationArtworkBatch(
  stationIds: string[],
): Promise<boolean> {
  const uniqueIds = [...new Set(stationIds.map((id) => id.trim()).filter(Boolean))];
  let updated = false;

  for (let index = 0; index < uniqueIds.length; index += ARTWORK_RENDER_CONCURRENCY) {
    const results = await Promise.all(
      uniqueIds
        .slice(index, index + ARTWORK_RENDER_CONCURRENCY)
        .map((stationId) => ensureArtistStationArtwork(stationId).catch(() => false)),
    );
    updated ||= results.some(Boolean);
  }

  return updated;
}

export async function playArtistStation(
  station: ArtistStationResponse,
  primaryArtworkUrl?: string,
  onArtworkError?: () => void,
): Promise<boolean> {
  const sourceStation = stationSource(station);
  const tracks = await loadStationTracks(station.trackIds, sourceStation);
  if (!tracks.length) return false;
  const startTrack = station.artistOnly
    ? tracks[Math.floor(Math.random() * tracks.length)] ?? tracks[0]
    : tracks[0];
  usePlayerStore.getState().startStation(tracks, startTrack.id);
  if (!station.artworkReady) {
    void renderArtwork(station.stationId, primaryArtworkUrl)
      .then((updated) => {
        if (!updated.artworkReady) return;
        usePlayerStore.getState().updateStationArtwork(updated.stationId, {
          url: updated.artworkUrl,
          bgColor: updated.artworkBgColor,
        });
      })
      .catch(() => onArtworkError?.());
  }
  return true;
}

export async function refillArtistStation(
  sourceStation: NonNullable<PlayerSong['sourceStation']>,
  excludedSongIds: string[],
) {
  const response = await http.post<{ trackIds: string[] }>(
    `/me/recommendations/artist-stations/${encodeURIComponent(sourceStation.id)}/tracks`,
    { excludedSongIds, limit: REFILL_SIZE },
  );
  return appendStationTracks(sourceStation, response.data.trackIds ?? []);
}

export function createAndPlayArtistStation(
  artistId: string,
  primaryArtworkUrl?: string,
  onArtworkError?: () => void,
): Promise<boolean> {
  return createAndPlayArtistStationVariant(
    artistId,
    false,
    primaryArtworkUrl,
    onArtworkError,
  );
}

/** Starts the Artist-page Play Station: only songs credited to the artist. */
export function createAndPlayArtistPlayStation(
  artistId: string,
  primaryArtworkUrl?: string,
  onArtworkError?: () => void,
): Promise<boolean> {
  return createAndPlayArtistStationVariant(
    artistId,
    true,
    primaryArtworkUrl,
    onArtworkError,
  );
}

function createAndPlayArtistStationVariant(
  artistId: string,
  artistOnly: boolean,
  primaryArtworkUrl?: string,
  onArtworkError?: () => void,
): Promise<boolean> {
  const id = artistId.trim();
  const key = `${artistOnly ? 'artist-play' : 'artist-similar'}:${id}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = createOnce(id, artistOnly, primaryArtworkUrl, onArtworkError);
  inFlight.set(key, request);
  void request
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    })
    .catch(() => undefined);
  return request;
}
async function createOnce(
  artistId: string,
  artistOnly: boolean,
  primaryArtworkUrl?: string,
  onArtworkError?: () => void,
) {
  const station = (
    await http.post<ArtistStationResponse>('/me/recommendations/artist-stations', {
      artistId,
      artistOnly,
    })
  ).data;
  return playArtistStation(station, primaryArtworkUrl, onArtworkError);
}
