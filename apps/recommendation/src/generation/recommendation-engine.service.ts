import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ListeningService, TasteProfile } from '../listening/listening.service';
import { RecommendationCatalogService } from '../recommendations/recommendation-catalog.service';
import { QdrantAudioVectorService } from '../vector/qdrant-audio-vector.service';
import { MORE_LIKE_SHELF_LIMIT } from '@musical/shared-constants';
import {
  PRODUCTION_RECOMMENDATION_MODEL_VERSION,
  PRODUCTION_RECOMMENDATION_POLICY as policy,
} from './production-recommendation-policy';

export const PERSONALIZATION_MODEL_VERSION =
  PRODUCTION_RECOMMENDATION_MODEL_VERSION;

type CandidateSource =
  'taste' | 'content' | 'audio' | 'fresh' | 'popular' | 'collaborative';
type AlbumCandidate = {
  id: string;
  artistName: string;
  artworkPerceptualHash?: string;
  genreNames: string[];
  audioTraits: string[];
  releaseDate: string;
  score: number;
  artistAffinity: number;
  genreAffinity: number;
  contentSimilarity: number;
  audioSimilarity: number;
  collaborative: number;
  popularity: number;
  freshness: number;
  feedback: number;
  sources: Set<CandidateSource>;
};

type AlbumPopularityRow = {
  albumId: string;
  plays: bigint | number;
  completions: bigint | number;
  skips: bigint | number;
};

export type GeneratedShelf = {
  id: string;
  title: string;
  items: Array<{ id: string; type: 'albums' }>;
  hasMore: boolean;
  modelVersion: number;
  sourceAlbumId?: string;
  sourceAlbumName?: string;
  sourceAlbumUrl?: string;
  sourceAlbumArtworkUrl?: string;
  sourceAlbumArtworkBgColor?: string;
};

/**
 * Production ranking engine for the album shelves on a personalized Home.
 * It owns candidate generation, scoring and page-wide allocation. Presentation
 * and system collection persistence remain outside this class.
 */
