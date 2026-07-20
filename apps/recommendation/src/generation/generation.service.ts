import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  GenerateRecommendationsRequest,
  GetHomeRecommendationsResponse,
  PersonalRecommendationResource,
  RecommendationPageScope,
  RecommendationPageStatus,
  RecommendationPresentationMode,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';
import { ListeningService, TasteProfile } from '../listening/listening.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { RecommendationCatalogService } from '../recommendations/recommendation-catalog.service';
import { CatalogSynchronizationService } from '../recommendations/catalog-synchronization.service';
import {
  GeneratedShelf,
  PERSONALIZATION_MODEL_VERSION,
  RecommendationEngineService,
} from './recommendation-engine.service';

const STALE_DURATION_MS = 6 * 60 * 60 * 1000;
const RELEASE_RADAR_DAYS = 30;
const MAX_PER_ARTIST = 3;
const DAILY_MIX_MAX_PER_ARTIST = 2;
const DAILY_MIX_TRACK_LIMIT = 25;
const DAILY_MIX_MIN_TRACKS = 5;
const DAILY_MIX_LIMIT = 4;
const STATION_TRACK_LIMIT = 80;
const STATION_MIN_TRACKS = 5;
const STATION_LIMIT = 8;
const SYSTEM_VARIANT_MAX_OVERLAP_RATIO = 0.6;
const SYSTEM_VARIANT_MIN_NOVEL_RATIO = 0.25;
const MIN_LISTENED_SONGS = 3;
const HOME_SHELF_ITEM_MIN = 10;
const HOME_SHELF_ITEM_LIMIT = 40;
const HOME_SHELF_PREVIEW_LIMIT = 16;
const GLOBAL_SHELF_MIN = 16;
const GLOBAL_SHELF_LIMIT = 20;
const GLOBAL_PUBLISH_MIN_SHELVES = 6;
const GLOBAL_HERO_LIMIT = 10;
const GLOBAL_GENRE_SECTION_LIMIT = 8;

const TIMEZONE_REGEX = /^[+-](?:0\d|1[0-4]):[0-5]\d$/;
const DEFAULT_TIMEZONE = '+07:00';

