import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ListeningService, TasteProfile } from '../listening/listening.service';
import { RecommendationCatalogService } from '../recommendations/recommendation-catalog.service';
import { MORE_LIKE_SHELF_LIMIT } from '@musical/shared-constants';
import {
  PRODUCTION_RECOMMENDATION_MODEL_VERSION,
  PRODUCTION_RECOMMENDATION_POLICY as policy,
} from './production-recommendation-policy';

export const PERSONALIZATION_MODEL_VERSION =
  PRODUCTION_RECOMMENDATION_MODEL_VERSION;

type CandidateSource =
  'taste' | 'content' | 'fresh' | 'popular' | 'collaborative';
type AlbumCandidate = {
  id: string;
  artistName: string;
  genreNames: string[];
  audioTraits: string[];
  releaseDate: string;
  score: number;
  artistAffinity: number;
  genreAffinity: number;
  contentSimilarity: number;
  collaborative: number;
  popularity: number;
  freshness: number;
  feedback: number;
  sources: Set<CandidateSource>;
};

export type GeneratedShelf = {
  id: string;
  title: string;
  items: Array<{ id: string; type: 'albums' }>;
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
  ) {}

  async generateUserShelves(userId: string): Promise<GeneratedShelf[]> {
    const profile = await this.listeningService.getUserTasteProfile(userId);
    const candidates = await this.collectAlbumCandidates(userId, profile);
    if (candidates.length < policy.minimumShelfSize) return [];

    const allocated = new Set<string>();
    const result: GeneratedShelf[] = [];
    const seeds = await this.recentAlbumSeeds(userId);
    const topGenres = profile.genres.map((genre) => genre.name).slice(0, 4);
    const topArtists = profile.artists.map((artist) => artist.name).slice(0, 3);
    // Reserve the finite local catalog across all album-based Home slots. A
    // 40-album catalog should show eight meaningful shelves, not one 16-card
    // Top Picks shelf followed by empty gaps.
    const albumShelfSlots = 8;
    const perShelfLimit = Math.min(
      policy.shelfLimit,
      Math.max(
        policy.minimumShelfSize,
        Math.floor(candidates.length / albumShelfSlots),
      ),
    );

    const add = (
      id: string,
      title: string,
      ranked: AlbumCandidate[],
      limit = perShelfLimit,
      sourceAlbumId?: string,
      sourceAlbumName?: string,
      sourceAlbumUrl?: string,
      sourceAlbumArtworkUrl?: string,
      sourceAlbumArtworkBgColor?: string,
    ) => {
      const items = this.allocate(ranked, allocated, limit);
      if (items.length < policy.minimumShelfSize) return;
      items.forEach((item) => allocated.add(item.id));
      result.push({
        id,
        title,
        items,
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

  /** Global Home is editorial-style: no user-history signals, only freshness,
   * audience quality and controlled catalog diversity. */
  async generateGlobalShelves(): Promise<GeneratedShelf[]> {
    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: { resourceType: 'albums' },
      select: {
        resourceId: true,
        artistName: true,
        genreNames: true,
        audioTraits: true,
        releaseDate: true,
      },
      take: policy.candidateLimit,
      orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
    });
    const [popularity, feedback] = await Promise.all([
      this.popularAlbumScores(),
      this.interactionScores(),
    ]);
    const publishedAlbumIds = await this.publishedAlbumIds(
      albums.map((album) => album.resourceId),
    );
    const candidates = albums
      .filter((album) => publishedAlbumIds.has(album.resourceId))
      .map((album) => {
        const freshness = this.freshness(album.releaseDate);
        const popularityScore = popularity.get(album.resourceId) ?? 0;
        const feedbackScore = feedback.get(album.resourceId) ?? 0;
        return {
          id: album.resourceId,
          artistName: album.artistName,
          genreNames: album.genreNames,
          audioTraits: album.audioTraits,
          releaseDate: album.releaseDate,
          artistAffinity: 0,
          genreAffinity: 0,
          contentSimilarity: 0,
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
    // The global page must remain a complete Home even with a modest local
    // catalog. Reserve candidates across its editorial slots rather than
    // allowing the first shelf to consume all 16 cards.
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
      const items = this.allocateGlobal(ranked, allocated, limit);
      if (items.length < policy.globalMinimumShelfSize) return;
      items.forEach((item) => allocated.add(item.id));
      shelves.push({
        id,
        title,
        items,
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
    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        resourceId: { notIn: [...profile.listenedAlbumIds] },
      },
      select: {
        resourceId: true,
        artistName: true,
        genreNames: true,
        audioTraits: true,
        releaseDate: true,
      },
      take: policy.candidateLimit,
      orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
    });
    const publishedAlbumIds = await this.publishedAlbumIds(
      albums.map((album) => album.resourceId),
    );
    const [collaborative, popularity, feedback] = await Promise.all([
      this.collaborativeAlbumScores(userId, [...profile.listenedSongIds]),
      this.popularAlbumScores(),
      this.interactionScores(userId),
    ]);
    const artists = new Map(
      profile.artists.map((entry) => [entry.name, entry.weight]),
    );
    const genres = new Map(
      profile.genres.map((entry) => [entry.name, entry.weight]),
    );
    const seeds = await this.recentAlbumSeeds(userId);
    return albums
      .filter((album) => publishedAlbumIds.has(album.resourceId))
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
        const novelty = artistAffinity === 0 ? 1 : 0;
        const sources = new Set<CandidateSource>();
        if (artistAffinity || genreAffinity) sources.add('taste');
        if (contentSimilarity > 0) sources.add('content');
        if (freshness > 0) sources.add('fresh');
        if (collaborativeScore > 0) sources.add('collaborative');
        if (popularityScore > 0) sources.add('popular');
        return {
          id: album.resourceId,
          artistName: album.artistName,
          genreNames: album.genreNames,
          audioTraits: album.audioTraits,
          releaseDate: album.releaseDate,
          artistAffinity,
          genreAffinity,
          contentSimilarity,
          collaborative: collaborativeScore,
          popularity: popularityScore,
          freshness,
          feedback: feedbackScore,
          sources,
          score:
            artistAffinity * policy.weights.artistAffinity +
            genreAffinity * policy.weights.genreAffinity +
            contentSimilarity * policy.weights.contentSimilarity +
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

  /**
   * Editorial/global shelves aim for a complete Home. Prefer page-wide unique
   * albums, then reuse the best themed candidates only when the local catalog
   * is too small to fill another useful shelf. Personal Home never reuses this
   * fallback and remains strictly de-duplicated.
   */
  private allocateGlobal(
    candidates: AlbumCandidate[],
    allocated: Set<string>,
    limit: number,
  ) {
    const unique = this.allocate(candidates, allocated, limit);
    if (unique.length >= limit) return unique;

    const selectedIds = new Set(unique.map((item) => item.id));
    const fallback = this.allocate(
      candidates,
      selectedIds,
      limit - unique.length,
    );
    unique.forEach((item) => allocated.add(item.id));
    return [...unique, ...fallback];
  }

  private async popularAlbumScores() {
    const stats = await this.prisma.userListeningStats.groupBy({
      by: ['albumId'],
      where: { albumId: { not: '' }, playCount: { gt: 0 } },
      _sum: { playCount: true, completionCount: true, skipCount: true },
      orderBy: { _sum: { playCount: 'desc' } },
      take: policy.candidateLimit,
    });
    const maximum = stats[0]?._sum.playCount ?? 1;
    return new Map(
      stats.map((stat) => [
        stat.albumId,
        ((stat._sum.playCount ?? 0) / maximum) *
          Math.max(
            0.2,
            1 +
              ((stat._sum.completionCount ?? 0) - (stat._sum.skipCount ?? 0)) /
                Math.max(1, stat._sum.playCount ?? 1),
          ),
      ]),
    );
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

  /** Snapshots may lag publication changes. Validate candidates against the
   * catalog source of truth before persisting a recommendation page. */
  private async publishedAlbumIds(ids: string[]): Promise<Set<string>> {
    const published = new Set<string>();
    for (let index = 0; index < ids.length; index += 100) {
      const resources = await this.catalogService.resolve(
        ids.slice(index, index + 100).map((id) => ({ id, type: 'albums' })),
      );
      for (const resource of resources) {
        if (resource.type === 'albums') published.add(resource.id);
      }
    }
    return published;
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