@Injectable()
export class RecommendationEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listeningService: ListeningService,
    private readonly catalogService: RecommendationCatalogService,
    private readonly audioVectors: QdrantAudioVectorService,
  ) {}

  async generateUserShelves(
    userId: string,
    profile?: TasteProfile,
  ): Promise<GeneratedShelf[]> {
    const resolvedProfile =
      profile ?? (await this.listeningService.getUserTasteProfile(userId));
    const candidates = await this.collectAlbumCandidates(
      userId,
      resolvedProfile,
    );
    if (candidates.length < policy.minimumShelfSize) return [];

    const allocated = new Set<string>();
    const result: GeneratedShelf[] = [];
    const seeds = await this.recentAlbumSeeds(userId);
    const topGenres = resolvedProfile.genres
      .map((genre) => genre.name)
      .slice(0, 4);
    const topArtists = resolvedProfile.artists
      .map((artist) => artist.name)
      .slice(0, 3);
    const perShelfLimit = policy.shelfLimit;

    const add = (
      id: string,
      title: string,
      ranked: AlbumCandidate[],
      limit: number = perShelfLimit,
      sourceAlbumId?: string,
      sourceAlbumName?: string,
      sourceAlbumUrl?: string,
      sourceAlbumArtworkUrl?: string,
      sourceAlbumArtworkBgColor?: string,
    ) => {
      // Keep the Home rail at 12 cards. The remaining unique, ranked albums
      // belong to the same shelf detail instead of making every Home rail
      // artificially short by dividing the candidate pool across slots.
      const items = this.allocate(
        this.diversifyArtwork(ranked),
        allocated,
        Math.max(limit, policy.shelfDetailLimit),
      );
      if (items.length < policy.minimumShelfSize) return;
      items.forEach((item) => allocated.add(item.id));
      result.push({
        id,
        title,
        items,
        hasMore: items.length > perShelfLimit,
        modelVersion: PERSONALIZATION_MODEL_VERSION,
        sourceAlbumId,
        sourceAlbumName,
        sourceAlbumUrl,
        sourceAlbumArtworkUrl,
        sourceAlbumArtworkBgColor,
      });
    };

    add(
      'user-top-picks',
      'Top Picks for You',
      candidates,
      Math.min(policy.topPicksLimit, perShelfLimit),
    );
    if (seeds[0])
      add(
        'user-more-like-1',
        `More Like ${seeds[0].name}`,
        this.nearSeed(candidates, seeds[0]),
        MORE_LIKE_SHELF_LIMIT,
        seeds[0].id,
        seeds[0].name,
        seeds[0].url,
        seeds[0].artworkUrl,
        seeds[0].artworkBgColor,
      );
    if (topGenres[0])
      add(
        'user-genre-1',
        `${topGenres[0]}`,
        this.forGenre(candidates, topGenres[0]),
      );
    add(
      'user-new-releases',
      'New Releases for You',
      this.byFreshness(candidates),
    );
    if (seeds[1])
      add(
        'user-more-like-2',
        `More Like ${seeds[1].name}`,
        this.nearSeed(candidates, seeds[1]),
        MORE_LIKE_SHELF_LIMIT,
        seeds[1].id,
        seeds[1].name,
        seeds[1].url,
        seeds[1].artworkUrl,
        seeds[1].artworkBgColor,
      );
    if (topArtists[0])
      add(
        'user-fans-like',
        `${topArtists[0]} Fans Like`,
        this.forFans(candidates, topArtists[0]),
      );
    if (seeds[2])
      add(
        'user-more-like-3',
        `More Like ${seeds[2].name}`,
        this.nearSeed(candidates, seeds[2]),
        MORE_LIKE_SHELF_LIMIT,
        seeds[2].id,
        seeds[2].name,
        seeds[2].url,
        seeds[2].artworkUrl,
        seeds[2].artworkBgColor,
      );
    if (topGenres[1])
      add(
        'user-genre-2',
        `${topGenres[1]}`,
        this.forGenre(candidates, topGenres[1]),
      );
    for (const [index, seed] of seeds.slice(3, 5).entries()) {
      add(
        `user-more-like-${index + 4}`,
        `More Like ${seed.name}`,
        this.nearSeed(candidates, seed),
        MORE_LIKE_SHELF_LIMIT,
        seed.id,
        seed.name,
        seed.url,
        seed.artworkUrl,
        seed.artworkBgColor,
      );
    }
    for (const [index, genre] of topGenres.slice(2).entries()) {
      add(
        `user-genre-${index + 3}`,
        `${genre}`,
        this.forGenre(candidates, genre),
      );
    }
    for (const artist of topArtists.slice(1)) {
      add(
        `user-fans-like-${this.slug(artist)}`,
        `${artist} Fans Like`,
        this.forFans(candidates, artist),
      );
    }
    const personalFallbacks: Array<[string, string, AlbumCandidate[]]> = [
      ['user-fresh-for-you', 'Fresh for You', this.byFreshness(candidates)],
      [
        'user-discover-more',
        'Discover More',
        [...candidates].sort(
          (left, right) =>
            right.score - left.score || left.id.localeCompare(right.id),
        ),
      ],
      [
        'user-popular-with-listeners',
        'Popular Right Now',
        [...candidates].sort(
          (left, right) =>
            right.popularity - left.popularity ||
            right.score - left.score ||
            left.id.localeCompare(right.id),
        ),
      ],
      [
        'user-deep-cuts',
        'Deep Cuts for You',
        [...candidates].sort(
          (left, right) =>
            left.freshness - right.freshness ||
            right.score - left.score ||
            left.id.localeCompare(right.id),
        ),
      ],
    ];
    for (const [id, title, ranked] of personalFallbacks) {
      if (result.length >= policy.userAlbumShelfTarget) break;
      add(id, title, ranked);
    }
    return result;
  }

  /**
   * Keeps personalized relevance from the ranking model while sequencing the
   * resulting album cards for discovery. This is intentionally separate from
   * Home shelf allocation: a catalog detail page has one contextual seed and
   * must not inherit Home's page-wide exclusion set.
   */
  async getAlbumRelatedRecommendations(
    userId: string,
    albumId: string,
    limit: number,
  ): Promise<string[]> {
    if (!userId || !albumId) return [];

    const source = await this.prisma.recommendationResourceSnapshot.findFirst({
      where: { resourceType: 'albums', resourceId: albumId },
      select: {
        resourceId: true,
        artistName: true,
        attributes: true,
        genreNames: true,
        audioTraits: true,
      },
    });
    if (!source) return [];

    const profile = await this.listeningService.getUserTasteProfile(userId);
    const candidates = await this.collectAlbumCandidates(userId, profile);
    const sourceGenres = new Set(
      source.genreNames
        .map((genre) => genre.trim().toLowerCase())
        .filter(Boolean),
    );
    const rotationKey = new Date().toISOString().slice(0, 10);
    const ranked = candidates
      .filter((candidate) => candidate.id !== albumId)
      .map((candidate) => {
        const genreMatch = candidate.genreNames.some((genre) =>
          sourceGenres.has(genre.trim().toLowerCase()),
        )
          ? 1
          : 0;
        const contextualScore =
          candidate.score * 0.38 +
          this.contentSimilarity(candidate, source) * 0.25 +
          genreMatch * 0.22 +
          candidate.freshness * 0.08 +
          this.stableNoise(
            `${userId}:${albumId}:${rotationKey}:${candidate.id}`,
          ) *
            0.16;
        return { candidate, contextualScore };
      })
      .sort(
        (left, right) =>
          right.contextualScore - left.contextualScore ||
          left.candidate.id.localeCompare(right.candidate.id),
      )
      .map(({ candidate }) => candidate);

    return this.sequenceRelatedAlbums(ranked, Math.min(Math.max(limit, 1), 60));
  }

  /** Global Home is editorial-style: no user-history signals, only freshness,
   * audience quality and controlled catalog diversity. */
  async generateGlobalShelves(): Promise<GeneratedShelf[]> {
    const [popularity, feedback, freshAlbumIds] = await Promise.all([
      this.popularAlbumScores(),
      this.interactionScores(),
      this.latestAlbumIds(policy.freshCandidateLimit),
    ]);
    const candidateIds = this.candidateIds(
      this.rankedIds(popularity, policy.signalCandidateLimit),
      this.rankedIds(feedback, policy.signalCandidateLimit),
      freshAlbumIds,
    );
    const [albums, publishedAlbumIds] = await Promise.all([
      this.albumSnapshots(candidateIds),
      this.publishedAlbumIds(candidateIds),
    ]);
    const candidates = albums
      .filter((album) => publishedAlbumIds.has(album.resourceId))
      .map((album) => {
        const freshness = this.freshness(album.releaseDate);
        const popularityScore = popularity.get(album.resourceId) ?? 0;
        const feedbackScore = feedback.get(album.resourceId) ?? 0;
        return {
          id: album.resourceId,
          artistName: album.artistName,
          artworkPerceptualHash: this.artworkPerceptualHash(album.attributes),
          genreNames: album.genreNames,
          audioTraits: album.audioTraits,
          releaseDate: album.releaseDate,
          artistAffinity: 0,
          genreAffinity: 0,
          contentSimilarity: 0,
          audioSimilarity: 0,
          collaborative: 0,
          popularity: popularityScore,
          freshness,
          feedback: feedbackScore,
          sources: new Set<CandidateSource>([
            ...(freshness > 0 ? ['fresh' as const] : []),
            ...(popularityScore > 0 ? ['popular' as const] : []),
          ]),
          score:
            freshness * 0.52 + popularityScore * 0.36 + feedbackScore * 0.12,
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score || left.id.localeCompare(right.id),
      );
    const allocated = new Set<string>();
    const shelves: GeneratedShelf[] = [];
    const genreCounts = new Map<string, number>();
    const artistCounts = new Map<string, number>();
    for (const candidate of candidates) {
      if (candidate.artistName) {
        artistCounts.set(
          candidate.artistName,
          (artistCounts.get(candidate.artistName) ?? 0) + 1,
        );
      }
      for (const genre of candidate.genreNames) {
        const value = genre.trim();
        if (!value || value.toLowerCase() === 'music') continue;
        genreCounts.set(value, (genreCounts.get(value) ?? 0) + 1);
      }
    }
    const genres = [...genreCounts.entries()]
      .filter(([, count]) => count >= policy.globalMinimumShelfSize)
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, policy.globalGenreShelfLimit)
      .map(([genre]) => genre);
    const spotlightArtists = [...artistCounts.entries()]
      .filter(([, count]) => count >= policy.globalMinimumShelfSize)
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, policy.globalArtistShelfLimit)
      .map(([artist]) => artist);
    // Global Home uses the same 12-card preview contract as Personal Home;
    // detail pages retain the rest of each unique editorial collection.
    const perShelfLimit = Math.min(
      policy.globalShelfLimit,
      Math.max(policy.minimumShelfSize, candidates.length),
    );
    const add = (
      id: string,
      title: string,
      ranked: AlbumCandidate[],
      limit = perShelfLimit,
    ) => {
      const items = this.allocateGlobal(
        ranked,
        allocated,
        Math.max(limit, policy.shelfDetailLimit),
      );
      if (items.length < policy.globalMinimumShelfSize) return;
      items.forEach((item) => allocated.add(item.id));
      shelves.push({
        id,
        title,
        items,
        hasMore: items.length > policy.globalShelfLimit,
        modelVersion: PERSONALIZATION_MODEL_VERSION,
      });
    };
    add(
      'global-top-picks',
      'Top Picks',
      candidates,
      Math.min(policy.topPicksLimit, perShelfLimit),
    );
    add(
      'global-trending-now',
      'Trending Now',
      [...candidates].sort(
        (left, right) =>
          right.popularity - left.popularity ||
          right.freshness - left.freshness ||
          left.id.localeCompare(right.id),
      ),
    );
    add('global-new-releases', 'New Releases', this.byFreshness(candidates));
    add(
      'global-popular-now',
      'Popular Now',
      [...candidates].sort(
        (left, right) =>
          right.feedback - left.feedback ||
          right.popularity - left.popularity ||
          left.id.localeCompare(right.id),
      ),
    );
    add(
      'global-discover',
      'Discover Something New',
      [...candidates].sort(
        (left, right) =>
          right.freshness - left.freshness ||
          right.score - left.score ||
          left.id.localeCompare(right.id),
      ),
    );
    for (const genre of genres)
      add(
        `global-genre-${this.slug(genre)}`,
        `${genre}`,
        this.forGenre(candidates, genre),
      );
    for (const spotlightArtist of spotlightArtists) {
      add(
        `global-artist-${this.slug(spotlightArtist)}`,
        `More from ${spotlightArtist}`,
        candidates.filter(
          (candidate) => candidate.artistName === spotlightArtist,
        ),
      );
    }

    // Genre coverage depends on the current catalog. Fill any remaining
    // editorial slots from independently ranked catalog cuts so Global Home
    // has a stable, complete shape even when only a few genres are present.
    const editorialFallbacks: Array<[string, string, AlbumCandidate[]]> = [
      [
        'global-fresh-finds',
        'Catalog Spotlight',
        [...candidates].sort(
          (left, right) =>
            right.freshness - left.freshness ||
            right.score - left.score ||
            left.id.localeCompare(right.id),
        ),
      ],
      [
        'global-rising-now',
        'Rising Now',
        [...candidates].sort(
          (left, right) =>
            right.feedback - left.feedback ||
            right.popularity - left.popularity ||
            right.freshness - left.freshness ||
            left.id.localeCompare(right.id),
        ),
      ],
      [
        'global-albums-to-explore',
        'Discover More',
        [...candidates].sort(
          (left, right) =>
            right.score - left.score || left.id.localeCompare(right.id),
        ),
      ],
      [
        'global-deep-cuts',
        'From the Catalog',
        [...candidates].sort(
          (left, right) =>
            left.freshness - right.freshness ||
            right.popularity - left.popularity ||
            left.id.localeCompare(right.id),
        ),
      ],
    ];
    for (const [id, title, ranked] of editorialFallbacks) {
      if (shelves.length >= policy.globalAlbumShelfTarget) break;
      add(id, title, ranked);
    }
    return shelves;
  }

  private async collectAlbumCandidates(
    userId: string,
    profile: TasteProfile,
  ): Promise<AlbumCandidate[]> {
    const [
      collaborative,
      popularity,
      feedback,
      seeds,
      freshAlbumIds,
      affinityAlbumIds,
      audioSimilarity,
    ] = await Promise.all([
      this.collaborativeAlbumScores(userId, [...profile.listenedSongIds]),
      this.popularAlbumScores(),
      this.interactionScores(userId),
      this.recentAlbumSeeds(userId),
      this.latestAlbumIds(policy.freshCandidateLimit),
      this.affinityAlbumIds(profile, [...profile.listenedAlbumIds]),
      this.audioSimilarAlbumScores([...profile.listenedSongIds]),
    ]);
    const candidateIds = this.candidateIds(
      affinityAlbumIds,
      this.rankedIds(collaborative, policy.signalCandidateLimit),
      this.rankedIds(popularity, policy.signalCandidateLimit),
      this.rankedIds(feedback, policy.signalCandidateLimit),
      this.rankedIds(audioSimilarity, policy.audioCandidateLimit),
      freshAlbumIds,
    );
    const [albums, publishedAlbumIds] = await Promise.all([
      this.albumSnapshots(candidateIds, [...profile.listenedAlbumIds]),
      this.publishedAlbumIds(candidateIds),
    ]);
    const artists = new Map(
      profile.artists.map((entry) => [entry.name, entry.weight]),
    );
    const genres = new Map(
      profile.genres.map((entry) => [entry.name, entry.weight]),
    );
    return albums
      .filter(
        (album) =>
          publishedAlbumIds.has(album.resourceId) &&
          !profile.hiddenResourceIds.get('albums')?.has(album.resourceId),
      )
      .map((album) => {
        const artistAffinity = artists.get(album.artistName) ?? 0;
        const genreAffinity = Math.min(
          1,
          album.genreNames.reduce(
            (sum, genre) => sum + (genres.get(genre) ?? 0),
            0,
          ),
        );
        const freshness = this.freshness(album.releaseDate);
        const collaborativeScore = collaborative.get(album.resourceId) ?? 0;
        const popularityScore = popularity.get(album.resourceId) ?? 0;
        const feedbackScore = feedback.get(album.resourceId) ?? 0;
        const contentSimilarity = this.contentAffinity(album, seeds);
        const audioSimilarityScore = audioSimilarity.get(album.resourceId) ?? 0;
        const novelty = artistAffinity === 0 ? 1 : 0;
        const sources = new Set<CandidateSource>();
        if (artistAffinity || genreAffinity) sources.add('taste');
        if (contentSimilarity > 0) sources.add('content');
        if (audioSimilarityScore > 0) sources.add('audio');
        if (freshness > 0) sources.add('fresh');
        if (collaborativeScore > 0) sources.add('collaborative');
        if (popularityScore > 0) sources.add('popular');
        return {
          id: album.resourceId,
          artistName: album.artistName,
          artworkPerceptualHash: this.artworkPerceptualHash(album.attributes),
          genreNames: album.genreNames,
          audioTraits: album.audioTraits,
          releaseDate: album.releaseDate,
          artistAffinity,
          genreAffinity,
          contentSimilarity,
          audioSimilarity: audioSimilarityScore,
          collaborative: collaborativeScore,
          popularity: popularityScore,
          freshness,
          feedback: feedbackScore,
          sources,
          score:
            artistAffinity * policy.weights.artistAffinity +
            genreAffinity * policy.weights.genreAffinity +
            contentSimilarity * policy.weights.contentSimilarity +
            audioSimilarityScore * policy.weights.audioSimilarity +
            collaborativeScore * policy.weights.collaborative +
            popularityScore * policy.weights.popularity +
            freshness * policy.weights.freshness +
            novelty * policy.weights.novelty +
            feedbackScore * policy.weights.feedback,
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score || left.id.localeCompare(right.id),
      );
  }

  private async audioSimilarAlbumScores(
    listenedSongIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (!listenedSongIds.length || !this.audioVectors.isEnabled()) {
      return new Map();
    }

    try {
      const neighbours = await this.audioVectors.findNeighboursBySongIds(
        listenedSongIds,
        policy.audioNeighboursPerSeed,
      );
      const scores = new Map<string, number>();
      for (const neighbour of neighbours) {
        // Qdrant cosine similarity is normally [-1, 1]. Ignore weak/negative
        // matches and retain the strongest evidence per album.
        const score = Math.max(0, Math.min(1, neighbour.score));
        if (score < policy.minimumAudioSimilarity) continue;
        scores.set(
          neighbour.albumId,
          Math.max(scores.get(neighbour.albumId) ?? 0, score),
        );
      }
      return scores;
    } catch {
      // Vector retrieval is an additive signal; keep Home generation available
      // during a Qdrant restart or while a collection is being rebuilt.
      return new Map();
    }
  }

  private async latestAlbumIds(limit: number): Promise<string[]> {
    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: { resourceType: 'albums' },
      select: { resourceId: true },
      take: limit,
      orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
    });

    return albums.map((album) => album.resourceId);
  }

  private async affinityAlbumIds(
    profile: TasteProfile,
    excludedIds: string[],
  ): Promise<string[]> {
    const artists = profile.artists
      .filter((artist) => artist.weight > 0.05)
      .slice(0, 10)
      .map((artist) => artist.name);
    const genres = profile.genres
      .filter((genre) => genre.weight > 0.05)
      .slice(0, 10)
      .map((genre) => genre.name);
    const affinityFilters = [
      ...(artists.length ? [{ artistName: { in: artists } }] : []),
      ...(genres.length ? [{ genreNames: { hasSome: genres } }] : []),
    ];
    if (affinityFilters.length === 0) return [];

    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        ...(excludedIds.length ? { resourceId: { notIn: excludedIds } } : {}),
        OR: affinityFilters,
      },
      select: { resourceId: true },
      take: policy.affinityCandidateLimit,
      orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
    });

    return albums.map((album) => album.resourceId);
  }

  private candidateIds(...sources: Array<readonly string[]>): string[] {
    const ids = new Set<string>();
    for (const source of sources) {
      for (const id of source) {
        if (!id) continue;
        ids.add(id);
        if (ids.size >= policy.candidatePoolLimit) return [...ids];
      }
    }
    return [...ids];
  }

  private rankedIds(scores: Map<string, number>, limit: number): string[] {
    return [...scores.entries()]
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, limit)
      .map(([id]) => id);
  }

  private async albumSnapshots(ids: string[], excludedIds: string[] = []) {
    if (ids.length === 0) return [];

    return this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        resourceId: {
          in: ids,
          ...(excludedIds.length ? { notIn: excludedIds } : {}),
        },
      },
      select: {
        resourceId: true,
        artistName: true,
        attributes: true,
        genreNames: true,
        audioTraits: true,
        releaseDate: true,
      },
    });
  }

  private async recentAlbumSeeds(userId: string) {
    const rows = await this.prisma.userListeningStats.findMany({
      where: { userId, albumId: { not: '' } },
      orderBy: { lastPlayedAt: 'desc' },
      take: 100,
      select: { albumId: true, albumName: true },
    });
    const uniqueRows = rows
      .filter(
        (row, index, all) =>
          row.albumId &&
          all.findIndex((candidate) => candidate.albumId === row.albumId) ===
            index,
      )
      .slice(0, 3);
    const snapshots = uniqueRows.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'albums',
            resourceId: { in: uniqueRows.map((row) => row.albumId) },
          },
          select: {
            resourceId: true,
            name: true,
            externalUrl: true,
            artworkUrl: true,
            artworkBgColor: true,
            artistName: true,
            genreNames: true,
            audioTraits: true,
          },
        })
      : [];
    const metadata = new Map(
      snapshots.map((snapshot) => [snapshot.resourceId, snapshot]),
    );
    return uniqueRows.map((row) => {
      const snapshot = metadata.get(row.albumId);

      return {
        id: row.albumId,
        name: snapshot?.name || row.albumName || 'Your recent favorite',
        url: snapshot?.externalUrl ?? '',
        artworkUrl: snapshot?.artworkUrl ?? '',
        artworkBgColor: snapshot?.artworkBgColor ?? '',
        artistName: snapshot?.artistName ?? '',
        genreNames: snapshot?.genreNames ?? [],
        audioTraits: snapshot?.audioTraits ?? [],
      };
    });
  }

  private nearSeed(
    candidates: AlbumCandidate[],
    seed: {
      id: string;
      artistName: string;
      genreNames: string[];
      audioTraits: string[];
    },
  ) {
    return [...candidates].sort(
      (left, right) =>
        this.seedScore(right, seed) - this.seedScore(left, seed) ||
        right.score - left.score ||
        left.id.localeCompare(right.id),
    );
  }

  private seedScore(
    candidate: AlbumCandidate,
    seed: {
      id: string;
      artistName: string;
      genreNames: string[];
      audioTraits: string[];
    },
  ) {
    if (candidate.id === seed.id) return -1;
    return (
      this.contentSimilarity(candidate, seed) * 0.6 +
      (candidate.artistName === seed.artistName ? 1 : 0) * 0.15 +
      candidate.collaborative * 0.15 +
      candidate.freshness * 0.1
    );
  }

  /**
   * Content signal built from normalized catalog metadata. It deliberately
   * avoids fuzzy title matching: only curated audio traits and genres can
   * affect ranking, so an album with an empty metadata profile never receives
   * an accidental boost. Audio traits take precedence; genres provide a
   * deterministic fallback until the catalog has richer audio annotations.
   */
  private contentSimilarity(
    candidate: Pick<AlbumCandidate, 'genreNames' | 'audioTraits'>,
    seed: Pick<AlbumCandidate, 'genreNames' | 'audioTraits'>,
  ) {
    const traitSimilarity = this.jaccard(
      candidate.audioTraits,
      seed.audioTraits,
    );
    const genreSimilarity = this.jaccard(candidate.genreNames, seed.genreNames);
    if (candidate.audioTraits.length && seed.audioTraits.length) {
      return traitSimilarity * 0.75 + genreSimilarity * 0.25;
    }
    return genreSimilarity;
  }

  private contentAffinity(
    candidate: Pick<AlbumCandidate, 'genreNames' | 'audioTraits'>,
    seeds: Array<{
      genreNames: string[];
      audioTraits: string[];
    }>,
  ) {
    return seeds.reduce(
      (maximum, seed) =>
        Math.max(maximum, this.contentSimilarity(candidate, seed)),
      0,
    );
  }

  private jaccard(left: string[], right: string[]) {
    const leftValues = new Set(
      left.map((value) => value.trim().toLowerCase()).filter(Boolean),
    );
    const rightValues = new Set(
      right.map((value) => value.trim().toLowerCase()).filter(Boolean),
    );
    if (!leftValues.size || !rightValues.size) return 0;
    const intersection = [...leftValues].filter((value) =>
      rightValues.has(value),
    ).length;
    return intersection / new Set([...leftValues, ...rightValues]).size;
  }

  private forGenre(candidates: AlbumCandidate[], genre: string) {
    return candidates
      .filter((candidate) => candidate.genreNames.includes(genre))
      .sort(
        (left, right) =>
          right.score - left.score || left.id.localeCompare(right.id),
      );
  }

  private byFreshness(candidates: AlbumCandidate[]) {
    return [...candidates].sort(
      (left, right) =>
        right.freshness - left.freshness ||
        right.genreAffinity - left.genreAffinity ||
        right.score - left.score ||
        left.id.localeCompare(right.id),
    );
  }

  private forFans(candidates: AlbumCandidate[], artist: string) {
    const score = (candidate: AlbumCandidate) =>
      candidate.collaborative * 0.55 +
      candidate.genreAffinity * 0.25 +
      candidate.popularity * 0.2 -
      (candidate.artistName === artist ? 0.08 : 0);
    return [...candidates].sort(
      (left, right) =>
        score(right) - score(left) ||
        right.score - left.score ||
        left.id.localeCompare(right.id),
    );
  }

  private allocate(
    candidates: AlbumCandidate[],
    allocated: Set<string>,
    limit: number = policy.shelfLimit,
  ) {
    const artistCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();
    const selected: Array<{ id: string; type: 'albums' }> = [];
    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      if (
        allocated.has(candidate.id) ||
        (artistCounts.get(candidate.artistName) ?? 0) >= policy.maxPerArtist
      )
        continue;
      const primaryGenre = candidate.genreNames[0] ?? '';
      if (
        primaryGenre &&
        (genreCounts.get(primaryGenre) ?? 0) >= policy.maxPerGenre
      )
        continue;
      artistCounts.set(
        candidate.artistName,
        (artistCounts.get(candidate.artistName) ?? 0) + 1,
      );
      if (primaryGenre)
        genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) ?? 0) + 1);
      selected.push({ id: candidate.id, type: 'albums' });
    }
    return selected;
  }

  private sequenceRelatedAlbums(candidates: AlbumCandidate[], limit: number) {
    const remaining = [...candidates];
    const artistCounts = new Map<string, number>();
    const selected: AlbumCandidate[] = [];
    let previousArtist = '';

    while (remaining.length > 0 && selected.length < limit) {
      const nextIndex = remaining.findIndex(
        (candidate) =>
          candidate.artistName !== previousArtist &&
          (artistCounts.get(candidate.artistName) ?? 0) < policy.maxPerArtist,
      );
      const fallbackIndex = remaining.findIndex(
        (candidate) =>
          (artistCounts.get(candidate.artistName) ?? 0) < policy.maxPerArtist,
      );
      const index = nextIndex >= 0 ? nextIndex : fallbackIndex;
      if (index < 0) break;

      const [next] = remaining.splice(index, 1);
      selected.push(next);
      previousArtist = next.artistName;
      artistCounts.set(
        next.artistName,
        (artistCounts.get(next.artistName) ?? 0) + 1,
      );
    }

    return this.diversifyArtwork(selected).map((candidate) => candidate.id);
  }

  private diversifyArtwork(candidates: AlbumCandidate[]): AlbumCandidate[] {
    const remaining = [...candidates];
    const ordered: AlbumCandidate[] = [];
    const cooldowns: Array<{ candidate: AlbumCandidate; until: number }> = [];

    while (remaining.length > 0) {
      const position = ordered.length;
      this.removeExpiredArtworkCooldowns(cooldowns, position);
      const nextIndex = remaining.findIndex((candidate) =>
        cooldowns.every(
          ({ candidate: recent, until }) =>
            position > until ||
            !this.artworksVisuallySimilar(candidate, recent),
        ),
      );
      const [next] = remaining.splice(nextIndex >= 0 ? nextIndex : 0, 1);
      ordered.push(next);
      cooldowns.push({
        candidate: next,
        until: position + this.artworkCooldown(next, position),
      });
    }
    return ordered;
  }

  private removeExpiredArtworkCooldowns(
    cooldowns: Array<{ candidate: AlbumCandidate; until: number }>,
    position: number,
  ): void {
    for (let index = cooldowns.length - 1; index >= 0; index -= 1) {
      if (position > cooldowns[index].until) cooldowns.splice(index, 1);
    }
  }

  private artworkCooldown(candidate: AlbumCandidate, position: number): number {
    return (
      7 +
      Math.floor(this.stableNoise(`${candidate.id}:${position}:artwork`) * 4)
    );
  }

  private artworksVisuallySimilar(
    left: AlbumCandidate,
    right: AlbumCandidate,
  ): boolean {
    const leftHash = left.artworkPerceptualHash ?? '';
    const rightHash = right.artworkPerceptualHash ?? '';
    return Boolean(
      leftHash &&
      rightHash &&
      this.perceptualHashDistance(leftHash, rightHash) <= 8,
    );
  }

  private perceptualHashDistance(left: string, right: string): number {
    if (!/^[a-f0-9]{16}$/i.test(left) || !/^[a-f0-9]{16}$/i.test(right)) {
      return Number.POSITIVE_INFINITY;
    }
    let distance = 0;
    for (let index = 0; index < left.length; index += 1) {
      let difference =
        Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
      while (difference > 0) {
        distance += difference & 1;
        difference >>>= 1;
      }
    }
    return distance;
  }

  private artworkPerceptualHash(attributes: unknown): string {
    if (
      !attributes ||
      typeof attributes !== 'object' ||
      Array.isArray(attributes)
    )
      return '';
    const artwork = (attributes as Record<string, unknown>).artwork;
    if (!artwork || typeof artwork !== 'object' || Array.isArray(artwork))
      return '';
    const hash = (artwork as Record<string, unknown>).perceptualHash;
    return typeof hash === 'string' ? hash.trim() : '';
  }

  private stableNoise(value: string) {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0) / 4_294_967_295;
  }

  /** Global and personal Home both keep album cards unique across shelves. */
  private allocateGlobal(
    candidates: AlbumCandidate[],
    allocated: Set<string>,
    limit: number,
  ) {
    return this.allocate(candidates, allocated, limit);
  }

  private async popularAlbumScores() {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const rows = await this.prisma.$queryRaw<AlbumPopularityRow[]>`
      SELECT
        "albumId",
        COUNT(*) FILTER (WHERE "eventType" = 'PLAY_START')::bigint AS plays,
        COUNT(*) FILTER (WHERE "eventType" = 'PLAY_COMPLETE')::bigint AS completions,
        COUNT(*) FILTER (WHERE "eventType" = 'SKIP')::bigint AS skips
      FROM "listening_events"
      WHERE "albumId" != ''
        AND "createdAt" >= ${since}
      GROUP BY "albumId"
      HAVING COUNT(*) FILTER (WHERE "eventType" = 'PLAY_START') > 0
      ORDER BY
        (
          COUNT(*) FILTER (WHERE "eventType" = 'PLAY_START') +
          COUNT(*) FILTER (WHERE "eventType" = 'PLAY_COMPLETE') * 0.75 -
          COUNT(*) FILTER (WHERE "eventType" = 'SKIP')
        ) DESC,
        "albumId" ASC
      LIMIT ${policy.candidateLimit}
    `;
    const scores = rows.map((row) => {
      const plays = Number(row.plays);
      const completions = Number(row.completions);
      const skips = Number(row.skips);
      const quality = Math.max(
        0.2,
        1 + (completions * 0.75 - skips) / Math.max(1, plays),
      );
      return [row.albumId, plays * quality] as const;
    });
    const maximum = Math.max(1, ...scores.map(([, score]) => score));

    return new Map(scores.map(([id, score]) => [id, score / maximum]));
  }

  private async interactionScores(userId?: string) {
    const historyStart = new Date(
      Date.now() - policy.historyWindowDays * 86_400_000,
    );
    const weighted = await this.prisma.recommendationInteraction.findMany({
      where: {
        resourceType: 'albums',
        occurredAt: { gte: historyStart },
        ...(userId ? { userId } : {}),
      },
      select: { resourceId: true, eventType: true, occurredAt: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      take: policy.interactionQueryLimit,
    });
    const scores = new Map<string, number>();
    for (const event of weighted) {
      const baseWeight =
        event.eventType === 'PLAY'
          ? 1
          : event.eventType === 'OPEN'
            ? 0.35
            : event.eventType === 'DISMISS'
              ? -0.5
              : 0.02;
      // Recent feedback is much more representative than a click from months
      // ago. A 90-day half-life preserves durable taste without allowing old
      // events to dominate the current Home forever.
      const ageDays =
        Math.max(0, Date.now() - event.occurredAt.getTime()) / 86_400_000;
      const recency = Math.pow(0.5, ageDays / 90);
      const weight = baseWeight * recency;
      scores.set(
        event.resourceId,
        Math.max(0, (scores.get(event.resourceId) ?? 0) + weight),
      );
    }
    const maximum = Math.max(1, ...scores.values());
    return new Map([...scores].map(([id, score]) => [id, score / maximum]));
  }

  private async collaborativeAlbumScores(
    userId: string,
    listenedSongIds: string[],
  ) {
    if (!listenedSongIds.length) return new Map<string, number>();
    const historyStart = new Date(
      Date.now() - policy.historyWindowDays * 86_400_000,
    );
    const overlaps = await this.prisma.userListeningStats.findMany({
      where: {
        userId: { not: userId },
        songId: { in: listenedSongIds },
        playCount: { gt: 0 },
        lastPlayedAt: { gte: historyStart },
      },
      select: {
        userId: true,
        playCount: true,
        completionCount: true,
        skipCount: true,
      },
      orderBy: [{ lastPlayedAt: 'desc' }, { userId: 'asc' }, { songId: 'asc' }],
      take: policy.collaborativeOverlapLimit,
    });
    const neighbours = new Map<string, number>();
    for (const row of overlaps)
      neighbours.set(
        row.userId,
        (neighbours.get(row.userId) ?? 0) +
          Math.max(
            0,
            row.completionCount + row.playCount * 0.25 - row.skipCount,
          ),
      );
    const topNeighbours = [...neighbours.entries()]
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, policy.collaborativeNeighbourLimit);
    if (!topNeighbours.length) return new Map<string, number>();
    const weights = new Map(topNeighbours);
    const rows = await this.prisma.userListeningStats.findMany({
      where: {
        userId: { in: topNeighbours.map(([id]) => id) },
        songId: { notIn: listenedSongIds },
        albumId: { not: '' },
        playCount: { gt: 0 },
        lastPlayedAt: { gte: historyStart },
      },
      select: {
        userId: true,
        albumId: true,
        playCount: true,
        completionCount: true,
        skipCount: true,
      },
      orderBy: [
        { playCount: 'desc' },
        { lastPlayedAt: 'desc' },
        { userId: 'asc' },
        { songId: 'asc' },
      ],
      take: policy.collaborativeCandidateLimit,
    });
    const raw = new Map<string, number>();
    for (const row of rows)
      raw.set(
        row.albumId,
        (raw.get(row.albumId) ?? 0) +
          Math.max(
            0,
            row.completionCount + row.playCount * 0.25 - row.skipCount,
          ) *
            (weights.get(row.userId) ?? 0),
      );
    const maximum = Math.max(1, ...raw.values());
    return new Map(
      [...raw].map(([albumId, score]) => [albumId, score / maximum]),
    );
  }

  private freshness(releaseDate: string) {
    const timestamp = new Date(releaseDate).getTime();
    if (!Number.isFinite(timestamp)) return 0;
    return Math.max(
      0,
      1 - (Date.now() - timestamp) / (policy.freshnessWindowDays * 86_400_000),
    );
  }

  /**
   * Recommendation snapshots are eventually consistent with catalog
   * publication. Validate the candidate pool before allocation so an
   * unpublished album is ignored, rather than rejecting the entire page
   * during its final metadata hydration.
   */
  private async publishedAlbumIds(ids: string[]): Promise<Set<string>> {
    const resources = await this.catalogService.resolve(
      [...new Set(ids)].map((id) => ({ id, type: 'albums' })),
    );

    return new Set(
      resources
        .filter((resource) => resource.type === 'albums')
        .map((resource) => resource.id),
    );
  }

  private slug(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'music'
    );
  }
}
