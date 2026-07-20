/**
 * Auditable, versioned configuration for Home recommendation generation.
 * This is deliberately the only place that defines ranking weights and Home
 * shelf limits: changing a recommendation is an explicit product decision.
 */
export const PRODUCTION_RECOMMENDATION_MODEL_VERSION = 5;

export const PRODUCTION_RECOMMENDATION_POLICY = {
  candidateLimit: 600,
  shelfLimit: 16,
  minimumShelfSize: 6,
  maxPerArtist: 2,
  maxPerGenre: 6,
  freshnessWindowDays: 120,
  historyWindowDays: 365,
  minimumHistoryEvents: 3,
  weights: {
    artistAffinity: 0.29,
    genreAffinity: 0.25,
    collaborative: 0.16,
    popularity: 0.12,
    freshness: 0.1,
    novelty: 0.08,
  },
  personalizedOrder: [
    'top-picks',
    'recently-played',
    'more-like-1',
    'genre-1',
    'made-for-you',
    'stations-for-you',
    'find-your-mood',
    'new-releases',
    'more-like-2',
    'fans-like',
    'more-like-3',
    'genre-2',
  ],
  moodStations: [
    'Focus',
    'Feeling Blue',
    'Energy',
    'Heartbreak',
    'Relax',
    'Feel Good',
    'Love',
  ],
} as const;

export type RecommendationReason =
  | 'artist-affinity'
  | 'genre-affinity'
  | 'fresh-release'
  | 'collaborative-signal'
  | 'popular-with-your-taste'
  | 'discovery';
