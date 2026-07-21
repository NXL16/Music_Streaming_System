/**
 * Auditable, versioned configuration for Home recommendation generation.
 * This is deliberately the only place that defines ranking weights and Home
 * shelf limits: changing a recommendation is an explicit product decision.
 */
// Bump when the candidate/ranking contract changes so cached Home pages are
// regenerated lazily instead of silently serving a previous model.
export const PRODUCTION_RECOMMENDATION_MODEL_VERSION = 29;

export const PRODUCTION_RECOMMENDATION_POLICY = {
  candidateLimit: 600,
  maxHomeShelves: 22,
  shelfLimit: 16,
  topPicksLimit: 12,
  globalShelfLimit: 12,
  // Pages may grow while the catalog supports distinct, useful topics. The
  // upper bound protects rendering and interaction volume without forcing a
  // thin fixed layout.
  globalAlbumShelfTarget: 20,
  userAlbumShelfTarget: 18,
  globalGenreShelfLimit: 8,
  globalArtistShelfLimit: 3,
  minimumShelfSize: 3,
  globalMinimumShelfSize: 6,
  maxPerArtist: 2,
  maxPerGenre: 6,
  freshnessWindowDays: 120,
  historyWindowDays: 365,
  interactionQueryLimit: 20_000,
  collaborativeOverlapLimit: 5_000,
  collaborativeCandidateLimit: 10_000,
  collaborativeNeighbourLimit: 100,
  minimumHistoryEvents: 3,
  weights: {
    artistAffinity: 0.24,
    genreAffinity: 0.18,
    contentSimilarity: 0.18,
    collaborative: 0.16,
    popularity: 0.12,
    freshness: 0.08,
    novelty: 0.04,
    feedback: 0.1,
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
    {
      title: 'Focus',
      subtitle: 'Limitless music to help you stay in the zone.',
      traits: ['focus', 'study', 'concentration', 'instrumental', 'lofi', 'lo-fi', 'ambient'],
      genres: ['Ambient', 'Instrumental', 'Classical', 'Jazz', 'Lo-Fi'],
      avoidTraits: ['party', 'workout', 'high-energy'],
      allowGenreFallback: true,
    },
    {
      title: 'Feeling Blue',
      subtitle: 'Sad songs that understand exactly how you feel.',
      traits: ['feeling-blue', 'sad', 'blue', 'melancholy', 'melancholic', 'somber', 'emotional'],
      genres: ['Ballad', 'Blues', 'Indie'],
      avoidTraits: ['party', 'upbeat', 'feel-good'],
      allowGenreFallback: false,
    },
    {
      title: 'Energy',
      subtitle: 'Keep it moving with non-stop high-voltage tracks.',
      traits: ['energy', 'energetic', 'upbeat', 'dance', 'workout', 'party'],
      genres: ['Dance', 'Electronic', 'EDM', 'Hip-Hop', 'Hip-Hop/Rap', 'Rap', 'Rock'],
      avoidTraits: ['sleep', 'calm', 'meditation'],
      allowGenreFallback: true,
    },
    {
      title: 'Heartbreak',
      subtitle: 'Get over it, one tear-jerking anthem at a time.',
      traits: ['heartbreak', 'breakup', 'sad', 'melancholy', 'emotional'],
      genres: ['Ballad', 'R&B', 'Soul'],
      avoidTraits: ['party', 'feel-good'],
      allowGenreFallback: false,
    },
    {
      title: 'Relax',
      subtitle: 'Soothing sounds to help you unwind and breathe easy.',
      traits: ['relax', 'relaxing', 'calm', 'chill', 'acoustic', 'ambient', 'sleep'],
      genres: ['Ambient', 'Acoustic', 'Chillout', 'Jazz', 'Classical'],
      avoidTraits: ['workout', 'party', 'high-energy'],
      allowGenreFallback: true,
    },
    {
      title: 'Feel Good',
      subtitle: 'The most uplifting tracks to brighten your day.',
      traits: ['feel-good', 'happy', 'positive', 'uplifting', 'sunny', 'upbeat'],
      genres: ['Pop', 'Dance', 'Disco', 'Funk'],
      avoidTraits: ['sad', 'heartbreak', 'melancholy'],
      allowGenreFallback: false,
    },
    {
      title: 'Love',
      subtitle: 'Romantic music that captures the perfect mood.',
      traits: ['love', 'romance', 'romantic', 'valentine', 'date-night'],
      genres: ['R&B', 'Soul', 'Pop', 'Ballad'],
      avoidTraits: ['workout', 'party'],
      allowGenreFallback: false,
    },
  ],
} as const;

export type RecommendationReason =
  | 'artist-affinity'
  | 'genre-affinity'
  | 'fresh-release'
  | 'collaborative-signal'
  | 'popular-with-your-taste'
  | 'discovery';
