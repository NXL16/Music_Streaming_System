/**
 * Auditable, versioned configuration for Home recommendation generation.
 * This is deliberately the only place that defines ranking weights and Home
 * shelf limits: changing a recommendation is an explicit product decision.
 */
// Bump when the candidate, ranking, or Home-composition contract changes so
// cached Home pages regenerate instead of silently serving a previous model.
export const PRODUCTION_RECOMMENDATION_MODEL_VERSION = 94;

export const PRODUCTION_RECOMMENDATION_POLICY = {
  candidateLimit: 600,
  // Candidate retrieval is deliberately a portfolio, not merely the newest
  // catalog rows. These budgets cap database/RPC work while preserving recall
  // for long-lived tastes, neighbour signals and worthwhile older releases.
  candidatePoolLimit: 1_200,
  freshCandidateLimit: 320,
  // A deterministic older-catalog reservoir complements popular and fresh
  // candidates, so Global editorial shelves do not ignore quiet back catalog.
  globalCatalogCoverageLimit: 600,
  affinityCandidateLimit: 320,
  signalCandidateLimit: 240,
  audioCandidateLimit: 240,
  audioNeighboursPerSeed: 24,
  minimumAudioSimilarity: 0.2,
  // Catalog eligibility can legitimately leave some mood or artist shelves
  // empty. Eight real personalised shelves are a useful Home; discard it
  // only when fewer remain after visibility and catalog checks.
  minUserHomeShelves: 8,
  maxHomeShelves: 22,
  // Home renders a compact preview; the complete ranked collection is kept
  // for the shelf-detail route behind the disclosure affordance.
  shelfLimit: 12,
  shelfDetailLimit: 48,
  topPicksLimit: 10,
  globalShelfLimit: 12,
  userAlbumShelfTarget: 18,
  globalGenreShelfLimit: 8,
  userGenreShelfLimit: 3,
  minimumShelfSize: 3,
  globalMinimumShelfSize: 6,
  maxPerArtist: 2,
  maxPerGenre: 6,
  freshnessWindowDays: 120,
  globalTopPickFreshnessWindowDays: 30,
  globalTopPickInteractionLimit: 5_000,
  historyWindowDays: 365,
  interactionQueryLimit: 20_000,
  collaborativeOverlapLimit: 5_000,
  collaborativeCandidateLimit: 10_000,
  collaborativeNeighbourLimit: 100,
  minimumHistoryEvents: 3,
  personalizedPlaylistWeights: {
    taste: 0.65,
    popularity: 0.15,
    collaborative: 0.2,
  },
  weights: {
    artistAffinity: 0.24,
    genreAffinity: 0.18,
    contentSimilarity: 0.18,
    audioSimilarity: 0.2,
    collaborative: 0.16,
    popularity: 0.12,
    freshness: 0.08,
    novelty: 0.04,
    feedback: 0.1,
  },
  globalTopPickWeights: {
    popularity: 0.4,
    freshness: 0.3,
    engagement: 0.3,
  },
  personalizedOrder: [
    'top-picks',
    'recently-played',
    'genre-1',
    'more-like-1',
    'made-for-you',
    'stations-for-you',
    'find-your-mood',
    'new-releases',
    'chill-music',
    'more-like-2',
    'fans-like',
    'more-like-3',
    'genre-2',
  ],
  moodStations: [
    {
      key: 'focus',
      title: 'Focus',
      subtitle: 'Limitless music to help you stay in the zone.',
      traits: [
        'focus',
        'study',
        'concentration',
        'instrumental',
        'lofi',
        'lo-fi',
        'ambient',
      ],
      genres: ['Ambient', 'Instrumental', 'Classical', 'Jazz', 'Lo-Fi'],
      avoidTraits: ['party', 'workout', 'high-energy'],
      allowGenreFallback: true,
    },
    {
      key: 'feeling-blue',
      title: 'Feeling Blue',
      subtitle: 'Sad songs that understand exactly how you feel.',
      traits: [
        'feeling-blue',
        'sad',
        'blue',
        'melancholy',
        'melancholic',
        'somber',
        'emotional',
      ],
      genres: ['Ballad', 'Blues', 'Indie'],
      avoidTraits: ['party', 'upbeat', 'feel-good'],
      allowGenreFallback: false,
    },
    {
      key: 'energy',
      title: 'Energy',
      subtitle: 'Keep it moving with non-stop high-voltage tracks.',
      traits: ['energy', 'energetic', 'upbeat', 'dance', 'workout', 'party'],
      genres: [
        'Dance',
        'Electronic',
        'EDM',
        'Hip-Hop',
        'Hip-Hop/Rap',
        'Rap',
        'Rock',
      ],
      avoidTraits: ['sleep', 'calm', 'meditation'],
      allowGenreFallback: true,
    },
    {
      key: 'heartbreak',
      title: 'Heartbreak',
      subtitle: 'Get over it, one tear-jerking anthem at a time.',
      traits: ['heartbreak', 'breakup', 'sad', 'melancholy', 'emotional'],
      genres: ['Ballad', 'R&B', 'Soul'],
      avoidTraits: ['party', 'feel-good'],
      allowGenreFallback: false,
    },
    {
      key: 'relax',
      title: 'Relax',
      subtitle: 'Soothing sounds to help you unwind and breathe easy.',
      traits: [
        'relax',
        'relaxing',
        'calm',
        'chill',
        'acoustic',
        'ambient',
        'sleep',
      ],
      genres: ['Ambient', 'Acoustic', 'Chillout', 'Jazz', 'Classical'],
      avoidTraits: ['workout', 'party', 'high-energy'],
      allowGenreFallback: true,
    },
    {
      key: 'feel-good',
      title: 'Feel Good',
      subtitle: 'The most uplifting tracks to brighten your day.',
      traits: [
        'feel-good',
        'happy',
        'positive',
        'uplifting',
        'sunny',
        'upbeat',
      ],
      genres: ['Pop', 'Dance', 'Disco', 'Funk'],
      avoidTraits: ['sad', 'heartbreak', 'melancholy'],
      allowGenreFallback: false,
    },
    {
      key: 'love',
      title: 'Love',
      subtitle: 'Romantic music that captures the perfect mood.',
      traits: ['love', 'romance', 'romantic', 'valentine', 'date-night'],
      genres: ['R&B', 'Soul', 'Pop', 'Ballad'],
      avoidTraits: ['workout', 'party'],
      allowGenreFallback: false,
    },
  ],
  // These are shared visual templates only. Their Station snapshots and
  // tracklists remain user-scoped, unlike the editorial Mood Station set.
  personalizedStations: [
    { key: 'your-station', title: 'Your Station' },
    { key: 'discovery-station', title: 'Discovery Station' },
  ],
} as const;

export function scoreGlobalTopPick(input: {
  popularity: number;
  freshness: number;
  engagement: number;
}) {
  const { globalTopPickWeights } = PRODUCTION_RECOMMENDATION_POLICY;
  return (
    input.popularity * globalTopPickWeights.popularity +
    input.freshness * globalTopPickWeights.freshness +
    input.engagement * globalTopPickWeights.engagement
  );
}
