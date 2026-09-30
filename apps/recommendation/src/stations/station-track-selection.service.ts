import { Injectable } from '@nestjs/common';
import { QdrantAudioVectorService } from '../vector/qdrant-audio-vector.service';

export type StationTrackCandidate = {
  id: string;
  artistIds: string[];
};

export const STATION_TRACK_SELECTION_VERSION = 'v3';

type SelectStationTracksInput = {
  initialTrackIds?: readonly string[];
  initialCandidates?: readonly StationTrackCandidate[];
  candidateTiers: ReadonlyArray<readonly StationTrackCandidate[]>;
  excludedSongIds?: ReadonlySet<string>;
  limit: number;
};

const MAX_TRACKS_PER_ARTIST = 3;
const AUDIO_NEIGHBOURS_PER_SEED = 60;

/**
 * Selects a coherent, non-repetitive Station sequence. Audio-vector
 * similarity is the primary signal; semantic catalog tiers only guarantee a
 * useful result when vectors are unavailable or the catalog is sparse.
 */
@Injectable()
export class StationTrackSelectionService {
  constructor(private readonly audioVectors: QdrantAudioVectorService) {}

  select({
    initialTrackIds = [],
    initialCandidates = [],
    candidateTiers,
    excludedSongIds = new Set<string>(),
    limit,
  }: SelectStationTracksInput): string[] {
    if (limit <= 0) return [];

    const candidates = new Map<string, StationTrackCandidate>();
    for (const candidate of initialCandidates) {
      if (!excludedSongIds.has(candidate.id)) candidates.set(candidate.id, candidate);
    }
    for (const tier of candidateTiers) {
      for (const candidate of tier) {
        if (!excludedSongIds.has(candidate.id)) candidates.set(candidate.id, candidate);
      }
    }

    const selected: string[] = [];
    const add = (id: string, enforceArtistCap: boolean) => {
      const candidate = candidates.get(id);
      if (!candidate || selected.includes(id) || selected.length >= limit) {
        return false;
      }
      if (
        enforceArtistCap &&
        candidate.artistIds.length > 0 &&
        candidate.artistIds.some(
          (artistId) =>
            (artistCounts.get(artistId) ?? 0) >= MAX_TRACKS_PER_ARTIST,
        )
      ) {
        return false;
      }
      selected.push(id);
      for (const artistId of candidate.artistIds) {
        artistCounts.set(artistId, (artistCounts.get(artistId) ?? 0) + 1);
      }
      return true;
    };
    const artistCounts = new Map<string, number>();

    for (const id of initialTrackIds) add(id, false);

    const orderedIds = [
      ...candidateTiers.flatMap((tier) => tier.map((candidate) => candidate.id)),
    ];
    for (const id of orderedIds) add(id, true);
    // In a small catalog, complete the Station rather than returning a short
    // queue merely because the diversity cap cannot be maintained.
    for (const id of orderedIds) add(id, false);
    return selected;
  }

  async audioCandidateIds(seedSongIds: readonly string[]): Promise<string[]> {
    if (!this.audioVectors.isEnabled() || seedSongIds.length === 0) return [];
    try {
      const neighbours = await this.audioVectors.findNeighboursBySongIds(
        seedSongIds,
        AUDIO_NEIGHBOURS_PER_SEED,
      );
      const scores = new Map<string, number>();
      for (const neighbour of neighbours) {
        const score = Math.max(0, Math.min(1, neighbour.score));
        if (score < 0.2) continue;
        scores.set(neighbour.songId, Math.max(scores.get(neighbour.songId) ?? 0, score));
      }
      return [...scores]
        .sort(
          (left, right) =>
            right[1] - left[1] || left[0].localeCompare(right[0]),
        )
        .map(([songId]) => songId);
    } catch {
      // Qdrant is derived infrastructure. A station remains playable through
      // its catalog tiers while the vector index is unavailable.
      return [];
    }
  }
}