type ArtworkVariants = {
  renditions?: Array<{
    url?: string;
    width?: number;
    height?: number;
    contentType?: string;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function artworkVariantsFromAttributes(
  attributes: unknown,
): ArtworkVariants | undefined {
  if (!isRecord(attributes)) {
    return undefined;
  }
  const artwork = attributes.artwork;
  if (!isRecord(artwork)) {
    return undefined;
  }
  const variants = artwork.variants;
  return isRecord(variants) ? variants : undefined;
}

type ScoredItem = {
  id: string;
  type: string;
  score: number;
  artistName: string;
};

type SnapshotRow = {
  resourceId: string;
  resourceType: string;
  artistName: string;
  genreNames: string[];
  releaseDate: string;
  isSingle: boolean;
};

type AlbumShelfCandidate = {
  resourceId: string;
  resourceType: string;
  name: string;
  artistName: string;
  genreNames: string[];
  releaseDate: string;
  recordLabel: string;
  trackCount: number;
  updatedAt: Date;
};

function normalizeTimezone(value: string): string {
  const tz = value || DEFAULT_TIMEZONE;
  return TIMEZONE_REGEX.test(tz) ? tz : DEFAULT_TIMEZONE;
}

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly generatingUsers = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly listeningService: ListeningService,
    private readonly recommendationsService: RecommendationsService,
    private readonly catalogService: RecommendationCatalogService,
    private readonly catalogSynchronizationService: CatalogSynchronizationService,
    private readonly recommendationEngine: RecommendationEngineService,
  ) {}

  async generate(
    request: GenerateRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const scope = request.scope;
    if (
      scope === RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER
    ) {
      return this.generateUser(request);
    }
    return this.generateGlobal(request);
  }

  private generatingGlobal = false;

  async isGlobalPageStale(
    name: string,
    locale: string,
  ): Promise<boolean> {
    const page = await this.prisma.recommendationPage.findFirst({
      where: {
        scopeKey: 'GLOBAL',
        name: name || 'listen-now',
        locale: locale || 'en-GB',
        status: 'PUBLISHED',
      },
      select: { staleAfter: true },
    });
    if (!page) return true;
    if (!page.staleAfter) return true;
    return page.staleAfter <= new Date();
  }

  async tryLazyGenerateGlobal(
    name: string,
    locale: string,
    timezone: string,
    platform: string,
  ): Promise<GetHomeRecommendationsResponse | null> {
    if (this.generatingGlobal) return null;

    this.generatingGlobal = true;
    try {
      return await this.generateGlobal({
        userId: '',
        scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_GLOBAL,
        actorUserId: 'system:recommendation-engine',
        name: name || 'listen-now',
        locale: locale || 'en-GB',
        timezone: normalizeTimezone(timezone),
        platform: platform || 'web',
      });
    } catch (error) {
      this.logger.warn('Failed to lazy-generate global recommendations', error);
      return null;
    } finally {
      this.generatingGlobal = false;
    }
  }

  async tryLazyGenerateUser(
    userId: string,
    name: string,
    locale: string,
    timezone: string,
    platform: string,
  ): Promise<GetHomeRecommendationsResponse | null> {
    if (this.generatingUsers.has(userId)) {
      this.logger.debug(`[lazy-user] skip: already generating for ${userId}`);
      return null;
    }

    const hasHistory = await this.listeningService.hasListeningHistory(userId);
    if (!hasHistory) {
      this.logger.warn(`[lazy-user] skip: user ${userId} has < ${MIN_LISTENED_SONGS} listening stats`);
      return null;
    }

    const existingPage = await this.prisma.recommendationPage.findFirst({
      where: {
        scopeKey: `USER:${userId}`,
        name: name || 'listen-now',
        locale: locale || 'en-GB',
        timezone: normalizeTimezone(timezone),
        status: 'PUBLISHED',
      },
      select: {
        staleAfter: true,
        sections: {
          where: { externalId: 'user-top-picks' },
          select: { version: true },
        },
      },
    });
    const isStale =
      !existingPage?.staleAfter ||
      existingPage.staleAfter <= new Date() ||
      !existingPage.sections.some(
        (section) => section.version >= PERSONALIZATION_MODEL_VERSION,
      );

    if (!isStale) {
      const needsArtworkFix =
        (await this.hasZeroArtworkDimensions(userId)) ||
        (await this.hasMissingSystemArtworkVariants(userId));
      if (!needsArtworkFix) {
        return null;
      }
    }

    this.generatingUsers.add(userId);
    try {
      const result = await this.generateUser({
        userId,
        scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER,
        actorUserId: '',
        name: name || 'listen-now',
        locale: locale || 'en-GB',
        timezone: normalizeTimezone(timezone),
        platform: platform || 'web',
      });
      return result;
    } catch (error) {
      this.logger.warn('Failed to generate user recommendations', error);
      return null;
    } finally {
      this.generatingUsers.delete(userId);
    }
  }

  // ─── Global generation ───

  private async generateGlobal(
    request: GenerateRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const name = request.name || 'listen-now';
    const locale = request.locale || 'en-GB';
    const timezone = normalizeTimezone(request.timezone);
    const platform = request.platform || 'web';
    const actorUserId = request.actorUserId || 'system:recommendation-engine';

    try {
      await this.catalogSynchronizationService.ensureFreshCatalog();
    } catch (error) {
      this.logger.warn(
        'Catalog synchronization failed; generating from the latest available snapshot',
        error,
      );
    }

    const sections: PersonalRecommendationResource[] = [];

    const featured = await this.buildFeaturedAlbumsSection();
    if (featured) sections.push(featured);

    const trending = await this.buildTrendingSection();
    if (trending) {
      sections.push(trending);
    }

    const newReleases = await this.buildNewReleasesSection();
    if (newReleases) {
      sections.push(newReleases);
    } else {
      const latestAlbums = await this.buildCatalogBrowseSection(
        'global-latest-albums', 'Latest Albums', 'albums', 'MusicCoverShelf',
      );
      if (latestAlbums) sections.push(latestAlbums);
    }

    const topAlbums = await this.buildTopAlbumsSection();
    if (topAlbums) sections.push(topAlbums);

    const genreSections = await this.buildGenreAlbumSections();
    sections.push(...genreSections);

    const smartAlbumSections = await this.buildSmartGlobalAlbumSections(
      sections.length,
    );
    sections.push(...smartAlbumSections);

    const playlists = await this.buildCatalogBrowseSection(
      'global-playlists', 'Playlists', 'playlists', 'MusicCoverShelf',
    );
    if (playlists && sections.length < GLOBAL_SHELF_LIMIT) {
      sections.push(playlists);
    }

    const discovery = await this.buildDiscoveryAlbumsSection();
    if (discovery && sections.length < GLOBAL_SHELF_LIMIT) {
      sections.push(discovery);
    }

    if (sections.length === 0) {
      return this.recommendationsService.getHomeRecommendations({
        userId: '',
        name,
        locale,
        timezone,
        platform,
      });
    }

    const sectionsWithoutDuplicateAlbums =
      await this.deduplicateSemanticAlbumItems(
        this.removeDuplicateSections(sections),
      );
    const publishableSections = this.diversifyHomeAlbumPreviews(
      sectionsWithoutDuplicateAlbums,
    ).slice(0, GLOBAL_SHELF_LIMIT);

    // Never replace a usable Home page with a thin, half-populated page while
    // catalog ingestion is still in progress. The user will continue to see
    // the last published version until a complete enough generation exists.
    if (publishableSections.length < GLOBAL_PUBLISH_MIN_SHELVES) {
      this.logger.warn(
        `[global] generated ${publishableSections.length} shelves; keeping the current Home until at least ${GLOBAL_PUBLISH_MIN_SHELVES} are available`,
      );
      return this.recommendationsService.getHomeRecommendations({
        userId: '',
        name,
        locale,
        timezone,
        platform,
      });
    }

    await this.recommendationsService.replaceHomeRecommendations({
      userId: '',
      name,
      locale,
      timezone,
      platform,
      sections: publishableSections,
      resources: [],
      scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_GLOBAL,
      status: RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_DRAFT,
      actorUserId,
    });

    const result = await this.recommendationsService.publishRecommendationPage({
      userId: '',
      name,
      locale,
      timezone,
      platform,
      scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_GLOBAL,
      actorUserId,
    });

    await this.prisma.recommendationPage.updateMany({
      where: {
        scopeKey: 'GLOBAL',
        name,
        locale,
        status: 'PUBLISHED',
      },
      data: {
        staleAfter: new Date(Date.now() + STALE_DURATION_MS),
      },
    });

    return result;
  }

  // ─── User generation (smart) ───

  private async generateUser(
    request: GenerateRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const userId = request.userId;
    const name = request.name || 'listen-now';
    const locale = request.locale || 'en-GB';
    const timezone = normalizeTimezone(request.timezone);
    const platform = request.platform || 'web';
    const actorUserId = request.actorUserId || 'system:recommendation-engine';

    const profile = await this.listeningService.getUserTasteProfile(userId);
    const sections: PersonalRecommendationResource[] = [];

    const recentlyPlayed = await this.buildRecentlyPlayedSection(userId);
    if (recentlyPlayed) sections.push(recentlyPlayed);

    // System playlists and stations are collection cards on Home. Their track
    // selection still uses the listener profile, while album shelves come from
    // the v2 ranking engine below.
    const dailyMix = await this.buildDailyMixPlaylist(userId, profile);
    if (dailyMix) sections.push(dailyMix);
    const stations = await this.buildStationsForYouSection(userId, profile);
    if (stations) sections.push(stations);

    const personalizedShelves =
      await this.recommendationEngine.generateUserShelves(userId);
    sections.push(
      ...personalizedShelves.map((shelf) => this.buildEngineSection(shelf)),
    );

    if (sections.length === 0) {
      return this.recommendationsService.getHomeRecommendations({
        userId,
        name,
        locale,
        timezone,
        platform,
      });
    }

    // Two catalog album IDs can represent one release. The global page already
    // collapses them; the personalised page must do the same or the listener
    // sees the same album twice across their shelves.
    const publishableSections =
      await this.deduplicateSemanticAlbumItems(sections);

    await this.recommendationsService.replaceHomeRecommendations({
      userId,
      name,
      locale,
      timezone,
      platform,
      sections: publishableSections,
      resources: [],
      scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER,
      status: RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_DRAFT,
      actorUserId,
    });

    const result = await this.recommendationsService.publishRecommendationPage({
      userId,
      name,
      locale,
      timezone,
      platform,
      scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER,
      actorUserId,
    });

    await this.prisma.recommendationPage.updateMany({
      where: {
        scopeKey: `USER:${userId}`,
        name,
        locale,
        status: 'PUBLISHED',
      },
      data: {
        staleAfter: new Date(Date.now() + STALE_DURATION_MS),
      },
    });

    return result;
  }

  // ─── Scoring engine ───

  private scoreSong(song: SnapshotRow, profile: TasteProfile): number {
    let score = 0;

    // Genre affinity (0–0.4): sum of matching genre weights, capped
    let genreScore = 0;
    for (const genre of song.genreNames) {
      const gw = profile.genres.find((g) => g.name === genre)?.weight ?? 0;
      genreScore += gw;
    }
    score += Math.min(genreScore, 1) * 0.4;

    // Artist affinity (0–0.3): known artist = proportional, unknown = discovery bonus
    const artistWeight = profile.artists.find((a) => a.name === song.artistName)?.weight ?? 0;
    if (artistWeight > 0) {
      score += artistWeight * 0.2;
    } else {
      score += 0.1;
    }

    // Freshness bonus (0.3): unheard songs get full bonus
    if (!profile.listenedSongIds.has(song.resourceId)) {
      score += 0.3;
    }

    return Math.min(score, 1);
  }

  private scoreAndRank(
    candidates: SnapshotRow[],
    profile: TasteProfile,
    limit: number,
    maxPerArtist = MAX_PER_ARTIST,
  ): ScoredItem[] {
    const scored: ScoredItem[] = candidates.map((c) => ({
      id: c.resourceId,
      type: c.resourceType,
      score: this.scoreSong(c, profile),
      artistName: c.artistName,
    }));

    scored.sort((a, b) => b.score - a.score);

    // Diversity: max MAX_PER_ARTIST songs from same artist
    const artistCounts = new Map<string, number>();
    const result: ScoredItem[] = [];

    for (const item of scored) {
      if (result.length >= limit) break;
      const count = artistCounts.get(item.artistName) ?? 0;
      if (count >= maxPerArtist) continue;
      artistCounts.set(item.artistName, count + 1);
      result.push(item);
    }

    return result;
  }

  private async groupSongsByAlbum(
    items: Array<{ id: string; type: string }>,
  ): Promise<Array<{ id: string; type: string }>> {
    const songItems = items.filter((i) => i.type === 'songs');
    if (songItems.length === 0) return items;

    const songIds = songItems.map((s) => s.id);
    const catalogAlbums = await this.catalogService.resolveSongAlbums(songIds);
    const albumIdsBySong = new Map<string, string>();
    const fallbackAlbumNames = new Map<string, string>();

    for (const [songId, album] of catalogAlbums) {
      if (album.albumId) {
        albumIdsBySong.set(songId, album.albumId);
      } else if (album.albumName) {
        fallbackAlbumNames.set(songId, album.albumName);
      }
    }

    const unresolvedSongIds = songIds.filter(
      (songId) => !albumIdsBySong.has(songId) && !fallbackAlbumNames.has(songId),
    );
    if (unresolvedSongIds.length > 0) {
      const snapshots = await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'songs',
          resourceId: { in: unresolvedSongIds },
        },
        select: { resourceId: true, attributes: true },
      });

      for (const snapshot of snapshots) {
        const attributes = snapshot.attributes as Record<string, unknown> | null;
        const albumName = attributes?.albumName;
        if (typeof albumName === 'string' && albumName) {
          fallbackAlbumNames.set(snapshot.resourceId, albumName);
        }
      }
    }

    const albumNames = [...new Set(fallbackAlbumNames.values())];
    const albumNameToId = albumNames.length
      ? new Map(
          (
            await this.prisma.recommendationResourceSnapshot.findMany({
              where: { resourceType: 'albums', name: { in: albumNames } },
              select: { resourceId: true, name: true },
            })
          ).map((album) => [album.name, album.resourceId]),
        )
      : new Map<string, string>();

    const seen = new Set<string>();
    const result: Array<{ id: string; type: string }> = [];

    for (const item of items) {
      if (item.type === 'songs') {
        const albumId =
          albumIdsBySong.get(item.id) ??
          albumNameToId.get(fallbackAlbumNames.get(item.id) ?? '');
        if (albumId) {
          const key = `albums:${albumId}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ id: albumId, type: 'albums' });
          }
        } else {
          const key = `songs:${item.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
          }
        }
      } else {
        const key = `${item.type}:${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(item);
        }
      }
    }

    return result;
  }

  // ─── User sections ───

  private async buildDailyMixPlaylist(
    userId: string,
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    if (profile.listenedSongIds.size < MIN_LISTENED_SONGS) {
      this.logger.warn(`[daily-mix] skip: only ${profile.listenedSongIds.size} listened songs (need ${MIN_LISTENED_SONGS})`);
      return null;
    }

    const preferredGenres = profile.genres
      .filter((genre) => genre.weight > 0.05)
      .slice(0, 10)
      .map((genre) => genre.name);
    const excludedSongIds = [...profile.listenedSongIds];
    const songSelection = {
      resourceId: true,
      resourceType: true,
      artistName: true,
      genreNames: true,
      releaseDate: true,
      isSingle: true,
      name: true,
      artworkUrl: true,
      artworkBgColor: true,
      artworkWidth: true,
      artworkHeight: true,
      attributes: true,
    } as const;

    const matchingCandidates = preferredGenres.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'songs',
            resourceId: { notIn: excludedSongIds },
            genreNames: { hasSome: preferredGenres },
          },
          take: 150,
          select: songSelection,
        })
      : [];

    const fallbackCandidates =
      matchingCandidates.length >= DAILY_MIX_TRACK_LIMIT
        ? []
        : await this.prisma.recommendationResourceSnapshot.findMany({
            where: {
              resourceType: 'songs',
              resourceId: { notIn: excludedSongIds },
            },
            take: 200,
            select: songSelection,
          });

    let candidates = [
      ...matchingCandidates,
      ...fallbackCandidates.filter(
        (candidate) =>
          !matchingCandidates.some(
            (existing) => existing.resourceId === candidate.resourceId,
          ),
      ),
    ];

    // Small catalog fallback: include listened songs when unheard pool is too
    // shallow, so the mix can still be built.
    if (candidates.length < DAILY_MIX_MIN_TRACKS) {
      const listenedFallback = await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'songs',
          resourceId: { in: excludedSongIds },
        },
        take: 200,
        select: songSelection,
      });
      const seenIds = new Set(candidates.map((c) => c.resourceId));
      candidates = [
        ...candidates,
        ...listenedFallback.filter((c) => !seenIds.has(c.resourceId)),
      ];
    }

    const ranked = this.scoreAndRank(
      candidates,
      profile,
      DAILY_MIX_TRACK_LIMIT * DAILY_MIX_LIMIT,
      DAILY_MIX_MAX_PER_ARTIST,
    );
    if (ranked.length < DAILY_MIX_MIN_TRACKS) {
      this.logger.warn(`[daily-mix] skip: only ${ranked.length} ranked (need ${DAILY_MIX_MIN_TRACKS})`);
      return null;
    }

    const selectedById = new Map(
      candidates.map((candidate) => [candidate.resourceId, candidate]),
    );
    const selected = ranked.slice(0, DAILY_MIX_TRACK_LIMIT).flatMap((item) => {
      const snapshot = selectedById.get(item.id);
      return snapshot ? [snapshot] : [];
    });
    if (selected.length < DAILY_MIX_MIN_TRACKS) return null;

    const playlistId = this.dailyMixId(userId);
    const artworkSource = selected.find((song) => song.artworkUrl) ?? selected[0];
    const artworkWidth = artworkSource.artworkWidth || 1000;
    const artworkHeight = artworkSource.artworkHeight || 1000;
    const artworkVariants = artworkVariantsFromAttributes(
      artworkSource.attributes,
    );
    const description = 'A fresh mix built from the music you love.';
    const relationships = {
      tracks: {
        href: `/me/system-playlists/${playlistId}/tracks`,
        data: selected.map((song) => ({
          id: song.resourceId,
          type: 'songs',
          href: `/catalog/vn/songs/${song.resourceId}`,
        })),
      },
    };

    await this.prisma.recommendationResourceSnapshot.upsert({
      where: {
        resourceType_resourceId: {
          resourceType: 'playlists',
          resourceId: playlistId,
        },
      },
      create: {
        resourceType: 'playlists',
        resourceId: playlistId,
        name: 'Daily Mix',
        title: 'Daily Mix',
        curatorName: 'Musical',
        href: `/playlist/${playlistId}`,
        externalUrl: `/playlist/${playlistId}`,
        artworkUrl: artworkSource.artworkUrl,
        artworkBgColor: artworkSource.artworkBgColor,
        artworkWidth,
        artworkHeight,
        shortDescription: description,
        standardDescription: description,
        playlistType: 'system-personalized',
        trackCount: selected.length,
        attributes: {
          name: 'Daily Mix',
          curatorName: 'Musical',
          description: { short: description, standard: description },
          artwork: {
            url: artworkSource.artworkUrl,
            width: artworkWidth,
            height: artworkHeight,
            bgColor: artworkSource.artworkBgColor,
            alt: 'Daily Mix',
            ...(artworkVariants ? { variants: artworkVariants } : {}),
          },
          playlistType: 'system-personalized',
          trackCount: selected.length,
          url: `/playlist/${playlistId}`,
        },
        relationships,
      },
      update: {
        name: 'Daily Mix',
        title: 'Daily Mix',
        curatorName: 'Musical',
        href: `/playlist/${playlistId}`,
        externalUrl: `/playlist/${playlistId}`,
        artworkUrl: artworkSource.artworkUrl,
        artworkBgColor: artworkSource.artworkBgColor,
        artworkWidth,
        artworkHeight,
        shortDescription: description,
        standardDescription: description,
        playlistType: 'system-personalized',
        trackCount: selected.length,
        attributes: {
          name: 'Daily Mix',
          curatorName: 'Musical',
          description: { short: description, standard: description },
          artwork: {
            url: artworkSource.artworkUrl,
            width: artworkWidth,
            height: artworkHeight,
            bgColor: artworkSource.artworkBgColor,
            alt: 'Daily Mix',
            ...(artworkVariants ? { variants: artworkVariants } : {}),
          },
          playlistType: 'system-personalized',
          trackCount: selected.length,
          url: `/playlist/${playlistId}`,
        },
        relationships,
      },
    });

    const playlistItems: Array<{ id: string; type: string }> = [
      { id: playlistId, type: 'playlists' },
    ];
    const mixTracklists = [selected.map((song) => song.resourceId)];
    for (let mixIndex = 1; mixIndex < DAILY_MIX_LIMIT; mixIndex += 1) {
      const variantId = this.dailyMixId(userId, mixIndex);
      const variantSelected = this.selectDiverseSystemVariant(
        ranked,
        selectedById,
        mixTracklists,
        mixIndex * DAILY_MIX_TRACK_LIMIT,
        DAILY_MIX_TRACK_LIMIT,
        DAILY_MIX_MIN_TRACKS,
      );
      if (variantSelected.length < DAILY_MIX_MIN_TRACKS) {
        this.logger.debug(
          `[daily-mix] variant ${mixIndex + 1} skipped: insufficient novel tracks`,
        );
        continue;
      }

      const variantTitle = `Daily Mix ${mixIndex + 1}`;
      const variantArtwork =
        variantSelected.find((song) => song.artworkUrl) ?? variantSelected[0];
      const variantWidth = variantArtwork.artworkWidth || 1000;
      const variantHeight = variantArtwork.artworkHeight || 1000;
      const variantArtworkVariants = artworkVariantsFromAttributes(
        variantArtwork.attributes,
      );
      const variantRelationships = {
        tracks: {
          href: `/me/system-playlists/${variantId}/tracks`,
          data: variantSelected.map((song) => ({
            id: song.resourceId,
            type: 'songs',
            href: `/catalog/vn/songs/${song.resourceId}`,
          })),
        },
      };
      const variantData = {
        name: variantTitle,
        title: variantTitle,
        curatorName: 'Musical',
        href: `/playlist/${variantId}`,
        externalUrl: `/playlist/${variantId}`,
        artworkUrl: variantArtwork.artworkUrl,
        artworkBgColor: variantArtwork.artworkBgColor,
        artworkWidth: variantWidth,
        artworkHeight: variantHeight,
        shortDescription: description,
        standardDescription: description,
        playlistType: 'system-personalized',
        trackCount: variantSelected.length,
        attributes: {
          name: variantTitle,
          curatorName: 'Musical',
          description: { short: description, standard: description },
          artwork: {
            url: variantArtwork.artworkUrl,
            width: variantWidth,
            height: variantHeight,
            bgColor: variantArtwork.artworkBgColor,
            alt: variantTitle,
            ...(variantArtworkVariants
              ? { variants: variantArtworkVariants }
              : {}),
          },
          playlistType: 'system-personalized',
          trackCount: variantSelected.length,
          url: `/playlist/${variantId}`,
        },
        relationships: variantRelationships,
      };

      await this.prisma.recommendationResourceSnapshot.upsert({
        where: {
          resourceType_resourceId: {
            resourceType: 'playlists',
            resourceId: variantId,
          },
        },
        create: {
          resourceType: 'playlists',
          resourceId: variantId,
          ...variantData,
        },
        update: variantData,
      });
      playlistItems.push({ id: variantId, type: 'playlists' });
      mixTracklists.push(variantSelected.map((song) => song.resourceId));
    }

    // A refresh may not find enough *new* variants in a sparse catalog. Keep
    // previously generated, valid mixes instead of shrinking the shelf merely
    // because the current pass has less novelty to work with.
    if (playlistItems.length < DAILY_MIX_LIMIT) {
      const existingMixes = await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'playlists',
          resourceId: {
            in: Array.from(
              { length: DAILY_MIX_LIMIT - 1 },
              (_, index) => this.dailyMixId(userId, index + 1),
            ),
          },
          playlistType: 'system-personalized',
          trackCount: { gte: DAILY_MIX_MIN_TRACKS },
        },
        select: { resourceId: true },
      });
      const existingMixIds = new Set(
        playlistItems.map((playlist) => playlist.id),
      );

      for (let mixIndex = 1; mixIndex < DAILY_MIX_LIMIT; mixIndex += 1) {
        const mixId = this.dailyMixId(userId, mixIndex);
        if (
          existingMixes.some((mix) => mix.resourceId === mixId) &&
          !existingMixIds.has(mixId)
        ) {
          playlistItems.push({ id: mixId, type: 'playlists' });
          existingMixIds.add(mixId);
        }
      }
    }

    return this.buildSection(
      'user-daily-mix',
      'Your Daily Mix',
      'MusicNotesHeroShelf',
      ['playlists'],
      playlistItems,
    );
  }

  private dailyMixId(userId: string, mixIndex = 0): string {
    const digest = createHash('sha256').update(userId).digest('hex');
    const baseId = `daily-mix-${digest.slice(0, 32)}`;
    return mixIndex === 0 ? baseId : `${baseId}-${mixIndex}`;
  }

  /**
   * Builds a system playlist/station variant that contributes a meaningful
   * amount of unseen music relative to every previously accepted variant.
   * A sparse catalog therefore yields fewer cards instead of renamed copies
   * of the same queue.
   */
  private selectDiverseSystemVariant<T extends { resourceId: string }>(
    ranked: ScoredItem[],
    candidatesById: Map<string, T>,
    acceptedTracklists: string[][],
    offset: number,
    limit: number,
    minimumTracks: number,
  ): T[] {
    if (ranked.length === 0) return [];

    const start = offset % ranked.length;
    const rotated = [...ranked.slice(start), ...ranked.slice(0, start)];
    const priorTrackSets = acceptedTracklists.map((tracks) => new Set(tracks));
    const priorTrackIds = new Set(acceptedTracklists.flat());
    const uniqueCandidates = new Map<string, T>();
    for (const item of rotated) {
      const candidate = candidatesById.get(item.id);
      if (candidate && !uniqueCandidates.has(candidate.resourceId)) {
        uniqueCandidates.set(candidate.resourceId, candidate);
      }
    }

    const orderedCandidates = [...uniqueCandidates.values()].sort(
      (left, right) => {
        const leftIsNovel = !priorTrackIds.has(left.resourceId);
        const rightIsNovel = !priorTrackIds.has(right.resourceId);
        return Number(rightIsNovel) - Number(leftIsNovel);
      },
    );
    const selected: T[] = [];
    const selectedIds = new Set<string>();

    for (const candidate of orderedCandidates) {
      if (selected.length >= limit) break;
      if (selectedIds.has(candidate.resourceId)) continue;

      const canAdd = priorTrackSets.every((previousTracks) => {
        const shared = selected.reduce(
          (count, song) => count + Number(previousTracks.has(song.resourceId)),
          Number(previousTracks.has(candidate.resourceId)),
        );
        return (
          shared <=
          Math.floor(previousTracks.size * SYSTEM_VARIANT_MAX_OVERLAP_RATIO)
        );
      });
      if (!canAdd) continue;

      selected.push(candidate);
      selectedIds.add(candidate.resourceId);
    }

    if (selected.length < minimumTracks) return [];
    if (acceptedTracklists.length === 0) return selected;

    const novelCount = selected.filter(
      (candidate) => !priorTrackIds.has(candidate.resourceId),
    ).length;
    const requiredNovelCount = Math.max(
      minimumTracks,
      Math.ceil(
        Math.min(limit, orderedCandidates.length) *
          SYSTEM_VARIANT_MIN_NOVEL_RATIO,
      ),
    );
    return novelCount >= requiredNovelCount ? selected : [];
  }

  private async hasZeroArtworkDimensions(userId: string): Promise<boolean> {
    const mixId = this.dailyMixId(userId);
    const snapshot = await this.prisma.recommendationResourceSnapshot.findUnique({
      where: {
        resourceType_resourceId: { resourceType: 'playlists', resourceId: mixId },
      },
      select: { artworkWidth: true, artworkHeight: true },
    });
    return !!snapshot && (!snapshot.artworkWidth || !snapshot.artworkHeight);
  }

  private async hasMissingSystemArtworkVariants(
    userId: string,
  ): Promise<boolean> {
    const digest = createHash('sha256').update(userId).digest('hex');
    const playlistPrefix = `daily-mix-${digest.slice(0, 32)}`;
    const stationPrefix = `station-for-you-${digest.slice(0, 32)}-`;
    const snapshots = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        OR: [
          { resourceType: 'playlists', resourceId: { startsWith: playlistPrefix } },
          { resourceType: 'stations', resourceId: { startsWith: stationPrefix } },
        ],
      },
      select: { attributes: true },
    });

    return snapshots.some(
      (snapshot) => !artworkVariantsFromAttributes(snapshot.attributes),
    );
  }

  private async buildStationsForYouSection(
    userId: string,
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    if (profile.listenedSongIds.size < MIN_LISTENED_SONGS) {
      this.logger.warn(`[stations] skip: only ${profile.listenedSongIds.size} listened songs (need ${MIN_LISTENED_SONGS})`);
      return null;
    }

    const preferredGenres = profile.genres
      .filter((genre) => genre.weight > 0.05)
      .slice(0, STATION_LIMIT)
      .map((genre) => genre.name);
    if (preferredGenres.length === 0) {
      this.logger.warn('[stations] skip: no preferred genres found');
      return null;
    }
    const stationSeeds = [
      ...preferredGenres.map((genre) => ({
        title: `${genre} Station`,
        description: `Endless ${genre} picks made for you.`,
        genres: [genre],
      })),
      {
        title: 'Your Favorites Station',
        description: 'More of the music that fits your listening habits.',
        genres: preferredGenres,
      },
      {
        title: 'Fresh Discovery Station',
        description: 'New artists and songs close to the music you love.',
        genres: preferredGenres,
      },
      {
        title: 'Deep Cuts Station',
        description: 'More hidden gems from the styles you return to.',
        genres: preferredGenres,
      },
      {
        title: 'Feel Good Station',
        description: 'Easy picks built around your favorite sounds.',
        genres: preferredGenres,
      },
      {
        title: 'Late Night Station',
        description: 'A laid-back rotation selected for you.',
        genres: preferredGenres,
      },
      {
        title: 'Rediscovery Station',
        description: 'Familiar sounds and overlooked favorites.',
        genres: preferredGenres,
      },
      {
        title: 'New Horizons Station',
        description: 'A wider mix inspired by your listening taste.',
        genres: preferredGenres,
      },
    ].slice(0, STATION_LIMIT);

    const songSelection = {
      resourceId: true,
      resourceType: true,
      artistName: true,
      genreNames: true,
      releaseDate: true,
      isSingle: true,
      artworkUrl: true,
      artworkBgColor: true,
      artworkWidth: true,
      artworkHeight: true,
      attributes: true,
    } as const;
    const excludedSongIds = [...profile.listenedSongIds];
    const stationItems: Array<{ id: string; type: string }> = [];
    const stationTracklists: string[][] = [];

    for (const [index, seed] of stationSeeds.entries()) {
      const genreCandidates = await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'songs',
          resourceId: { notIn: excludedSongIds },
          genreNames: { hasSome: seed.genres },
        },
        take: 250,
        select: songSelection,
      });
      let candidates = genreCandidates.length >= STATION_MIN_TRACKS
        ? genreCandidates
        : await this.prisma.recommendationResourceSnapshot.findMany({
            where: {
              resourceType: 'songs',
              resourceId: { notIn: excludedSongIds },
              genreNames: { hasSome: preferredGenres },
            },
            take: 250,
            select: songSelection,
          });

      if (candidates.length < STATION_MIN_TRACKS) {
        const listenedFallback = await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'songs',
            genreNames: { hasSome: seed.genres },
          },
          take: 250,
          select: songSelection,
        });
        const seenIds = new Set(candidates.map((c) => c.resourceId));
        candidates = [
          ...candidates,
          ...listenedFallback.filter((c) => !seenIds.has(c.resourceId)),
        ];
      }

      const ranked = this.scoreAndRank(
        candidates,
        profile,
        STATION_TRACK_LIMIT,
        DAILY_MIX_MAX_PER_ARTIST,
      );
      if (ranked.length < STATION_MIN_TRACKS) {
        this.logger.warn(`[stations] seed[${index}] skip: only ${ranked.length} ranked (need ${STATION_MIN_TRACKS})`);
        continue;
      }

      const candidatesById = new Map(
        candidates.map((candidate) => [candidate.resourceId, candidate]),
      );
      const selected = this.selectDiverseSystemVariant(
        ranked,
        candidatesById,
        stationTracklists,
        index * STATION_TRACK_LIMIT,
        STATION_TRACK_LIMIT,
        STATION_MIN_TRACKS,
      );
      if (selected.length < STATION_MIN_TRACKS) {
        this.logger.debug(
          `[stations] seed[${index}] skipped: insufficient novel tracks`,
        );
        continue;
      }

      const stationId = this.stationId(userId, index);
      const artworkSource = selected.find((song) => song.artworkUrl) ?? selected[0];
      const { title, description } = seed;
      const relationships = {
        tracks: {
          href: `/me/system-stations/${stationId}/tracks`,
          data: selected.map((song) => ({
            id: song.resourceId,
            type: 'songs',
            href: `/catalog/vn/songs/${song.resourceId}`,
          })),
        },
      };
      const stationArtworkWidth = artworkSource.artworkWidth || 1000;
      const stationArtworkHeight = artworkSource.artworkHeight || 1000;
      const stationArtworkVariants = artworkVariantsFromAttributes(
        artworkSource.attributes,
      );
      const stationData = {
        name: title,
        title,
        curatorName: 'Musical',
        href: '',
        externalUrl: '',
        artworkUrl: artworkSource.artworkUrl,
        artworkBgColor: artworkSource.artworkBgColor,
        artworkWidth: stationArtworkWidth,
        artworkHeight: stationArtworkHeight,
        trackCount: selected.length,
        shortDescription: description,
        standardDescription: description,
        stationKind: 'system-personalized',
        mediaKind: 'audio',
        attributes: {
          name: title,
          kind: 'system-personalized',
          mediaKind: 'audio',
          trackCount: selected.length,
          artwork: {
            url: artworkSource.artworkUrl,
            width: stationArtworkWidth,
            height: stationArtworkHeight,
            bgColor: artworkSource.artworkBgColor,
            alt: title,
            ...(stationArtworkVariants
              ? { variants: stationArtworkVariants }
              : {}),
          },
          url: '',
        },
        relationships,
      };

      await this.prisma.recommendationResourceSnapshot.upsert({
        where: {
          resourceType_resourceId: {
            resourceType: 'stations',
            resourceId: stationId,
          },
        },
        create: {
          resourceType: 'stations',
          resourceId: stationId,
          ...stationData,
        },
        update: stationData,
      });
      stationItems.push({ id: stationId, type: 'stations' });
      stationTracklists.push(selected.map((song) => song.resourceId));
    }

    // Preserve valid system Stations from an earlier generation when the
    // current catalog/profile cannot produce enough novel variants. This keeps
    // the shelf stable instead of silently shrinking after a refresh.
    if (stationItems.length < STATION_LIMIT) {
      const existingStations = await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'stations',
          resourceId: {
            in: Array.from(
              { length: STATION_LIMIT },
              (_, index) => this.stationId(userId, index),
            ),
          },
          stationKind: 'system-personalized',
        },
        select: { resourceId: true },
      });
      const existingStationIds = new Set(stationItems.map((station) => station.id));

      for (let index = 0; index < STATION_LIMIT; index += 1) {
        const stationId = this.stationId(userId, index);
        if (
          existingStations.some((station) => station.resourceId === stationId) &&
          !existingStationIds.has(stationId)
        ) {
          stationItems.push({ id: stationId, type: 'stations' });
          existingStationIds.add(stationId);
        }
      }
    }

    if (stationItems.length === 0) return null;

    return this.buildSection(
      'user-stations-for-you',
      'Stations for You',
      'MusicCoverShelf',
      ['stations'],
      stationItems,
    );
  }

  private stationId(userId: string, index: number): string {
    const digest = createHash('sha256').update(userId).digest('hex');
    return `station-for-you-${digest.slice(0, 32)}-${index}`;
  }

  private async buildRecentlyPlayedSection(
    userId: string,
  ): Promise<PersonalRecommendationResource | null> {
    const recent = await this.listeningService.getRecentlyPlayed(userId, 50);
    if (recent.length < 3) return null;

    const albumLastPlayed = new Map<
      string,
      { albumId: string; albumName: string; lastPlayedAt: Date }
    >();
    const playlistLastPlayed = new Map<
      string,
      { playlistId: string; lastPlayedAt: Date }
    >();
    const stationLastPlayed = new Map<
      string,
      { stationId: string; lastPlayedAt: Date }
    >();
    const standaloneSongs: Array<{ songId: string; lastPlayedAt: Date }> = [];

    for (const entry of recent) {
      // A Station is the item a listener chose. Its tracks still inform taste,
      // but must never appear as separate Recently Played cards.
      if (entry.stationId) {
        const existing = stationLastPlayed.get(entry.stationId);
        if (!existing || entry.lastPlayedAt > existing.lastPlayedAt) {
          stationLastPlayed.set(entry.stationId, {
            stationId: entry.stationId,
            lastPlayedAt: entry.lastPlayedAt,
          });
        }
        continue;
      }

      if (entry.playlistId) {
        const existing = playlistLastPlayed.get(entry.playlistId);
        if (!existing || entry.lastPlayedAt > existing.lastPlayedAt) {
          playlistLastPlayed.set(entry.playlistId, {
            playlistId: entry.playlistId,
            lastPlayedAt: entry.lastPlayedAt,
          });
        }
        continue;
      }

      if (entry.albumId || entry.albumName) {
        const key = entry.albumId
          ? `id:${entry.albumId}`
          : `name:${entry.albumName}`;
        const existing = albumLastPlayed.get(key);
        if (!existing || entry.lastPlayedAt > existing.lastPlayedAt) {
          albumLastPlayed.set(key, {
            albumId: entry.albumId,
            albumName: entry.albumName,
            lastPlayedAt: entry.lastPlayedAt,
          });
        }
      } else {
        standaloneSongs.push({ songId: entry.songId, lastPlayedAt: entry.lastPlayedAt });
      }
    }

    const albumIds = [...new Set(
      [...albumLastPlayed.values()]
        .map((entry) => entry.albumId)
        .filter(Boolean),
    )];
    const legacyAlbumNames = [...new Set(
      [...albumLastPlayed.values()]
        .filter((entry) => !entry.albumId)
        .map((entry) => entry.albumName)
        .filter(Boolean),
    )];
    const playlistIds = [...playlistLastPlayed.keys()];
    const stationIds = [...stationLastPlayed.keys()];
    const albumSnapshots = albumIds.length || legacyAlbumNames.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'albums',
            OR: [
              ...(albumIds.length ? [{ resourceId: { in: albumIds } }] : []),
              ...(legacyAlbumNames.length
                ? [{ name: { in: legacyAlbumNames } }]
                : []),
            ],
          },
          select: { resourceId: true, name: true },
        })
      : [];
    const playlistSnapshots = playlistIds.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'playlists',
            resourceId: { in: playlistIds },
            playlistType: 'system-personalized',
          },
          select: { resourceId: true },
      })
      : [];
    const stationSnapshots = stationIds.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'stations',
            resourceId: { in: stationIds },
            stationKind: 'system-personalized',
          },
          select: { resourceId: true },
        })
      : [];
    const albumIdToSnapshot = new Map(
      albumSnapshots.map((snapshot) => [snapshot.resourceId, snapshot]),
    );
    const albumNameToId = new Map(albumSnapshots.map((s) => [s.name, s.resourceId]));
    const playlistSnapshotIds = new Set(
      playlistSnapshots.map((snapshot) => snapshot.resourceId),
    );
    const stationSnapshotIds = new Set(
      stationSnapshots.map((snapshot) => snapshot.resourceId),
    );

    type RecentItem = { id: string; type: string; time: number };
    const items: RecentItem[] = [];

    for (const entry of albumLastPlayed.values()) {
      const albumId = entry.albumId
        ? albumIdToSnapshot.get(entry.albumId)?.resourceId
        : albumNameToId.get(entry.albumName);
      if (albumId) {
        items.push({ id: albumId, type: 'albums', time: entry.lastPlayedAt.getTime() });
      }
    }

    for (const entry of playlistLastPlayed.values()) {
      if (playlistSnapshotIds.has(entry.playlistId)) {
        items.push({
          id: entry.playlistId,
          type: 'playlists',
          time: entry.lastPlayedAt.getTime(),
        });
      }
    }

    for (const entry of stationLastPlayed.values()) {
      if (stationSnapshotIds.has(entry.stationId)) {
        items.push({
          id: entry.stationId,
          type: 'stations',
          time: entry.lastPlayedAt.getTime(),
        });
      }
    }

    for (const song of standaloneSongs) {
      items.push({ id: song.songId, type: 'songs', time: song.lastPlayedAt.getTime() });
    }

    items.sort((a, b) => b.time - a.time);

    // Album events can arrive with either a catalog ID or legacy name.  Both
    // representations may resolve to the same catalog resource, so dedupe only
    // after resolving them and sorting to retain the most recently played item.
    const itemKeys = new Set<string>();
    const dedupedItems = items
      .filter((item) => {
        const key = `${item.type}:${item.id}`;
        if (itemKeys.has(key)) return false;
        itemKeys.add(key);
        return true;
      })
      .slice(0, 20);
    // The listener can have qualified history from several tracks in a single
    // Station. After collapsing that session into its chosen Station, one card
    // is still a meaningful Recently Played result.
    if (dedupedItems.length === 0) return null;

    const resourceTypes = [...new Set(dedupedItems.map((i) => i.type))];

    return this.buildSection(
      'user-recently-played',
      'Recently Played',
      'MusicCoverShelf',
      resourceTypes,
      dedupedItems.map((i) => ({ id: i.id, type: i.type })),
    );
  }

  private async buildReleaseRadarSection(
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    const topArtists = profile.artists.slice(0, 10).map((a) => a.name);
    if (topArtists.length === 0) return null;

    const cutoffDate = new Date(Date.now() - RELEASE_RADAR_DAYS * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const newReleases = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: { in: ['albums', 'songs'] },
        artistName: { in: topArtists },
        releaseDate: { gte: cutoffStr },
      },
      orderBy: { releaseDate: 'desc' },
      take: 30,
      select: { resourceId: true, resourceType: true, artistName: true, isSingle: true },
    });

    if (newReleases.length < 3) return null;

    // Prefer albums/singles over individual songs when album exists
    const albumIds = new Set<string>();
    const items: Array<{ id: string; type: string }> = [];

    for (const release of newReleases) {
      if (release.resourceType === 'albums') {
        albumIds.add(release.resourceId);
        items.push({ id: release.resourceId, type: 'albums' });
      }
    }

    for (const release of newReleases) {
      if (release.resourceType === 'songs' && !profile.listenedSongIds.has(release.resourceId)) {
        items.push({ id: release.resourceId, type: 'songs' });
      }
    }

    const uniqueItems = items.slice(0, 20);
    if (uniqueItems.length < 3) return null;

    const grouped = await this.groupSongsByAlbum(uniqueItems);
    if (grouped.length < 3) return null;

    const resourceTypes = [...new Set(grouped.map((i) => i.type))];

    return this.buildSection(
      'user-release-radar',
      'New Releases From Artists You Like',
      'MusicCoverShelf',
      resourceTypes,
      grouped,
    );
  }

  private async buildMadeForYouSection(
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    if (profile.listenedSongIds.size < 5) return null;

    // Use all weighted genres instead of just top 3
    const topGenres = profile.genres
      .filter((g) => g.weight > 0.05)
      .slice(0, 10)
      .map((g) => g.name);

    if (topGenres.length === 0) return null;

    const candidates = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'songs',
        genreNames: { hasSome: topGenres },
        resourceId: { notIn: [...profile.listenedSongIds] },
      },
      take: 50,
      select: {
        resourceId: true,
        resourceType: true,
        artistName: true,
        genreNames: true,
        releaseDate: true,
        isSingle: true,
      },
    });

    if (candidates.length < 3) return null;

    const ranked = this.scoreAndRank(candidates, profile, 20);

    if (ranked.length < 3) return null;

    const items = await this.groupSongsByAlbum(
      ranked.map((r) => ({ id: r.id, type: r.type })),
    );
    if (items.length < 3) return null;

    const resourceTypes = [...new Set(items.map((i) => i.type))];

    return this.buildSection(
      'user-made-for-you',
      'Made For You',
      'MusicCoverShelf',
      resourceTypes,
      items,
    );
  }

  private async buildBecauseYouListenedSections(
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource[]> {
    // Top 3 artists, generate max 2 sections
    const topArtists = profile.artists.slice(0, 3);
    const sections: PersonalRecommendationResource[] = [];

    for (const artist of topArtists) {
      if (sections.length >= 2) break;

      const candidates = await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'songs',
          artistName: artist.name,
          resourceId: { notIn: [...profile.listenedSongIds] },
        },
        take: 30,
        select: {
          resourceId: true,
          resourceType: true,
          artistName: true,
          genreNames: true,
          releaseDate: true,
          isSingle: true,
        },
      });

      let items: Array<{ id: string; type: string }>;

      if (candidates.length >= 3) {
        const ranked = this.scoreAndRank(candidates, profile, 20);
        items = ranked.map((r) => ({ id: r.id, type: r.type }));
      } else {
        // Fallback to popular songs from artist (including already listened)
        const popular = await this.prisma.recommendationResourceSnapshot.findMany({
          where: { resourceType: 'songs', artistName: artist.name },
          take: 20,
          select: { resourceId: true, resourceType: true },
        });
        items = popular.map((s) => ({ id: s.resourceId, type: s.resourceType }));
      }

      if (items.length < 3) continue;

      const grouped = await this.groupSongsByAlbum(items);
      if (grouped.length < 3) continue;

      const resourceTypes = [...new Set(grouped.map((i) => i.type))];
      const slug = this.slugify(artist.name);
      sections.push(
        this.buildSection(
          `user-because-${slug}`,
          `Because You Listened to ${artist.name}`,
          'MusicCoverShelf',
          resourceTypes,
          grouped,
        ),
      );
    }

    return sections;
  }

  private async buildDiscoverSection(
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    if (profile.genres.length < 2) return null;

    // Find genres user likes but hasn't explored deeply (mid-weight)
    const explorationGenres = profile.genres
      .filter((g) => g.weight >= 0.1 && g.weight < 0.6)
      .slice(0, 5)
      .map((g) => g.name);

    // Also add genres from top artists that user hasn't explored
    const topArtistNames = profile.artists.slice(0, 5).map((a) => a.name);
    if (topArtistNames.length > 0) {
      const artistSnapshots = await this.prisma.recommendationResourceSnapshot.findMany({
        where: { resourceType: 'artists', name: { in: topArtistNames } },
        select: { genreNames: true },
      });
      for (const snap of artistSnapshots) {
        for (const genre of snap.genreNames) {
          if (!explorationGenres.includes(genre)) {
            explorationGenres.push(genre);
          }
        }
      }
    }

    if (explorationGenres.length === 0) return null;

    // Find artists the user hasn't listened to who share these genres
    const listenedArtists = new Set(profile.artists.map((a) => a.name));
    const newArtists = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'artists',
        genreNames: { hasSome: explorationGenres },
        name: { notIn: [...listenedArtists] },
      },
      take: 10,
      select: { name: true },
    });

    const discoveryArtistNames = newArtists.map((a) => a.name);
    if (discoveryArtistNames.length === 0) return null;

    const candidates = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'songs',
        artistName: { in: discoveryArtistNames },
        resourceId: { notIn: [...profile.listenedSongIds] },
      },
      take: 50,
      select: {
        resourceId: true,
        resourceType: true,
        artistName: true,
        genreNames: true,
        releaseDate: true,
        isSingle: true,
      },
    });

    if (candidates.length < 3) return null;

    const ranked = this.scoreAndRank(candidates, profile, 20);

    if (ranked.length < 3) return null;

    const items = await this.groupSongsByAlbum(
      ranked.map((r) => ({ id: r.id, type: r.type })),
    );
    if (items.length < 3) return null;

    const resourceTypes = [...new Set(items.map((i) => i.type))];

    return this.buildSection(
      'user-discover',
      'New Discoveries',
      'MusicCoverShelf',
      resourceTypes,
      items,
    );
  }

  // ─── Global sections ───

  private async buildFeaturedAlbumsSection(): Promise<PersonalRecommendationResource | null> {
    const topAlbums = await this.listeningService.getTopAlbumsGlobal(
      30,
      GLOBAL_HERO_LIMIT,
    );
    const trendingItems = await this.albumItemsFromListening(topAlbums);

    const latestItems = await this.latestAlbumItems(GLOBAL_HERO_LIMIT);
    const items = this.uniqueItems([...trendingItems, ...latestItems]).slice(
      0,
      GLOBAL_HERO_LIMIT,
    );
    if (items.length < 3) return null;

    return this.buildSection(
      'global-featured-albums',
      'Featured Now',
      'MusicNotesHeroShelf',
      ['albums'],
      items,
    );
  }

  private async buildTrendingSection(): Promise<PersonalRecommendationResource | null> {
    const trending = await this.listeningService.getTrendingSongs(
      7,
      HOME_SHELF_ITEM_LIMIT * 2,
    );
    if (trending.length < 3) return null;

    const grouped = await this.groupSongsByAlbum(
      trending.map((t) => ({ id: t.songId, type: 'songs' })),
    );
    const items = this.albumItemsOnly(grouped).slice(0, HOME_SHELF_ITEM_LIMIT);
    if (items.length < HOME_SHELF_ITEM_MIN) return null;

    return this.buildSection(
      'global-trending',
      'Trending',
      'MusicCoverShelf',
      ['albums'],
      items,
    );
  }

  private async buildNewReleasesSection(): Promise<PersonalRecommendationResource | null> {
    const newReleases =
      await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'albums',
          releaseDate: { not: '' },
        },
        orderBy: { releaseDate: 'desc' },
        take: HOME_SHELF_ITEM_LIMIT,
        select: { resourceId: true, resourceType: true },
      });

    if (newReleases.length < HOME_SHELF_ITEM_MIN) return null;

    return this.buildSection(
      'global-new-releases',
      'New Releases',
      'MusicCoverShelf',
      ['albums'],
      newReleases.map((release) => ({
        id: release.resourceId,
        type: release.resourceType,
      })),
    );
  }

  private async buildTopAlbumsSection(): Promise<PersonalRecommendationResource | null> {
    const topAlbums = await this.listeningService.getTopAlbumsGlobal(
      30,
      HOME_SHELF_ITEM_LIMIT * 2,
    );
    if (topAlbums.length < 3) return null;

    const items = await this.albumItemsFromListening(topAlbums);

    if (items.length < HOME_SHELF_ITEM_MIN) return null;

    return this.buildSection(
      'global-top-albums',
      'Albums You Should Hear',
      'MusicCoverShelf',
      ['albums'],
      items.slice(0, HOME_SHELF_ITEM_LIMIT),
    );
  }

  private async buildGenreAlbumSections(): Promise<PersonalRecommendationResource[]> {
    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        genreNames: { isEmpty: false },
      },
      orderBy: [{ releaseDate: 'desc' }, { updatedAt: 'desc' }],
      take: 480,
      select: {
        resourceId: true,
        genreNames: true,
      },
    });
    if (albums.length < 9) return [];

    const genreCounts = new Map<string, number>();
    for (const album of albums) {
      for (const genre of album.genreNames) {
        const normalized = genre.trim();
        if (!normalized || normalized.toLowerCase() === 'music') continue;
        genreCounts.set(normalized, (genreCounts.get(normalized) ?? 0) + 1);
      }
    }

    const genres = [...genreCounts.entries()]
      .filter(([, count]) => count >= 3)
      .sort((left, right) => right[1] - left[1])
      .slice(0, GLOBAL_GENRE_SECTION_LIMIT)
      .map(([genre]) => genre);

    const sections: PersonalRecommendationResource[] = [];
    const usedAlbums = new Set<string>();

    for (const genre of genres) {
      const items = albums
        .filter(
          (album) =>
            album.genreNames.includes(genre) && !usedAlbums.has(album.resourceId),
        )
        .slice(0, HOME_SHELF_ITEM_LIMIT)
        .map((album) => ({ id: album.resourceId, type: 'albums' }));

      if (items.length < HOME_SHELF_ITEM_MIN) continue;
      for (const item of items) usedAlbums.add(item.id);

      sections.push(
        this.buildSection(
          `global-genre-${this.slugify(genre)}`,
          genre,
          'MusicCoverShelf',
          ['albums'],
          items,
        ),
      );
    }

    return sections;
  }

  private async buildDiscoveryAlbumsSection(): Promise<PersonalRecommendationResource | null> {
    const items = await this.latestAlbumItems(HOME_SHELF_ITEM_LIMIT, 'asc');
    if (items.length < HOME_SHELF_ITEM_MIN) return null;

    return this.buildSection(
      'global-discovery-albums',
      'More to Discover',
      'MusicCoverShelf',
      ['albums'],
      items,
    );
  }

  private async albumItemsFromListening(
    albums: Array<{ albumId: string | null; albumName: string }>,
  ): Promise<Array<{ id: string; type: string }>> {
    const albumIds = [...new Set(
      albums.map((album) => album.albumId).filter((id): id is string => Boolean(id)),
    )];
    const legacyAlbumNames = [...new Set(
      albums
        .filter((album) => !album.albumId)
        .map((album) => album.albumName)
        .filter(Boolean),
    )];
    if (albumIds.length === 0 && legacyAlbumNames.length === 0) return [];

    const snapshots = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        OR: [
          ...(albumIds.length ? [{ resourceId: { in: albumIds } }] : []),
          ...(legacyAlbumNames.length
            ? [{ name: { in: legacyAlbumNames } }]
            : []),
        ],
      },
      select: { resourceId: true, resourceType: true, name: true },
    });
    const byId = new Map(snapshots.map((snapshot) => [snapshot.resourceId, snapshot]));
    const byLegacyName = new Map(snapshots.map((snapshot) => [snapshot.name, snapshot]));

    return albums.flatMap((album) => {
      const snapshot = album.albumId
        ? byId.get(album.albumId)
        : byLegacyName.get(album.albumName);
      return snapshot
        ? [{ id: snapshot.resourceId, type: snapshot.resourceType }]
        : [];
    });
  }

  // ─── Helpers ───

  private async latestAlbumItems(
    limit: number,
    direction: 'asc' | 'desc' = 'desc',
  ): Promise<Array<{ id: string; type: string }>> {
    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        artworkUrl: { not: '' },
      },
      orderBy: [{ releaseDate: direction }, { updatedAt: 'desc' }],
      take: limit,
      select: { resourceId: true, resourceType: true },
    });

    return albums.map((album) => ({
      id: album.resourceId,
      type: album.resourceType,
    }));
  }

  private async buildSmartGlobalAlbumSections(
    existingSectionCount: number,
  ): Promise<PersonalRecommendationResource[]> {
    const albums = await this.albumShelfCandidates(600);
    if (albums.length < HOME_SHELF_ITEM_MIN) return [];

    const sections: PersonalRecommendationResource[] = [];
    const usedSectionIds = new Set<string>();
    const addSection = (
      sectionId: string,
      title: string,
      candidates: AlbumShelfCandidate[],
      displayKind = 'MusicCoverShelf',
    ) => {
      if (
        existingSectionCount + sections.length >= GLOBAL_SHELF_LIMIT ||
        usedSectionIds.has(sectionId)
      ) {
        return;
      }

      const items = this.albumShelfItems(candidates);
      if (items.length < HOME_SHELF_ITEM_MIN) return;
      usedSectionIds.add(sectionId);
      sections.push(
        this.buildSection(sectionId, title, displayKind, ['albums'], items),
      );
    };

    const latest = [...albums].sort((left, right) =>
      this.compareReleaseDate(right, left),
    );
    const deepest = [...albums].sort((left, right) =>
      this.compareReleaseDate(left, right),
    );
    const longest = [...albums].sort(
      (left, right) => right.trackCount - left.trackCount,
    );
    const refreshed = [...albums].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );

    addSection('global-fresh-finds', 'Fresh Finds', latest.slice(12));
    addSection('global-big-albums', 'Big Albums', longest);
    addSection('global-recently-added', 'Recently Added', refreshed);
    addSection('global-deep-cuts', 'Deep Cuts', deepest);

    for (const { key, title, candidates } of this.groupAlbumShelves(
      albums,
      'genre',
    )) {
      addSection(`global-genre-more-${key}`, title, candidates);
    }

    for (const { key, title, candidates } of this.groupAlbumShelves(
      albums,
      'artist',
    )) {
      addSection(`global-artist-${key}`, `${title} Essentials`, candidates);
    }

    for (const { key, title, candidates } of this.groupAlbumShelves(
      albums,
      'label',
    )) {
      addSection(`global-label-${key}`, `From ${title}`, candidates);
    }

    for (const { key, title, candidates } of this.groupAlbumShelves(
      albums,
      'decade',
    )) {
      addSection(`global-decade-${key}`, title, candidates, 'MusicCoverShelf');
    }

    if (existingSectionCount + sections.length < GLOBAL_SHELF_MIN) {
      const windows = [
        ['global-more-new-music', 'More New Music', latest.slice(24)],
        ['global-editors-picks', 'Editors Picks', refreshed.slice(24)],
        ['global-albums-to-explore', 'Albums to Explore', albums.slice(48)],
        ['global-weekend-listening', 'Weekend Listening', longest.slice(24)],
      ] as const;

      for (const [sectionId, title, candidates] of windows) {
        addSection(sectionId, title, candidates);
      }
    }

    return sections;
  }

  private async albumShelfCandidates(
    limit: number,
  ): Promise<AlbumShelfCandidate[]> {
    return this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        artworkUrl: { not: '' },
      },
      orderBy: [{ releaseDate: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      select: {
        resourceId: true,
        resourceType: true,
        name: true,
        artistName: true,
        genreNames: true,
        releaseDate: true,
        recordLabel: true,
        trackCount: true,
        updatedAt: true,
      },
    });
  }

  private groupAlbumShelves(
    albums: AlbumShelfCandidate[],
    mode: 'genre' | 'artist' | 'label' | 'decade',
  ): Array<{ key: string; title: string; candidates: AlbumShelfCandidate[] }> {
    const groups = new Map<string, AlbumShelfCandidate[]>();
    const titles = new Map<string, string>();

    for (const album of albums) {
      const values =
        mode === 'genre'
          ? album.genreNames.filter(
              (genre) => genre.trim() && genre.toLowerCase() !== 'music',
            )
          : mode === 'artist'
            ? [album.artistName]
            : mode === 'label'
              ? [album.recordLabel]
              : [this.decadeTitle(album.releaseDate)];

      for (const value of values) {
        const title = value.trim();
        if (!title) continue;
        const key = this.slugify(title);
        if (!key) continue;
        titles.set(key, title);
        groups.set(key, [...(groups.get(key) ?? []), album]);
      }
    }

    return [...groups.entries()]
      .filter(([, candidates]) => candidates.length >= HOME_SHELF_ITEM_MIN)
      .sort((left, right) => right[1].length - left[1].length)
      .slice(0, mode === 'genre' ? 8 : 4)
      .map(([key, candidates]) => ({
        key,
        title: titles.get(key) ?? key,
        candidates,
      }));
  }

  private albumShelfItems(
    albums: AlbumShelfCandidate[],
  ): Array<{ id: string; type: string }> {
    return this.uniqueItems(
      albums.map((album) => ({
        id: album.resourceId,
        type: album.resourceType,
      })),
    ).slice(0, HOME_SHELF_ITEM_LIMIT);
  }

  private compareReleaseDate(
    left: Pick<AlbumShelfCandidate, 'releaseDate' | 'updatedAt'>,
    right: Pick<AlbumShelfCandidate, 'releaseDate' | 'updatedAt'>,
  ): number {
    const leftTime = Date.parse(left.releaseDate) || left.updatedAt.getTime();
    const rightTime = Date.parse(right.releaseDate) || right.updatedAt.getTime();
    return leftTime - rightTime;
  }

  private decadeTitle(releaseDate: string): string {
    const year = Number.parseInt(releaseDate.slice(0, 4), 10);
    if (!Number.isFinite(year)) return '';
    const decade = Math.floor(year / 10) * 10;
    return `${decade}s Essentials`;
  }

  private albumItemsOnly(
    items: Array<{ id: string; type: string }>,
  ): Array<{ id: string; type: string }> {
    return this.uniqueItems(items.filter((item) => item.type === 'albums'));
  }

  private uniqueItems(
    items: Array<{ id: string; type: string }>,
  ): Array<{ id: string; type: string }> {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private removeDuplicateSections(
    sections: PersonalRecommendationResource[],
  ): PersonalRecommendationResource[] {
    const signatures = new Set<string>();

    return sections.filter((section) => {
      const refs = section.relationships?.contents?.data ?? [];
      const signature = refs
        .slice(0, HOME_SHELF_ITEM_MIN)
        .map((item) => `${item.type}:${item.id}`)
        .join('|');

      if (!signature || signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    });
  }

  /**
   * Catalog resource IDs are opaque. Historical imports can therefore contain
   * two album IDs for one release; remove the later card by its stable release
   * metadata before a global Home page is published. This is intentionally a
   * presentation safeguard — catalog authoring remains the primary guard.
   */
  private async deduplicateSemanticAlbumItems(
    sections: PersonalRecommendationResource[],
  ): Promise<PersonalRecommendationResource[]> {
    const albumIds = [...new Set(
      sections.flatMap((section) =>
        (section.relationships?.contents?.data ?? [])
          .filter((item) => item.type === 'albums')
          .map((item) => item.id),
      ),
    )];
    if (albumIds.length === 0) return sections;

    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        resourceId: { in: albumIds },
      },
      select: {
        resourceId: true,
        name: true,
        title: true,
        artistName: true,
        subtitle: true,
        releaseDate: true,
        trackCount: true,
        isSingle: true,
        upc: true,
      },
    });
    const albumKeyById = new Map(
      albums.map((album) => [
        album.resourceId,
        this.albumPresentationKey(album),
      ]),
    );
    const usedAlbumKeys = new Set<string>();

    return sections.map((section) => {
      const contents = section.relationships?.contents;
      if (!contents) return section;

      const deduped = contents.data.filter((item) => {
        if (item.type !== 'albums') return true;
        const semanticKey = albumKeyById.get(item.id);
        if (!semanticKey) return true;
        if (usedAlbumKeys.has(semanticKey)) return false;
        usedAlbumKeys.add(semanticKey);
        return true;
      });

      return {
        ...section,
        relationships: {
          primaryContent: section.relationships?.primaryContent ?? {
            href: '',
            data: [],
          },
          contents: { ...contents, data: deduped },
        },
      };
    });
  }

  private albumPresentationKey(album: {
    resourceId: string;
    name: string;
    title: string;
    artistName: string;
    subtitle: string;
    releaseDate: string;
    trackCount: number;
    isSingle: boolean;
    upc: string;
  }): string {
    const upc = this.normalizedRecommendationText(album.upc);
    if (upc) return `upc:${upc}`;

    const name = this.normalizedRecommendationText(album.name || album.title);
    const artist = this.normalizedRecommendationText(
      album.artistName || album.subtitle,
    );
    if (!name || !artist || !album.releaseDate) {
      return `id:${album.resourceId}`;
    }

    // trackCount and isSingle are intentionally excluded: a deluxe/standard
    // pair or a provider tracklist that differs by one bonus track is still one
    // release to a listener, and the same release can surface as a single
    // (≤3 tracks) and an album (>3 tracks) across two collection IDs. Keeping
    // either field let those variants show as two identical-looking cards. This
    // matches the catalog guard's fingerprint and the seed tool's release key.
    return [name, artist, album.releaseDate].join('::');
  }

  private normalizedRecommendationText(value: string): string {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private diversifyHomeAlbumPreviews(
    sections: PersonalRecommendationResource[],
  ): PersonalRecommendationResource[] {
    const usedPreviewResources = new Set<string>();
    const diversified: PersonalRecommendationResource[] = [];

    for (const section of sections) {
      const contents = section.relationships?.contents;
      const refs = contents?.data ?? [];
      const preview: typeof refs = [];
      const overflow: typeof refs = [];
      const sectionResources = new Set<string>();

      for (const item of refs) {
        const key = `${item.type}:${item.id}`;
        if (sectionResources.has(key)) continue;
        sectionResources.add(key);
        if (usedPreviewResources.has(key)) continue;

        if (preview.length < HOME_SHELF_PREVIEW_LIMIT) {
          preview.push(item);
          continue;
        }

        overflow.push(item);
      }

      const minimumPreviewItems =
        section.attributes?.resourceTypes?.every((type) => type === 'albums')
          ? HOME_SHELF_ITEM_MIN
          : 3;
      if (preview.length < minimumPreviewItems) continue;

      const nextRefs = [...preview, ...overflow];

      for (const item of preview) {
        usedPreviewResources.add(`${item.type}:${item.id}`);
      }

      if (!contents) {
        diversified.push(section);
        continue;
      }

      diversified.push({
        ...section,
        relationships: {
          primaryContent: section.relationships?.primaryContent ?? {
            href: '',
            data: [],
          },
          contents: {
            ...contents,
            data: nextRefs,
          },
        },
      });
    }

    return diversified;
  }

  private buildSection(
    sectionId: string,
    title: string,
    displayKind: string,
    resourceTypes: string[],
    items: Array<{ id: string; type: string }>,
  ): PersonalRecommendationResource {
    return {
      id: sectionId,
      type: 'personal-recommendation',
      href: `/me/recommendations/${sectionId}?name=listen-now`,
      attributes: {
        display: { kind: displayKind, decorations: [] },
        hasSeeAll: false,
        isGroupRecommendation: false,
        kind: 'music-recommendations',
        nextUpdateDate: '',
        resourceTypes,
        title: { stringForDisplay: title },
        titleWithoutName: { stringForDisplay: title },
        version: 1,
        presentationMode:
          RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_FIXED,
      },
      relationships: {
        contents: {
          href: `/me/recommendations/${sectionId}/contents?name=listen-now`,
          data: items.map((item) => ({
            id: item.id,
            type: item.type,
            href: `/catalog/vn/${item.type}/${item.id}`,
          })),
        },
        primaryContent: { href: '', data: [] },
      },
    };
  }

  private buildEngineSection(
    shelf: GeneratedShelf,
  ): PersonalRecommendationResource {
    const section = this.buildSection(
      shelf.id,
      shelf.title,
      'MusicCoverShelf',
      ['albums'],
      shelf.items,
    );
    return {
      ...section,
      attributes: {
        ...section.attributes!,
        kind: 'ranked-personalisation',
        version: shelf.modelVersion,
      },
    };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async buildCatalogBrowseSection(
    sectionId: string,
    title: string,
    resourceType: string,
    displayKind: string,
  ): Promise<PersonalRecommendationResource | null> {
    try {
      const items = await this.catalogService.browse(
        resourceType,
        HOME_SHELF_ITEM_LIMIT,
        'latest',
      );
      if (
        resourceType === 'albums' &&
        items.length < HOME_SHELF_ITEM_MIN
      ) {
        return null;
      }
      if (items.length === 0) return null;

      return this.buildSection(
        sectionId,
        title,
        displayKind,
        [resourceType],
        items.map((i) => ({ id: i.id, type: i.type })),
      );
    } catch {
      return null;
    }
  }
}
