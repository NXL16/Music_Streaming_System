import { Prisma } from '../generated/prisma/client';
import { audioFeaturesFromAttributes } from '../common/audio-features';
import type { TasteProfile } from '../listening/listening.service';

type JsonObject = Record<string, unknown>;

const POSITIVE_MOOD_TAGS = new Set([
  'happy music',
  'energetic music',
  'upbeat music',
  'party music',
  'feel-good music',
]);
const NEGATIVE_MOOD_TAGS = new Set([
  'melancholic music',
  'sad music',
  'heartbreak music',
  'breakup music',
]);
const STRICT_TEMPO_TOLERANCE = 0.05;

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

/** Keeps clearly opposing analyzed moods out of Song Station candidates. */
export function isAudioMoodCompatible(
  seedAttributes: unknown,
  candidateAttributes: unknown,
): boolean {
  const seedTags = audioFeaturesFromAttributes(seedAttributes).tags;
  const candidateTags = audioFeaturesFromAttributes(candidateAttributes).tags;
  const hasTag = (tags: string[], moods: ReadonlySet<string>) =>
    tags.some((tag) => moods.has(tag));
  const seedIsPositive = hasTag(seedTags, POSITIVE_MOOD_TAGS);
  const seedIsNegative = hasTag(seedTags, NEGATIVE_MOOD_TAGS);
  const candidateIsPositive = hasTag(candidateTags, POSITIVE_MOOD_TAGS);
  const candidateIsNegative = hasTag(candidateTags, NEGATIVE_MOOD_TAGS);

  // Mixed-mood seed tracks do not provide a reliable direction, so preserve
  // vector similarity rather than guessing which half of the mood to favor.
  if (seedIsPositive === seedIsNegative) return true;
  return seedIsPositive ? !candidateIsNegative : !candidateIsPositive;
}

/** Keeps candidates in a symmetric BPM window around the seed track. */
export function isAudioTempoCompatible(
  seedAttributes: unknown,
  candidateAttributes: unknown,
  tolerance = STRICT_TEMPO_TOLERANCE,
): boolean {
  const seedBpm = audioFeaturesFromAttributes(seedAttributes).bpm;
  const candidateBpm = audioFeaturesFromAttributes(candidateAttributes).bpm;
  if (!seedBpm || !candidateBpm) {
    return true;
  }
  return Math.abs(candidateBpm - seedBpm) <= seedBpm * tolerance;
}

export function isSongStationAudioCompatible(
  seedAttributes: unknown,
  candidateAttributes: unknown,
  tempoTolerance = STRICT_TEMPO_TOLERANCE,
): boolean {
  return (
    isAudioMoodCompatible(seedAttributes, candidateAttributes) &&
    isAudioTempoCompatible(seedAttributes, candidateAttributes, tempoTolerance)
  );
}

/** Shared eligibility gate for every Song Station candidate tier. */
export function isSongStationCandidateEligible(
  song: Pick<
    StationProfileCandidate,
    'resourceId' | 'relationships' | 'attributes'
  >,
  seedAttributes: unknown,
  profile?: TasteProfile,
  tempoTolerance = STRICT_TEMPO_TOLERANCE,
): boolean {
  return (
    isStationCandidateEligible(song, profile) &&
    isSongStationAudioCompatible(
      seedAttributes,
      song.attributes,
      tempoTolerance,
    )
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
