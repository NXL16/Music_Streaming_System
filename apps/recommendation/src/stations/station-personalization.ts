import { Prisma } from '../generated/prisma/client';
import { audioFeaturesFromAttributes } from '../common/audio-features';
import type { TasteProfile } from '../listening/listening.service';

type JsonObject = Record<string, unknown>;

export type StationProfileCandidate = {
  resourceId: string;
  artistName?: string;
  genreNames?: string[];
  attributes?: Prisma.JsonValue | null;
  relationships: Prisma.JsonValue | null;
};

function object(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function stationRelationshipIds(
  relationships: Prisma.JsonValue | null,
  relationship: string,
): string[] {
  const data = object(object(relationships)[relationship]).data;
  return (Array.isArray(data) ? data : [])
    .map((item) => {
      const id = object(item).id;
      return typeof id === 'string' ? id.trim() : '';
    })
    .filter(Boolean);
}

/** Applies listener-owned suppression consistently to every Station refill. */
export function isStationCandidateEligible(
  song: Pick<StationProfileCandidate, 'resourceId' | 'relationships'>,
  profile?: TasteProfile,
): boolean {
  if (!profile) return true;
  if (profile.hiddenResourceIds.get('songs')?.has(song.resourceId)) {
    return false;
  }
  const hasHiddenRelationship = (relationship: string, resourceType: string) =>
    stationRelationshipIds(song.relationships, relationship).some((id) =>
      profile.hiddenResourceIds.get(resourceType)?.has(id),
    );
  return (
    !hasHiddenRelationship('albums', 'albums') &&
    !hasHiddenRelationship('artists', 'artists')
  );
}

/** Ranks non-vector fallback candidates using the listener's AI-derived taste. */
export function rankStationCandidatesForProfile<
  T extends StationProfileCandidate,
>(songs: T[], profile?: TasteProfile): T[] {
  if (!profile) return songs;
  const artistWeights = new Map(
    profile.artists.map((artist) => [artist.name, artist.weight]),
  );
  const genreWeights = new Map(
    profile.genres.map((genre) => [genre.name, genre.weight]),
  );
  const tagWeights = new Map(
    profile.audioTags.map((tag) => [tag.name, tag.weight]),
  );
  const affinity = (song: T) => {
    const audio = audioFeaturesFromAttributes(song.attributes);
    const artist = artistWeights.get(song.artistName ?? '') ?? 0;
    const genre = Math.min(
      1,
      (song.genreNames ?? []).reduce(
        (score, name) => score + (genreWeights.get(name) ?? 0),
        0,
      ),
    );
    const tag = audio.tags.reduce(
      (best, value) => Math.max(best, tagWeights.get(value) ?? 0),
      0,
    );
    const bpm =
      audio.bpm === undefined || profile.preferredBpm === null
        ? 0
        : Math.max(
            0,
            1 -
              Math.abs(audio.bpm - profile.preferredBpm) /
                (profile.bpmTolerance ?? 20),
          );
    const energy =
      audio.energy === undefined || profile.preferredEnergy === null
        ? 0
        : Math.max(
            0,
            1 -
              Math.abs(audio.energy - profile.preferredEnergy) /
                (profile.energyTolerance ?? 0.2),
          );
    return artist * 0.3 + genre * 0.28 + tag * 0.2 + bpm * 0.11 + energy * 0.11;
  };
  return [...songs].sort(
    (left, right) =>
      affinity(right) - affinity(left) ||
      left.resourceId.localeCompare(right.resourceId),
  );
}
