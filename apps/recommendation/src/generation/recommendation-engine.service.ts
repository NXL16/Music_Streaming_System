import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ListeningService, TasteProfile } from '../listening/listening.service';
import { RecommendationCatalogService } from '../recommendations/recommendation-catalog.service';
import {
  PRODUCTION_RECOMMENDATION_MODEL_VERSION,
  PRODUCTION_RECOMMENDATION_POLICY as policy,
} from './production-recommendation-policy';

export const PERSONALIZATION_MODEL_VERSION =
  PRODUCTION_RECOMMENDATION_MODEL_VERSION;

type CandidateSource = 'taste' | 'fresh' | 'popular' | 'collaborative';
type AlbumCandidate = {
  id: string;
  artistName: string;
  genreNames: string[];
  releaseDate: string;
  score: number;
  artistAffinity: number;
  genreAffinity: number;
  collaborative: number;
  popularity: number;
  freshness: number;
  sources: Set<CandidateSource>;
};

export type GeneratedShelf = {
  id: string;
  title: string;
  items: Array<{ id: string; type: 'albums' }>;
  modelVersion: number;
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
    const topGenres = profile.genres.map((genre) => genre.name).slice(0, 2);
    const topArtist = profile.artists[0]?.name;

    const add = (id: string, title: string, ranked: AlbumCandidate[]) => {
      const items = this.allocate(ranked, allocated);
      if (items.length < policy.minimumShelfSize) return;
      items.forEach((item) => allocated.add(item.id));
      result.push({
        id,
        title,
        items,
        modelVersion: PERSONALIZATION_MODEL_VERSION,
      });
    };

    add('user-top-picks', 'Top Picks for You', candidates);
    if (seeds[0]) add('user-more-like-1', `More Like ${seeds[0].name}`, this.nearSeed(candidates, seeds[0]));
    if (topGenres[0]) add('user-genre-1', `${topGenres[0]} Music`, this.forGenre(candidates, topGenres[0]));
    add('user-new-releases', 'New Releases for You', this.byFreshness(candidates));
    if (seeds[1]) add('user-more-like-2', `More Like ${seeds[1].name}`, this.nearSeed(candidates, seeds[1]));
    if (topArtist) add('user-fans-like', `${topArtist} Fans Like`, this.forFans(candidates, topArtist));
    if (seeds[2]) add('user-more-like-3', `More Like ${seeds[2].name}`, this.nearSeed(candidates, seeds[2]));
    if (topGenres[1]) add('user-genre-2', `${topGenres[1]} Music`, this.forGenre(candidates, topGenres[1]));
    return result;
  }

  /** Global Home is editorial-style: no user-history signals, only freshness,
   * audience quality and controlled catalog diversity. */
  async generateGlobalShelves(): Promise<GeneratedShelf[]> {
    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: { resourceType: 'albums' },
      select: { resourceId: true, artistName: true, genreNames: true, releaseDate: true },
      take: policy.candidateLimit,
      orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
    });
    const popularity = await this.popularAlbumScores();
    const publishedAlbumIds = await this.publishedAlbumIds(
      albums.map((album) => album.resourceId),
    );
    const candidates = albums.filter((album) => publishedAlbumIds.has(album.resourceId)).map((album) => {
      const freshness = this.freshness(album.releaseDate);
      const popularityScore = popularity.get(album.resourceId) ?? 0;
      return {
        id: album.resourceId,
        artistName: album.artistName,
        genreNames: album.genreNames,
        releaseDate: album.releaseDate,
        artistAffinity: 0,
        genreAffinity: 0,
        collaborative: 0,
        popularity: popularityScore,
        freshness,
        sources: new Set<CandidateSource>([
          ...(freshness > 0 ? ['fresh' as const] : []),
          ...(popularityScore > 0 ? ['popular' as const] : []),
        ]),
        score: freshness * 0.58 + popularityScore * 0.42,
      };
    }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const allocated = new Set<string>();
    const shelves: GeneratedShelf[] = [];
    const add = (id: string, title: string, ranked: AlbumCandidate[]) => {
      const items = this.allocate(ranked, allocated);
      if (items.length < policy.minimumShelfSize) return;
      items.forEach((item) => allocated.add(item.id));
      shelves.push({ id, title, items, modelVersion: PERSONALIZATION_MODEL_VERSION });
    };
    add('global-featured-now', 'Featured Now', candidates);
    add('global-trending-now', 'Trending Now', [...candidates].sort((left, right) => right.popularity - left.popularity || right.freshness - left.freshness || left.id.localeCompare(right.id)));
    add('global-new-releases', 'New Releases', this.byFreshness(candidates));
    const genres = [...new Set(candidates.flatMap((candidate) => candidate.genreNames))].slice(0, 6);
    for (const genre of genres) add(`global-genre-${this.slug(genre)}`, `${genre} Music`, this.forGenre(candidates, genre));
    return shelves;
  }

  private async collectAlbumCandidates(userId: string, profile: TasteProfile): Promise<AlbumCandidate[]> {
    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: { resourceType: 'albums', resourceId: { notIn: [...profile.listenedAlbumIds] } },
      select: { resourceId: true, artistName: true, genreNames: true, releaseDate: true },
      take: policy.candidateLimit,
      orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
    });
    const publishedAlbumIds = await this.publishedAlbumIds(
      albums.map((album) => album.resourceId),
    );
    const collaborative = await this.collaborativeAlbumScores(userId, [...profile.listenedSongIds]);
    const popularity = await this.popularAlbumScores();
    const artists = new Map(profile.artists.map((entry) => [entry.name, entry.weight]));
    const genres = new Map(profile.genres.map((entry) => [entry.name, entry.weight]));
    return albums.filter((album) => publishedAlbumIds.has(album.resourceId)).map((album) => {
      const artistAffinity = artists.get(album.artistName) ?? 0;
      const genreAffinity = Math.min(1, album.genreNames.reduce((sum, genre) => sum + (genres.get(genre) ?? 0), 0));
      const freshness = this.freshness(album.releaseDate);
      const collaborativeScore = collaborative.get(album.resourceId) ?? 0;
      const popularityScore = popularity.get(album.resourceId) ?? 0;
      const novelty = artistAffinity === 0 ? 1 : 0;
      const sources = new Set<CandidateSource>();
      if (artistAffinity || genreAffinity) sources.add('taste');
      if (freshness > 0) sources.add('fresh');
      if (collaborativeScore > 0) sources.add('collaborative');
      if (popularityScore > 0) sources.add('popular');
      return {
        id: album.resourceId,
        artistName: album.artistName,
        genreNames: album.genreNames,
        releaseDate: album.releaseDate,
        artistAffinity,
        genreAffinity,
        collaborative: collaborativeScore,
        popularity: popularityScore,
        freshness,
        sources,
        score:
          artistAffinity * policy.weights.artistAffinity +
          genreAffinity * policy.weights.genreAffinity +
          collaborativeScore * policy.weights.collaborative +
          popularityScore * policy.weights.popularity +
          freshness * policy.weights.freshness +
          novelty * policy.weights.novelty,
      };
    }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  }

  private async recentAlbumSeeds(userId: string) {
    const rows = await this.prisma.userListeningStats.findMany({
      where: { userId, albumId: { not: '' } },
      orderBy: { lastPlayedAt: 'desc' },
      take: 100,
      select: { albumId: true, albumName: true },
    });
    const uniqueRows = rows
      .filter((row, index, all) =>
        row.albumId && all.findIndex((candidate) => candidate.albumId === row.albumId) === index,
      )
      .slice(0, 3);
    const snapshots = uniqueRows.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'albums',
            resourceId: { in: uniqueRows.map((row) => row.albumId) },
          },
          select: { resourceId: true, artistName: true, genreNames: true },
        })
      : [];
    const metadata = new Map(snapshots.map((snapshot) => [snapshot.resourceId, snapshot]));
    return uniqueRows.map((row) => ({
      id: row.albumId,
      name: row.albumName || 'Your recent favorite',
      artistName: metadata.get(row.albumId)?.artistName ?? '',
      genreNames: metadata.get(row.albumId)?.genreNames ?? [],
    }));
  }

  private nearSeed(candidates: AlbumCandidate[], seed: { id: string; artistName: string; genreNames: string[] }) {
    return [...candidates].sort((left, right) => this.seedScore(right, seed) - this.seedScore(left, seed) || right.score - left.score || left.id.localeCompare(right.id));
  }

  private seedScore(candidate: AlbumCandidate, seed: { id: string; artistName: string; genreNames: string[] }) {
    if (candidate.id === seed.id) return -1;
    const sharedGenres = candidate.genreNames.filter((genre) => seed.genreNames.includes(genre)).length;
    return Math.min(1, sharedGenres / Math.max(1, seed.genreNames.length)) * 0.5 +
      (candidate.artistName === seed.artistName ? 1 : 0) * 0.2 +
      candidate.collaborative * 0.2 + candidate.freshness * 0.1;
  }

  private forGenre(candidates: AlbumCandidate[], genre: string) {
    return candidates.filter((candidate) => candidate.genreNames.includes(genre)).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  }

  private byFreshness(candidates: AlbumCandidate[]) {
    return [...candidates].sort((left, right) => right.freshness - left.freshness || right.genreAffinity - left.genreAffinity || right.score - left.score || left.id.localeCompare(right.id));
  }

  private forFans(candidates: AlbumCandidate[], artist: string) {
    const score = (candidate: AlbumCandidate) =>
      candidate.collaborative * 0.55 +
      candidate.genreAffinity * 0.25 +
      candidate.popularity * 0.2 -
      (candidate.artistName === artist ? 0.08 : 0);
    return [...candidates].sort((left, right) => score(right) - score(left) || right.score - left.score || left.id.localeCompare(right.id));
  }

  private allocate(candidates: AlbumCandidate[], allocated: Set<string>) {
    const artistCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();
    const selected: Array<{ id: string; type: 'albums' }> = [];
    for (const candidate of candidates) {
      if (selected.length >= policy.shelfLimit) break;
      if (allocated.has(candidate.id) || (artistCounts.get(candidate.artistName) ?? 0) >= policy.maxPerArtist) continue;
      const primaryGenre = candidate.genreNames[0] ?? '';
      if (primaryGenre && (genreCounts.get(primaryGenre) ?? 0) >= policy.maxPerGenre) continue;
      artistCounts.set(candidate.artistName, (artistCounts.get(candidate.artistName) ?? 0) + 1);
      if (primaryGenre) genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) ?? 0) + 1);
      selected.push({ id: candidate.id, type: 'albums' });
    }
    return selected;
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
    return new Map(stats.map((stat) => [stat.albumId, ((stat._sum.playCount ?? 0) / maximum) * Math.max(0.2, 1 + ((stat._sum.completionCount ?? 0) - (stat._sum.skipCount ?? 0)) / Math.max(1, stat._sum.playCount ?? 1))]));
  }

  private async collaborativeAlbumScores(userId: string, listenedSongIds: string[]) {
    if (!listenedSongIds.length) return new Map<string, number>();
    const overlaps = await this.prisma.userListeningStats.findMany({
      where: { userId: { not: userId }, songId: { in: listenedSongIds }, playCount: { gt: 0 } },
      select: { userId: true, playCount: true, completionCount: true, skipCount: true },
      take: 5000,
    });
    const neighbours = new Map<string, number>();
    for (const row of overlaps) neighbours.set(row.userId, (neighbours.get(row.userId) ?? 0) + Math.max(0, row.completionCount + row.playCount * 0.25 - row.skipCount));
    const topNeighbours = [...neighbours.entries()].sort((left, right) => right[1] - left[1]).slice(0, 100);
    if (!topNeighbours.length) return new Map<string, number>();
    const weights = new Map(topNeighbours);
    const rows = await this.prisma.userListeningStats.findMany({
      where: { userId: { in: topNeighbours.map(([id]) => id) }, songId: { notIn: listenedSongIds }, albumId: { not: '' }, playCount: { gt: 0 } },
      select: { userId: true, albumId: true, playCount: true, completionCount: true, skipCount: true },
      take: 10000,
    });
    const raw = new Map<string, number>();
    for (const row of rows) raw.set(row.albumId, (raw.get(row.albumId) ?? 0) + Math.max(0, row.completionCount + row.playCount * 0.25 - row.skipCount) * (weights.get(row.userId) ?? 0));
    const maximum = Math.max(1, ...raw.values());
    return new Map([...raw].map(([albumId, score]) => [albumId, score / maximum]));
  }

  private freshness(releaseDate: string) {
    const timestamp = new Date(releaseDate).getTime();
    if (!Number.isFinite(timestamp)) return 0;
    return Math.max(0, 1 - (Date.now() - timestamp) / (policy.freshnessWindowDays * 86_400_000));
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
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'music';
  }
}
