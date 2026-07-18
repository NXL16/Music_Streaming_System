import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ListeningService, TasteProfile } from '../listening/listening.service';
import { RecommendationCatalogService } from '../recommendations/recommendation-catalog.service';

/** One deterministic, auditable pipeline for all personalised shelves. */
export const PERSONALIZATION_MODEL_VERSION = 3;
const MIN_HISTORY = 3;
const CANDIDATE_LIMIT = 500;
const SHELF_LIMIT = 20;
const MAX_PER_ARTIST = 2;

type Source = 'affinity' | 'fresh' | 'popular' | 'collaborative';
type Candidate = {
  id: string; type: string; artistName: string; genreNames: string[]; releaseDate: string;
  sources: Set<Source>; collaborative: number; popularity: number; score: number;
};
type SnapshotSelect = { resourceId: true; resourceType: true; artistName: true; genreNames: true; releaseDate: true };
export type GeneratedShelf = { id: string; title: string; items: Array<{ id: string; type: string }>; modelVersion: number };

@Injectable()
export class RecommendationEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listeningService: ListeningService,
    private readonly catalogService: RecommendationCatalogService,
  ) {}

  async generateUserShelves(userId: string): Promise<GeneratedShelf[]> {
    const profile = await this.listeningService.getUserTasteProfile(userId);
    if (profile.listenedSongIds.size < MIN_HISTORY) return [];
    const ranked = this.rank(await this.collectCandidates(userId, profile), profile);
    // Allocate shelves in priority order. An album is owned by one shelf only;
    // Home must not rely on presentation-time deduplication to hide repeats.
    const allocatedAlbumIds = new Set<string>();
    const shelves: GeneratedShelf[] = [];
    const addShelf = async (id: string, title: string, candidates: Candidate[]) => {
      const shelf = await this.shelf(id, title, candidates, allocatedAlbumIds);
      if (!shelf) return;
      shelf.items.forEach((item) => allocatedAlbumIds.add(item.id));
      shelves.push(shelf);
    };

    await addShelf('user-top-picks', 'Top Picks for You', ranked);
    await addShelf('user-because-you-like', 'Because You Like This Sound', ranked.filter((x) => x.sources.has('affinity')));
    await addShelf('user-release-radar', 'Fresh For You', ranked.filter((x) => x.sources.has('fresh')));
    await addShelf('user-discover', 'Discover Something New', ranked.filter((x) => !profile.artists.some((artist) => artist.name === x.artistName)));
    return shelves;
  }

  private async collectCandidates(userId: string, profile: TasteProfile): Promise<Candidate[]> {
    const listenedIds = [...profile.listenedSongIds];
    const genres = profile.genres.filter((x) => x.weight >= 0.05).slice(0, 12).map((x) => x.name);
    const candidates = new Map<string, Candidate>();
    const select: SnapshotSelect = { resourceId: true, resourceType: true, artistName: true, genreNames: true, releaseDate: true };
    const add = (rows: Array<{ resourceId: string; resourceType: string; artistName: string; genreNames: string[]; releaseDate: string }>, source: Source) => {
      for (const row of rows) {
        if (profile.listenedSongIds.has(row.resourceId)) continue;
        const existing = candidates.get(row.resourceId);
        if (existing) { existing.sources.add(source); continue; }
        candidates.set(row.resourceId, { id: row.resourceId, type: row.resourceType, artistName: row.artistName, genreNames: row.genreNames, releaseDate: row.releaseDate, sources: new Set([source]), collaborative: 0, popularity: 0, score: 0 });
      }
    };
    if (genres.length) add(await this.prisma.recommendationResourceSnapshot.findMany({ where: { resourceType: 'songs', resourceId: { notIn: listenedIds }, genreNames: { hasSome: genres } }, take: CANDIDATE_LIMIT, select }), 'affinity');
    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    add(await this.prisma.recommendationResourceSnapshot.findMany({ where: { resourceType: 'songs', resourceId: { notIn: listenedIds }, releaseDate: { gte: cutoff }, ...(genres.length ? { genreNames: { hasSome: genres } } : {}) }, take: CANDIDATE_LIMIT, select }), 'fresh');
    const [collaborative, popular] = await Promise.all([this.collaborativeCandidates(userId, listenedIds, select), this.popularCandidates(listenedIds, select)]);
    add(collaborative.rows, 'collaborative'); add(popular.rows, 'popular');
    for (const [id, score] of collaborative.scores) { const candidate = candidates.get(id); if (candidate) candidate.collaborative = score; }
    for (const [id, score] of popular.scores) { const candidate = candidates.get(id); if (candidate) candidate.popularity = score; }
    return [...candidates.values()];
  }

  private async collaborativeCandidates(userId: string, listenedIds: string[], select: SnapshotSelect) {
    if (!listenedIds.length) return { rows: [], scores: new Map<string, number>() };
    const overlaps = await this.prisma.userListeningStats.findMany({ where: { userId: { not: userId }, songId: { in: listenedIds }, playCount: { gt: 0 } }, select: { userId: true, playCount: true, completionCount: true, skipCount: true }, take: 5_000 });
    const neighbours = new Map<string, number>();
    for (const row of overlaps) neighbours.set(row.userId, (neighbours.get(row.userId) ?? 0) + Math.max(0, row.completionCount + row.playCount * 0.25 - row.skipCount));
    const topNeighbours = [...neighbours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
    if (!topNeighbours.length) return { rows: [], scores: new Map<string, number>() };
    const weights = new Map(topNeighbours);
    const stats = await this.prisma.userListeningStats.findMany({ where: { userId: { in: topNeighbours.map(([id]) => id) }, songId: { notIn: listenedIds }, playCount: { gt: 0 } }, select: { userId: true, songId: true, playCount: true, completionCount: true, skipCount: true }, take: 10_000 });
    const raw = new Map<string, number>();
    for (const row of stats) raw.set(row.songId, (raw.get(row.songId) ?? 0) + Math.max(0, row.completionCount + row.playCount * 0.25 - row.skipCount) * (weights.get(row.userId) ?? 0));
    const top = [...raw.entries()].sort((a, b) => b[1] - a[1]).slice(0, CANDIDATE_LIMIT);
    const maximum = top[0]?.[1] ?? 1; const scores = new Map(top.map(([id, score]) => [id, score / maximum]));
    const rows = scores.size ? await this.prisma.recommendationResourceSnapshot.findMany({ where: { resourceType: 'songs', resourceId: { in: [...scores.keys()] } }, select }) : [];
    return { rows, scores };
  }

  private async popularCandidates(listenedIds: string[], select: SnapshotSelect) {
    const grouped = await this.prisma.userListeningStats.groupBy({ by: ['songId'], where: { songId: { notIn: listenedIds }, playCount: { gt: 0 } }, _sum: { playCount: true, completionCount: true, skipCount: true }, orderBy: { _sum: { playCount: 'desc' } }, take: CANDIDATE_LIMIT });
    const maximum = grouped[0]?._sum.playCount ?? 1;
    const scores = new Map(grouped.map((row) => { const plays = row._sum.playCount ?? 0; const quality = Math.max(0.15, 1 + ((row._sum.completionCount ?? 0) - (row._sum.skipCount ?? 0)) / Math.max(1, plays)); return [row.songId, (plays / maximum) * quality]; }));
    const rows = scores.size ? await this.prisma.recommendationResourceSnapshot.findMany({ where: { resourceType: 'songs', resourceId: { in: [...scores.keys()] } }, select }) : [];
    return { rows, scores };
  }

  private rank(candidates: Candidate[], profile: TasteProfile): Candidate[] {
    const artists = new Map(profile.artists.map((x) => [x.name, x.weight])); const genres = new Map(profile.genres.map((x) => [x.name, x.weight]));
    for (const candidate of candidates) { const artist = artists.get(candidate.artistName) ?? 0; const genre = Math.min(1, candidate.genreNames.reduce((sum, name) => sum + (genres.get(name) ?? 0), 0)); const discovery = artist === 0 ? 1 : 0; candidate.score = genre * 0.30 + artist * 0.20 + candidate.collaborative * 0.20 + candidate.popularity * 0.12 + this.freshness(candidate.releaseDate) * 0.10 + discovery * 0.08; }
    return candidates.sort((a, b) => b.score - a.score);
  }

  private async shelf(
    id: string,
    title: string,
    ranked: Candidate[],
    allocatedAlbumIds: Set<string>,
  ): Promise<GeneratedShelf | null> {
    const candidateWindow = ranked.slice(0, 150);
    const albumBySong = await this.catalogService.resolveSongAlbums(
      candidateWindow.map((candidate) => candidate.id),
    );
    const artistCounts = new Map<string, number>();
    const albumIds = new Set<string>();
    const albums: Array<{ id: string; type: string }> = [];
    for (const candidate of candidateWindow) {
      if (albums.length >= SHELF_LIMIT) break;
      const albumId = albumBySong.get(candidate.id)?.albumId;
      if (!albumId || allocatedAlbumIds.has(albumId) || albumIds.has(albumId)) {
        continue;
      }
      const artistCount = artistCounts.get(candidate.artistName) ?? 0;
      if (artistCount >= MAX_PER_ARTIST) continue;
      artistCounts.set(candidate.artistName, artistCount + 1);
      albumIds.add(albumId);
      albums.push({ id: albumId, type: 'albums' });
    }
    return albums.length >= 3 ? { id, title, items: albums, modelVersion: PERSONALIZATION_MODEL_VERSION } : null;
  }

  private freshness(value: string): number { const timestamp = new Date(value).getTime(); return Number.isFinite(timestamp) ? Math.max(0, 1 - (Date.now() - timestamp) / (180 * 86_400_000)) : 0; }
}
