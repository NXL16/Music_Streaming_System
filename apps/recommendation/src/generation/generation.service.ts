import { Injectable, Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
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
import { Prisma } from '../generated/prisma/client';
import { ListeningService, TasteProfile } from '../listening/listening.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { RecommendationCatalogService } from '../recommendations/recommendation-catalog.service';
import { CatalogSynchronizationService } from '../recommendations/catalog-synchronization.service';
import {
  SystemStationArtworkService,
  type SystemStationArtwork,
} from '../recommendations/system-station-artwork.service';
import {
  GeneratedShelf,
  PERSONALIZATION_MODEL_VERSION,
  RecommendationEngineService,
} from './recommendation-engine.service';
import { PRODUCTION_RECOMMENDATION_POLICY } from './production-recommendation-policy';
import { developmentCacheDisabled } from '../common/configs/development-cache';
import { GenerationLeaseService } from './generation-lease.service';
import { ArtistStationService } from '../stations/artist-station.service';
import {
  GENERATION_LEASE_LOST_MESSAGE,
  type GenerationLease,
} from './generation-lease.types';

const STALE_DURATION_MS = 6 * 60 * 60 * 1000;
const MAX_PER_ARTIST = 3;
const DAILY_MIX_MAX_PER_ARTIST = 2;
const DAILY_MIX_TRACK_LIMIT = 25;
const DAILY_MIX_MIN_TRACKS = 5;
const DAILY_MIX_LIMIT = 4;
const STATION_TRACK_LIMIT = 80;
// Small local catalogs should still expose a truthful mood station once it has
// enough variety to avoid immediately repeating a track.
const MOOD_STATION_MIN_TRACKS = 5;
const FAMILIAR_ARTIST_STATION_LIMIT = 9;
const DISCOVERY_ARTIST_STATION_LIMIT = 3;
const SYSTEM_VARIANT_MAX_OVERLAP_RATIO = 0.6;
const SYSTEM_VARIANT_MIN_NOVEL_RATIO = 0.25;
const MIN_LISTENED_SONGS = 3;
const HOME_SHELF_ITEM_MIN = 10;
const HOME_SHELF_ITEM_LIMIT = 40;
const GLOBAL_PUBLISH_MIN_SHELVES = 12;
const GLOBAL_SHELF_LIMIT = 22;

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

export function isGenerationLeaseLostError(error: unknown): boolean {
  if (!(error instanceof RpcException)) return false;

  const details = error.getError();
  return (
    isRecord(details) &&
    details.code === status.ABORTED &&
    details.message === GENERATION_LEASE_LOST_MESSAGE
  );
}

function generationLeaseLostError(): RpcException {
  return new RpcException({
    code: status.ABORTED,
    message: GENERATION_LEASE_LOST_MESSAGE,
  });
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
  audioTraits?: string[];
  moodTags?: string[];
  releaseDate: string;
  releaseType: string;
};

type MoodStationProfile = {
  key: string;
  title: string;
  subtitle: string;
  traits: readonly string[];
  genres: readonly string[];
  avoidTraits: readonly string[];
  allowGenreFallback: boolean;
};

type GenerationWriteGuard = () => Promise<void>;

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
    private readonly systemStationArtworkService: SystemStationArtworkService,
    private readonly generationLeaseService: GenerationLeaseService,
    private readonly artistStationService: ArtistStationService,
  ) {}

  async generate(
    request: GenerateRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const generated = await this.generateWithLease(request);
    if (generated) {
      return generated;
    }

    throw new RpcException({
      code: status.ABORTED,
      message: 'Recommendation generation is already in progress',
    });
  }

  private generatingGlobal = false;

  async isGlobalPageStale(name: string, locale: string): Promise<boolean> {
    if (developmentCacheDisabled()) return true;
    const page = await this.prisma.recommendationPage.findFirst({
      where: {
        scopeKey: 'GLOBAL',
        name: name || 'listen-now',
        locale: locale || 'en-GB',
        status: 'PUBLISHED',
      },
      select: {
        staleAfter: true,
        sections: {
          where: { externalId: 'global-top-picks' },
          select: { version: true },
        },
      },
    });
    if (!page) return true;
    if (!page.staleAfter) return true;
    return (
      page.staleAfter <= new Date() ||
      !page.sections.some(
        (section) => section.version >= PERSONALIZATION_MODEL_VERSION,
      )
    );
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
      return await this.generateWithLease({
        userId: '',
        scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_GLOBAL,
        actorUserId: 'system:recommendation-engine',
        name: name || 'listen-now',
        locale: locale || 'en-GB',
        timezone: normalizeTimezone(timezone),
        platform: platform || 'web',
      });
    } catch (error) {
      if (isGenerationLeaseLostError(error)) {
        this.logger.debug(
          '[generation] lazy global refresh canceled after lease ownership changed',
        );
        return null;
      }
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
      this.logger.warn(
        `[lazy-user] skip: user ${userId} has insufficient personalisation signals`,
      );
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
      developmentCacheDisabled() ||
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
      const result = await this.generateWithLease({
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
      if (isGenerationLeaseLostError(error)) {
        this.logger.debug(
          '[generation] lazy user refresh canceled after lease ownership changed',
        );
        return null;
      }
      this.logger.warn('Failed to generate user recommendations', error);
      return null;
    } finally {
      this.generatingUsers.delete(userId);
    }
  }

  /**
   * Serializes generation across every Recommendation replica. The lease token
   * is checked in the same transaction as every destructive page write, so a
   * worker that outlives its lease cannot publish an obsolete result.
   */
  private async generateWithLease(
    request: GenerateRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse | null> {
    const leaseKey = this.generationLeaseKey(request);
    const lease = await this.generationLeaseService.acquire(leaseKey);
    if (!lease) {
      this.logger.debug(`[generation] skip: lease is held for ${leaseKey}`);
      return null;
    }

    let stopped = false;
    let leaseLost = false;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    const assertLeaseHeldBeforeWrite: GenerationWriteGuard = async () => {
      if (leaseLost || !(await this.generationLeaseService.isHeld(lease))) {
        if (!leaseLost) {
          this.logger.warn(
            `[generation] lease ownership changed before persistence for ${leaseKey}; current page is unchanged`,
          );
        }
        leaseLost = true;
        throw generationLeaseLostError();
      }
    };
    const renewLease = async (): Promise<void> => {
      if (stopped) return;

      try {
        const renewed = await this.generationLeaseService.renew(lease);
        if (!renewed) {
          leaseLost = true;
          this.logger.warn(
            `[generation] lease ownership changed before completion for ${leaseKey}; writes will be canceled`,
          );
          return;
        }
      } catch (error) {
        // A transient renewal failure must not immediately discard a valid
        // generation. Fencing at write time still prevents an expired worker
        // from replacing a newer page.
        this.logger.warn(
          `[generation] failed to renew lease for ${leaseKey}`,
          error,
        );
      }

      if (!stopped) {
        renewalTimer = setTimeout(() => {
          void renewLease();
        }, this.generationLeaseService.renewIntervalMs);
      }
    };

    renewalTimer = setTimeout(() => {
      void renewLease();
    }, this.generationLeaseService.renewIntervalMs);

    try {
      if (
        request.scope === RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER
      ) {
        return await this.generateUser(
          request,
          lease,
          assertLeaseHeldBeforeWrite,
        );
      }

      return await this.generateGlobal(
        request,
        lease,
        assertLeaseHeldBeforeWrite,
      );
    } finally {
      stopped = true;
      if (renewalTimer) {
        clearTimeout(renewalTimer);
      }
      await this.generationLeaseService.release(lease);
    }
  }

  private generationLeaseKey(request: GenerateRecommendationsRequest): string {
    const isUserScope =
      request.scope === RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER;
    const scopeKey = isUserScope ? `USER:${request.userId}` : 'GLOBAL';
    const timezone = isUserScope ? normalizeTimezone(request.timezone) : '*';
    const fingerprint = JSON.stringify({
      scopeKey,
      name: request.name || 'listen-now',
      locale: request.locale || 'en-GB',
      timezone,
    });

    return `recommendation-home:${createHash('sha256')
      .update(fingerprint)
      .digest('hex')}`;
  }

  // ─── Global generation ───

  private async generateGlobal(
    request: GenerateRecommendationsRequest,
    lease: GenerationLease,
    assertLeaseHeldBeforeWrite: GenerationWriteGuard,
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

    const globalShelves =
      await this.recommendationEngine.generateGlobalShelves();
    const albumSections = globalShelves.map((shelf) =>
      this.buildEngineSection(shelf),
    );

    const moodStations = await this.buildGlobalMoodStationsSection();
    const playlists = await this.buildCatalogBrowseSection(
      'global-playlists',
      'Playlist Picks',
      'playlists',
      'MusicCoverShelf',
    );
    const sections = this.composeGlobalHomeSections(
      albumSections,
      playlists,
      moodStations,
    );

    if (sections.length === 0) {
      return this.recommendationsService.getHomeRecommendations({
        userId: '',
        name,
        locale,
        timezone,
        platform,
      });
    }

    // Global and personalised Home use the same release-level rule: an album
    // may occupy only one recommendation shelf. Recently Played is generated
    // separately for a user and is deliberately outside this global page.
    const uniqueSections = this.removeDuplicateSections(sections).slice(
      0,
      GLOBAL_SHELF_LIMIT,
    );
    const publishableSections = await this.deduplicateSemanticAlbumItems(
      await this.excludeUnpublishedCatalogContent(uniqueSections),
    );

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

    await assertLeaseHeldBeforeWrite();
    await this.recommendationsService.replaceHomeRecommendations(
      {
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
      },
      { lease },
    );

    await assertLeaseHeldBeforeWrite();
    const result = await this.recommendationsService.publishRecommendationPage(
      {
        userId: '',
        name,
        locale,
        timezone,
        platform,
        scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_GLOBAL,
        actorUserId,
      },
      { lease, staleAfter: new Date(Date.now() + STALE_DURATION_MS) },
    );

    return result;
  }

  // ─── User generation (smart) ───

  private async generateUser(
    request: GenerateRecommendationsRequest,
    lease: GenerationLease,
    assertLeaseHeldBeforeWrite: GenerationWriteGuard,
  ): Promise<GetHomeRecommendationsResponse> {
    const userId = request.userId;
    const name = request.name || 'listen-now';
    const locale = request.locale || 'en-GB';
    const timezone = normalizeTimezone(request.timezone);
    const platform = request.platform || 'web';
    const actorUserId = request.actorUserId || 'system:recommendation-engine';

    const profile = await this.listeningService.getUserTasteProfile(userId);
    // Cold-start users get the stable global editorial page. We do not invent
    // a fake personal profile or label random catalog results as "For You".
    if (
      profile.listenedSongIds.size <
      PRODUCTION_RECOMMENDATION_POLICY.minimumHistoryEvents
    ) {
      return this.recommendationsService.getHomeRecommendations({
        userId: '',
        name,
        locale,
        timezone,
        platform,
      });
    }
    const recentlyPlayed = await this.buildRecentlyPlayedSection(userId);
    const dailyMix = await this.buildDailyMixPlaylist(userId, profile);
    const stations = await this.buildArtistStationsForYouSection(
      userId,
      profile,
    );
    const moodStations = await this.buildMoodStationsSection(userId, profile);
    const shelves = await this.recommendationEngine.generateUserShelves(
      userId,
      profile,
    );
    const shelfById = new Map(
      shelves.map((shelf) => [shelf.id, this.buildEngineSection(shelf)]),
    );
    const systemSections = new Map<
      string,
      PersonalRecommendationResource | null
    >([
      ['recently-played', recentlyPlayed],
      ['made-for-you', dailyMix],
      ['stations-for-you', stations],
      ['find-your-mood', moodStations],
    ]);
    const sections = PRODUCTION_RECOMMENDATION_POLICY.personalizedOrder
      .map((slot) => systemSections.get(slot) ?? shelfById.get(`user-${slot}`))
      .filter((section): section is PersonalRecommendationResource =>
        Boolean(section),
      );

    const sectionIds = new Set(sections.map((section) => section.id));
    for (const shelf of shelves) {
      const section = shelfById.get(shelf.id);
      if (!section || sectionIds.has(section.id)) continue;
      sections.push(section);
      sectionIds.add(section.id);
      if (sections.length >= PRODUCTION_RECOMMENDATION_POLICY.maxHomeShelves) {
        break;
      }
    }

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
    const publishableSections = await this.deduplicateSemanticAlbumItems(
      await this.excludeUnpublishedCatalogContent(
        this.excludeHiddenContent(sections, profile),
      ),
    );

    await assertLeaseHeldBeforeWrite();
    await this.recommendationsService.replaceHomeRecommendations(
      {
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
      },
      { lease },
    );

    await assertLeaseHeldBeforeWrite();
    const result = await this.recommendationsService.publishRecommendationPage(
      {
        userId,
        name,
        locale,
        timezone,
        platform,
        scope: RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER,
        actorUserId,
      },
      { lease, staleAfter: new Date(Date.now() + STALE_DURATION_MS) },
    );

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
    const artistWeight =
      profile.artists.find((a) => a.name === song.artistName)?.weight ?? 0;
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
    const scored: ScoredItem[] = candidates
      .filter(
        (candidate) =>
          !this.isHidden(profile, candidate.resourceType, candidate.resourceId),
      )
      .map((c) => ({
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

  /**
   * Personalized track lists blend the listener's direct taste profile with two independent
   * discovery signals: qualified popularity and neighbours with overlapping
   * listening histories. This keeps the mix personal without becoming an
   * echo chamber of only artists the listener already knows.
   */
  private async rankPersonalizedTracks(
    userId: string,
    candidates: SnapshotRow[],
    profile: TasteProfile,
    limit: number,
    maxPerArtist: number,
  ): Promise<ScoredItem[]> {
    const visibleCandidates = candidates.filter(
      (candidate) =>
        !this.isHidden(profile, candidate.resourceType, candidate.resourceId),
    );
    const candidateIds = visibleCandidates.map(
      (candidate) => candidate.resourceId,
    );
    const [popularity, collaborative] = await Promise.all([
      this.dailyMixPopularityScores(candidateIds),
      this.dailyMixCollaborativeScores(
        userId,
        [...profile.listenedSongIds],
        candidateIds,
      ),
    ]);
    const scored = visibleCandidates
      .map((candidate) => ({
        id: candidate.resourceId,
        type: candidate.resourceType,
        artistName: candidate.artistName,
        score:
          this.scoreSong(candidate, profile) *
            PRODUCTION_RECOMMENDATION_POLICY.dailyMixWeights.taste +
          (popularity.get(candidate.resourceId) ?? 0) *
            PRODUCTION_RECOMMENDATION_POLICY.dailyMixWeights.popularity +
          (collaborative.get(candidate.resourceId) ?? 0) *
            PRODUCTION_RECOMMENDATION_POLICY.dailyMixWeights.collaborative,
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.id.localeCompare(right.id),
      );

    const artistCounts = new Map<string, number>();
    const result: ScoredItem[] = [];
    for (const item of scored) {
      if (result.length >= limit) break;
      if ((artistCounts.get(item.artistName) ?? 0) >= maxPerArtist) {
        continue;
      }
      artistCounts.set(
        item.artistName,
        (artistCounts.get(item.artistName) ?? 0) + 1,
      );
      result.push(item);
    }
    return result;
  }

  private isHidden(
    profile: TasteProfile,
    resourceType: string,
    resourceId: string,
  ): boolean {
    return (
      profile.hiddenResourceIds.get(resourceType)?.has(resourceId) ?? false
    );
  }

  private excludeHiddenContent(
    sections: PersonalRecommendationResource[],
    profile: TasteProfile,
  ): PersonalRecommendationResource[] {
    return sections.flatMap((section) => {
      const relationships = section.relationships;
      const contents = relationships?.contents;
      if (!relationships || !contents?.data?.length) return [section];
      const visibleItems = contents.data.filter(
        (item) => !this.isHidden(profile, item.type, item.id),
      );
      if (visibleItems.length === 0) return [];
      return [
        {
          ...section,
          relationships: {
            ...relationships,
            contents: { ...contents, data: visibleItems },
            primaryContent: relationships.primaryContent ?? {
              href: '',
              data: [],
            },
          },
        },
      ];
    });
  }

  /**
   * Mood names are promises to the listener, not display-only labels. A song
   * must carry a matching audio/mood trait or a deliberately mapped genre to
   * be eligible; unrelated personal taste never fills a sparse mood station.
   */
  private async rankMoodStationTracks(
    userId: string,
    candidates: Array<SnapshotRow & { attributes?: unknown }>,
    profile: TasteProfile,
    mood: MoodStationProfile,
  ): Promise<ScoredItem[]> {
    const eligible = candidates
      .map((candidate) => ({
        candidate,
        moodScore: this.moodMatchScore(candidate, mood),
      }))
      .filter(({ moodScore }) => moodScore > 0);
    if (eligible.length < MOOD_STATION_MIN_TRACKS) return [];

    const personalized = await this.rankPersonalizedTracks(
      userId,
      eligible.map(({ candidate }) => candidate),
      profile,
      eligible.length,
      DAILY_MIX_MAX_PER_ARTIST,
    );
    const personalizedScores = new Map(
      personalized.map((item) => [item.id, item.score]),
    );
    const maxPersonalizedScore = Math.max(1, ...personalizedScores.values());

    return eligible
      .map(({ candidate, moodScore }) => ({
        id: candidate.resourceId,
        type: candidate.resourceType,
        artistName: candidate.artistName,
        score:
          moodScore * 0.8 +
          ((personalizedScores.get(candidate.resourceId) ?? 0) /
            maxPersonalizedScore) *
            0.2,
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.id.localeCompare(right.id),
      );
  }

  private moodMatchScore(
    song: Pick<SnapshotRow, 'genreNames' | 'audioTraits' | 'moodTags'> & {
      attributes?: unknown;
    },
    mood: MoodStationProfile,
  ) {
    const traits = this.moodTokens(
      song.audioTraits ?? [],
      song.moodTags ?? [],
      isRecord(song.attributes) ? song.attributes : undefined,
    );
    const genres = song.genreNames.map((genre) =>
      this.normalizeMoodToken(genre),
    );
    const traitMatches = mood.traits.filter((term) =>
      this.hasMoodTerm(traits, term),
    ).length;
    const genreMatches = mood.genres.filter((genre) =>
      this.hasMoodTerm(genres, genre),
    ).length;
    if (
      traitMatches === 0 &&
      (!mood.allowGenreFallback || genreMatches === 0)
    ) {
      return 0;
    }

    const avoided = mood.avoidTraits.some((term) =>
      this.hasMoodTerm(traits, term),
    );
    const traitScore = traitMatches / mood.traits.length;
    const genreScore = genreMatches / mood.genres.length;
    return Math.max(
      0,
      traitScore * 0.8 + genreScore * 0.2 - (avoided ? 0.45 : 0),
    );
  }

  private moodTokens(
    audioTraits: string[],
    moodTags: string[],
    attributes?: unknown,
  ) {
    const attributeTags = isRecord(attributes)
      ? ['moods', 'moodTags', 'tags'].flatMap((key) => {
          const value = attributes[key];
          return Array.isArray(value)
            ? value.filter((item): item is string => typeof item === 'string')
            : typeof value === 'string'
              ? [value]
              : [];
        })
      : [];
    return [...audioTraits, ...moodTags, ...attributeTags].map((value) =>
      this.normalizeMoodToken(value),
    );
  }

  private normalizeMoodToken(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '-');
  }

  private hasMoodTerm(tokens: string[], term: string) {
    const normalizedTerm = this.normalizeMoodToken(term);
    return tokens.some(
      (token) =>
        token === normalizedTerm ||
        token.startsWith(`${normalizedTerm}-`) ||
        token.endsWith(`-${normalizedTerm}`),
    );
  }

  private async dailyMixPopularityScores(songIds: string[]) {
    if (!songIds.length) return new Map<string, number>();
    const historyStart = new Date(
      Date.now() -
        PRODUCTION_RECOMMENDATION_POLICY.historyWindowDays * 86_400_000,
    );
    const rows = await this.prisma.userListeningStats.groupBy({
      by: ['songId'],
      where: {
        songId: { in: songIds },
        playCount: { gt: 0 },
        lastPlayedAt: { gte: historyStart },
      },
      _sum: { playCount: true, completionCount: true, skipCount: true },
      orderBy: { _sum: { playCount: 'desc' } },
    });
    const raw = new Map(
      rows.map((row) => {
        const plays = row._sum.playCount ?? 0;
        const engagement = Math.max(
          0,
          (row._sum.completionCount ?? 0) +
            plays * 0.25 -
            (row._sum.skipCount ?? 0),
        );
        return [row.songId, engagement] as const;
      }),
    );
    const maximum = Math.max(1, ...raw.values());
    return new Map([...raw].map(([id, score]) => [id, score / maximum]));
  }

  private async dailyMixCollaborativeScores(
    userId: string,
    listenedSongIds: string[],
    candidateSongIds: string[],
  ) {
    if (!listenedSongIds.length || !candidateSongIds.length) {
      return new Map<string, number>();
    }
    const historyStart = new Date(
      Date.now() -
        PRODUCTION_RECOMMENDATION_POLICY.historyWindowDays * 86_400_000,
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
      take: PRODUCTION_RECOMMENDATION_POLICY.collaborativeOverlapLimit,
    });
    const neighbours = new Map<string, number>();
    for (const row of overlaps) {
      const signal = Math.max(
        0,
        row.completionCount + row.playCount * 0.25 - row.skipCount,
      );
      neighbours.set(row.userId, (neighbours.get(row.userId) ?? 0) + signal);
    }
    const topNeighbours = [...neighbours.entries()]
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, PRODUCTION_RECOMMENDATION_POLICY.collaborativeNeighbourLimit);
    if (!topNeighbours.length) return new Map<string, number>();

    const neighbourWeights = new Map(topNeighbours);
    const rows = await this.prisma.userListeningStats.findMany({
      where: {
        userId: { in: topNeighbours.map(([id]) => id) },
        songId: { in: candidateSongIds },
        playCount: { gt: 0 },
        lastPlayedAt: { gte: historyStart },
      },
      select: {
        userId: true,
        songId: true,
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
      take: PRODUCTION_RECOMMENDATION_POLICY.collaborativeCandidateLimit,
    });
    const raw = new Map<string, number>();
    for (const row of rows) {
      const engagement = Math.max(
        0,
        row.completionCount + row.playCount * 0.25 - row.skipCount,
      );
      raw.set(
        row.songId,
        (raw.get(row.songId) ?? 0) +
          engagement * (neighbourWeights.get(row.userId) ?? 0),
      );
    }
    const maximum = Math.max(1, ...raw.values());
    return new Map([...raw].map(([id, score]) => [id, score / maximum]));
  }

  /**
   * Ranking determines *which* tracks belong in a personalized list; this pass determines
   * their listening order. It avoids consecutive artist and album repeats so
   * a mix feels intentionally programmed rather than like album playback.
   */
  private sequencePersonalizedTracks<
    T extends { resourceId: string; artistName: string; attributes?: unknown },
  >(tracks: T[]): T[] {
    const remaining = [...tracks];
    const ordered: T[] = [];
    let previousArtist = '';
    let previousAlbum = '';

    while (remaining.length > 0) {
      const nextIndex = remaining.findIndex(
        (track) =>
          track.artistName !== previousArtist &&
          this.personalizedTrackAlbumKey(track) !== previousAlbum,
      );
      const differentArtistIndex = remaining.findIndex(
        (track) => track.artistName !== previousArtist,
      );
      const differentAlbumIndex = remaining.findIndex(
        (track) => this.personalizedTrackAlbumKey(track) !== previousAlbum,
      );
      const index =
        nextIndex >= 0
          ? nextIndex
          : differentArtistIndex >= 0
            ? differentArtistIndex
            : differentAlbumIndex >= 0
              ? differentAlbumIndex
              : 0;
      const [next] = remaining.splice(index, 1);
      ordered.push(next);
      previousArtist = next.artistName;
      previousAlbum = this.personalizedTrackAlbumKey(next);
    }

    return ordered;
  }

  private personalizedTrackAlbumKey(track: {
    resourceId: string;
    attributes?: unknown;
  }) {
    if (isRecord(track.attributes)) {
      for (const key of ['albumId', 'albumName']) {
        const value = track.attributes[key];
        if (typeof value === 'string' && value.trim()) {
          return `${key}:${value.trim().toLowerCase()}`;
        }
      }
    }
    return `song:${track.resourceId}`;
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
      (songId) =>
        !albumIdsBySong.has(songId) && !fallbackAlbumNames.has(songId),
    );
    if (unresolvedSongIds.length > 0) {
      const snapshots =
        await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'songs',
            resourceId: { in: unresolvedSongIds },
          },
          select: { resourceId: true, attributes: true },
        });

      for (const snapshot of snapshots) {
        const attributes = snapshot.attributes as Record<
          string,
          unknown
        > | null;
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
      this.logger.warn(
        `[daily-mix] skip: only ${profile.listenedSongIds.size} listened songs (need ${MIN_LISTENED_SONGS})`,
      );
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
      audioTraits: true,
      moodTags: true,
      releaseDate: true,
      releaseType: true,
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
          orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
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
            orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
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
      const listenedFallback =
        await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'songs',
            resourceId: { in: excludedSongIds },
          },
          take: 200,
          orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
          select: songSelection,
        });
      const seenIds = new Set(candidates.map((c) => c.resourceId));
      candidates = [
        ...candidates,
        ...listenedFallback.filter((c) => !seenIds.has(c.resourceId)),
      ];
    }

    const ranked = await this.rankPersonalizedTracks(
      userId,
      candidates,
      profile,
      DAILY_MIX_TRACK_LIMIT * DAILY_MIX_LIMIT,
      DAILY_MIX_MAX_PER_ARTIST,
    );
    if (ranked.length < DAILY_MIX_MIN_TRACKS) {
      this.logger.warn(
        `[daily-mix] skip: only ${ranked.length} ranked (need ${DAILY_MIX_MIN_TRACKS})`,
      );
      return null;
    }

    const selectedById = new Map(
      candidates.map((candidate) => [candidate.resourceId, candidate]),
    );
    const selected = this.sequencePersonalizedTracks(
      ranked.slice(0, DAILY_MIX_TRACK_LIMIT).flatMap((item) => {
        const snapshot = selectedById.get(item.id);
        return snapshot ? [snapshot] : [];
      }),
    );
    if (selected.length < DAILY_MIX_MIN_TRACKS) return null;

    const playlistId = this.dailyMixId(userId);
    const artworkSource =
      selected.find((song) => song.artworkUrl) ?? selected[0];
    const artworkWidth = artworkSource.artworkWidth || 1000;
    const artworkHeight = artworkSource.artworkHeight || 1000;
    const artworkVariants = artworkVariantsFromAttributes(
      artworkSource.attributes,
    );
    const description = 'A fresh mix built from the music you love.';
    const playlistHref = `/playlist/daily-mix/${playlistId}`;
    await this.catalogService.upsertSystemPlaylist({
      playlistId,
      storefront: 'vn',
      name: 'Daily Mix',
      description,
      url: 'daily-mix',
      artworkUrl: artworkSource.artworkUrl,
      artworkBgColor: artworkSource.artworkBgColor,
      artworkVariantsJson: JSON.stringify(artworkVariants ?? {}),
      artworkWidth,
      artworkHeight,
      songIds: selected.map((song) => song.resourceId),
    });
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
        href: playlistHref,
        externalUrl: playlistHref,
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
          url: 'daily-mix',
        },
        relationships,
      },
      update: {
        name: 'Daily Mix',
        title: 'Daily Mix',
        curatorName: 'Musical',
        href: playlistHref,
        externalUrl: playlistHref,
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
          url: 'daily-mix',
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
      const variantSelected = this.sequencePersonalizedTracks(
        this.selectDiverseSystemVariant(
          ranked,
          selectedById,
          mixTracklists,
          mixIndex * DAILY_MIX_TRACK_LIMIT,
          DAILY_MIX_TRACK_LIMIT,
          DAILY_MIX_MIN_TRACKS,
        ),
      );
      if (variantSelected.length < DAILY_MIX_MIN_TRACKS) {
        this.logger.debug(
          `[daily-mix] variant ${mixIndex + 1} skipped: insufficient novel tracks`,
        );
        continue;
      }

      const variantTitle = `Daily Mix ${mixIndex + 1}`;
      const variantSlug = `daily-mix-${mixIndex + 1}`;
      const variantHref = `/playlist/${variantSlug}/${variantId}`;
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
      await this.catalogService.upsertSystemPlaylist({
        playlistId: variantId,
        storefront: 'vn',
        name: variantTitle,
        description,
        url: `daily-mix-${mixIndex + 1}`,
        artworkUrl: variantArtwork.artworkUrl,
        artworkBgColor: variantArtwork.artworkBgColor,
        artworkVariantsJson: JSON.stringify(variantArtworkVariants ?? {}),
        artworkWidth: variantWidth,
        artworkHeight: variantHeight,
        songIds: variantSelected.map((song) => song.resourceId),
      });
      const variantData = {
        name: variantTitle,
        title: variantTitle,
        curatorName: 'Musical',
        href: variantHref,
        externalUrl: variantHref,
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
          url: variantSlug,
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
      const existingMixes =
        await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'playlists',
            resourceId: {
              in: Array.from({ length: DAILY_MIX_LIMIT - 1 }, (_, index) =>
                this.dailyMixId(userId, index + 1),
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
      'Playlist Made for You',
      'MusicNotesHeroShelf',
      ['playlists'],
      playlistItems,
    );
  }

  private dailyMixId(userId: string, mixIndex = 0): string {
    return createHash('sha256')
      .update(`${userId}:${mixIndex}`)
      .digest('hex')
      .slice(0, 32);
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
    allowSparseCatalogFallback = false,
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

    if (selected.length < minimumTracks) {
      return allowSparseCatalogFallback
        ? orderedCandidates.slice(0, Math.min(limit, orderedCandidates.length))
        : [];
    }
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
    return novelCount >= requiredNovelCount || allowSparseCatalogFallback
      ? selected
      : [];
  }

  private async hasZeroArtworkDimensions(userId: string): Promise<boolean> {
    const mixId = this.dailyMixId(userId);
    const snapshot =
      await this.prisma.recommendationResourceSnapshot.findUnique({
        where: {
          resourceType_resourceId: {
            resourceType: 'playlists',
            resourceId: mixId,
          },
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
    const snapshots = await this.prisma.recommendationResourceSnapshot.findMany(
      {
        where: {
          OR: [
            {
              resourceType: 'playlists',
              resourceId: { startsWith: playlistPrefix },
            },
          ],
        },
        select: { attributes: true },
      },
    );

    return snapshots.some(
      (snapshot) => !artworkVariantsFromAttributes(snapshot.attributes),
    );
  }

  private async buildArtistStationsForYouSection(
    userId: string,
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    if (profile.listenedSongIds.size < MIN_LISTENED_SONGS) return null;

    const listenedArtistNames = profile.artists
      .filter((artist) => artist.weight > 0)
      .map((artist) => artist.name);
    if (!listenedArtistNames.length) return null;

    const artistSnapshots =
      await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'artists',
          name: { in: listenedArtistNames },
          artworkUrl: { not: '' },
        },
        select: { resourceId: true, name: true, genreNames: true },
        orderBy: { resourceId: 'asc' },
      });
    const artistsByName = new Map<
      string,
      { resourceId: string; genreNames: string[] }
    >();
    for (const artist of artistSnapshots) {
      if (!artistsByName.has(artist.name)) {
        artistsByName.set(artist.name, {
          resourceId: artist.resourceId,
          genreNames: artist.genreNames,
        });
      }
    }

    const familiarArtists = listenedArtistNames
      .map((name) => artistsByName.get(name))
      .filter(
        (
          artist,
        ): artist is { resourceId: string; genreNames: string[] } =>
          Boolean(artist),
      )
      .filter(
        (artist, index, artists) =>
          artists.findIndex(
            (candidate) => candidate.resourceId === artist.resourceId,
          ) === index,
      )
      .slice(0, FAMILIAR_ARTIST_STATION_LIMIT);
    if (!familiarArtists.length) return null;

    const listenedArtistIds = new Set(
      [...artistsByName.values()].map((artist) => artist.resourceId),
    );
    const familiarGenres = new Set(
      familiarArtists.flatMap((artist) => artist.genreNames),
    );
    const discoveryArtists = familiarGenres.size
      ? await this.prisma.recommendationResourceSnapshot
          .findMany({
            where: {
              resourceType: 'artists',
              artworkUrl: { not: '' },
              resourceId: { notIn: [...listenedArtistIds] },
              genreNames: { hasSome: [...familiarGenres] },
            },
            select: { resourceId: true, genreNames: true },
            take: 250,
          })
          .then((artists) =>
            artists
              .sort(
                (left, right) =>
                  this.sharedGenreCount(right.genreNames, familiarGenres) -
                    this.sharedGenreCount(left.genreNames, familiarGenres) ||
                  this.artistDiscoveryRank(userId, left.resourceId).localeCompare(
                    this.artistDiscoveryRank(userId, right.resourceId),
                  ),
              )
              .slice(0, DISCOVERY_ARTIST_STATION_LIMIT),
          )
      : [];
    const artistIds = [
      ...familiarArtists.map((artist) => artist.resourceId),
      ...discoveryArtists.map((artist) => artist.resourceId),
    ];
    const items = await this.ensureArtistStationItems(artistIds);
    if (!items.length) return null;

    return this.buildSection(
      'user-stations-for-you',
      'Stations for You',
      'MusicCoverShelf',
      ['stations'],
      items,
    );
  }

  private async ensureArtistStationItems(artistIds: string[]) {
    const existingStations =
      await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'stations',
          resourceId: {
            in: artistIds.map((artistId) =>
              this.artistStationService.canonicalStationId(artistId),
            ),
          },
          stationKind: 'artist-context',
        },
        select: { resourceId: true, attributes: true },
      });
    const existingStationsById = new Map(
      existingStations.map((station) => [station.resourceId, station]),
    );

    const items: Array<{ id: string; type: string }> = [];
    for (const artistId of artistIds) {
      const stationId = this.artistStationService.canonicalStationId(artistId);
      const existing = existingStationsById.get(stationId);
      if (existing && this.stationArtworkStateIsKnown(existing.attributes)) {
        items.push({ id: stationId, type: 'stations' });
        continue;
      }
      try {
        const station =
          await this.artistStationService.ensureCanonical(artistId);
        items.push({ id: station.stationId, type: 'stations' });
      } catch (error) {
        this.logger.warn(
          `[artist-stations] skip ${artistId}: ${error instanceof Error ? error.message : 'creation failed'}`,
        );
      }
    }
    return items;
  }

  private stationArtworkStateIsKnown(attributes: Prisma.JsonValue | null) {
    return isRecord(attributes) && typeof attributes.stationArtworkReady === 'boolean';
  }

  private sharedGenreCount(genres: string[], expected: Set<string>) {
    return genres.reduce(
      (count, genre) => count + Number(expected.has(genre)),
      0,
    );
  }

  private artistDiscoveryRank(userId: string, artistId: string) {
    return createHash('sha256')
      .update(`${userId}:${artistId}`)
      .digest('hex');
  }

  private async buildSystemStationsSection(
    userId: string,
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    const isGlobalMood = !userId;
    const stationSeeds = PRODUCTION_RECOMMENDATION_POLICY.moodStations;
    const stationArtworkByKey: Map<string, SystemStationArtwork> =
      await this.systemStationArtworkService.byStationKeys(
        stationSeeds.map((mood) => mood.key),
      );

    const songSelection = {
      resourceId: true,
      resourceType: true,
      artistName: true,
      genreNames: true,
      audioTraits: true,
      moodTags: true,
      releaseDate: true,
      releaseType: true,
      artworkUrl: true,
      artworkBgColor: true,
      artworkWidth: true,
      artworkHeight: true,
      attributes: true,
    } as const;
    const stationItems: Array<{ id: string; type: string }> = [];
    const stationTracklists: string[][] = [];

    for (const [index, mood] of stationSeeds.entries()) {
      const candidateWhere = {
        resourceType: 'songs',
        OR: [
          { audioTraits: { hasSome: [...mood.traits] } },
          { moodTags: { hasSome: [...mood.traits] } },
          ...(mood.allowGenreFallback
            ? [{ genreNames: { hasSome: [...mood.genres] } }]
            : []),
        ],
      };
      const genreCandidates =
        await this.prisma.recommendationResourceSnapshot.findMany({
          where: candidateWhere,
          orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
          take: 250,
          select: songSelection,
        });
      const ranked = await this.rankMoodStationTracks(
        userId,
        genreCandidates,
        profile,
        mood,
      );
      if (ranked.length < MOOD_STATION_MIN_TRACKS) {
        this.logger.warn(
          `[stations] seed[${index}] skip: only ${ranked.length} mood-qualified tracks (need ${MOOD_STATION_MIN_TRACKS})`,
        );
        continue;
      }
      const candidatesById = new Map(
        genreCandidates.map((candidate) => [candidate.resourceId, candidate]),
      );
      const selected = this.sequencePersonalizedTracks(
        this.selectDiverseSystemVariant(
          ranked,
          candidatesById,
          stationTracklists,
          index * STATION_TRACK_LIMIT,
          STATION_TRACK_LIMIT,
          MOOD_STATION_MIN_TRACKS,
          true,
        ),
      );
      if (selected.length < MOOD_STATION_MIN_TRACKS) {
        this.logger.debug(
          `[stations] seed[${index}] skipped: insufficient novel tracks`,
        );
        continue;
      }

      const stationId = this.stationId(userId, index);
      const artworkSource =
        selected.find((song) => song.artworkUrl) ?? selected[0];
      const configuredArtwork = stationArtworkByKey.get(mood.key);
      const { title, subtitle: description } = mood;
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
      const stationArtworkUrl =
        configuredArtwork?.url || artworkSource.artworkUrl;
      const stationArtworkWidth =
        configuredArtwork?.width || artworkSource.artworkWidth || 1000;
      const stationArtworkHeight =
        configuredArtwork?.height || artworkSource.artworkHeight || 1000;
      const stationArtworkBgColor =
        configuredArtwork?.bgColor || artworkSource.artworkBgColor;
      const stationArtworkVariants =
        configuredArtwork?.variants ??
        artworkVariantsFromAttributes(artworkSource.attributes);
      const stationData = {
        name: title,
        title,
        curatorName: 'Musical',
        href: '',
        externalUrl: '',
        artworkUrl: stationArtworkUrl,
        artworkBgColor: stationArtworkBgColor,
        artworkWidth: stationArtworkWidth,
        artworkHeight: stationArtworkHeight,
        trackCount: selected.length,
        shortDescription: description,
        standardDescription: description,
        stationKind: 'system-mood',
        mediaKind: 'audio',
        attributes: {
          name: title,
          kind: 'system-mood',
          mediaKind: 'audio',
          trackCount: selected.length,
          description: { short: description, standard: description },
          artwork: {
            url: stationArtworkUrl,
            width: stationArtworkWidth,
            height: stationArtworkHeight,
            bgColor: stationArtworkBgColor,
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
        } as Prisma.RecommendationResourceSnapshotUncheckedCreateInput,
        update:
          stationData as Prisma.RecommendationResourceSnapshotUncheckedUpdateInput,
      });
      stationItems.push({ id: stationId, type: 'stations' });
      stationTracklists.push(selected.map((song) => song.resourceId));
    }

    if (stationItems.length === 0) return null;

    return this.buildSection(
      isGlobalMood ? 'global-find-your-mood' : 'user-find-your-mood',
      'Find Your Mood',
      'MusicCoverShelf',
      ['stations'],
      stationItems,
    );
  }

  private buildMoodStationsSection(
    userId: string,
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    return this.buildSystemStationsSection(userId, profile);
  }

  private async buildGlobalMoodStationsSection(): Promise<PersonalRecommendationResource | null> {
    return this.buildSystemStationsSection('', this.emptyTasteProfile());
  }

  private emptyTasteProfile(): TasteProfile {
    return {
      genres: [],
      artists: [],
      avgCompletionRate: 0,
      totalListenTimeSec: 0,
      listenedSongIds: new Set(),
      listenedAlbumIds: new Set(),
      listenedAlbumNames: new Set(),
      hiddenResourceIds: new Map(),
    };
  }

  private stationId(userId: string, index: number): string {
    const digest = createHash('sha256').update(userId).digest('hex');
    return `mood-station-${digest.slice(0, 32)}-${index}`;
  }

  private async buildRecentlyPlayedSection(
    userId: string,
  ): Promise<PersonalRecommendationResource | null> {
    const recent = await this.listeningService.getRecentlyPlayed(userId, 50);
    // Recently Played is a direct record of a listener's choice. Unlike taste
    // modelling, it must retain the very first qualified station/album play.
    if (recent.length === 0) return null;

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
      }
    }

    const albumIds = [
      ...new Set(
        [...albumLastPlayed.values()]
          .map((entry) => entry.albumId)
          .filter(Boolean),
      ),
    ];
    const legacyAlbumNames = [
      ...new Set(
        [...albumLastPlayed.values()]
          .filter((entry) => !entry.albumId)
          .map((entry) => entry.albumName)
          .filter(Boolean),
      ),
    ];
    const playlistIds = [...playlistLastPlayed.keys()];
    const stationIds = [...stationLastPlayed.keys()];
    const albumSnapshots =
      albumIds.length || legacyAlbumNames.length
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
            stationKind: {
              in: ['system-mood', 'song-context', 'artist-context'],
            },
          },
          select: { resourceId: true },
        })
      : [];
    const albumIdToSnapshot = new Map(
      albumSnapshots.map((snapshot) => [snapshot.resourceId, snapshot]),
    );
    const albumNameToId = new Map(
      albumSnapshots.map((s) => [s.name, s.resourceId]),
    );
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
        items.push({
          id: albumId,
          type: 'albums',
          time: entry.lastPlayedAt.getTime(),
        });
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
   * Snapshots may outlive a catalog publish-state change. Resolve every catalog
   * reference immediately before writing Home so private/deleted resources
   * cannot invalidate an otherwise usable page.
   */
  private async excludeUnpublishedCatalogContent(
    sections: PersonalRecommendationResource[],
  ): Promise<PersonalRecommendationResource[]> {
    const refs = sections.flatMap((section) => [
      ...(section.relationships?.contents?.data ?? []),
      ...(section.relationships?.primaryContent?.data ?? []),
    ]);
    const catalogRefs = [
      ...new Map(
        refs
          .filter((ref) => this.catalogService.supports(ref.type))
          .map((ref) => [
            `${ref.type}:${ref.id}`,
            { id: ref.id, type: ref.type },
          ]),
      ).values(),
    ];
    if (catalogRefs.length === 0) return sections;

    const published = new Set(
      (await this.catalogService.resolve(catalogRefs)).map(
        (resource) => `${resource.type}:${resource.id}`,
      ),
    );
    const isPublished = (ref: { id: string; type: string }) =>
      !this.catalogService.supports(ref.type) ||
      published.has(`${ref.type}:${ref.id}`);

    return sections.flatMap((section) => {
      const contents = section.relationships?.contents;
      const primaryContent = section.relationships?.primaryContent;
      const filteredContents = contents?.data.filter(isPublished);
      const filteredPrimaryContent = primaryContent?.data.filter(isPublished);

      // A content shelf without cards has no useful UI and must not be stored.
      if (contents && filteredContents?.length === 0) return [];

      return [
        {
          ...section,
          relationships: {
            contents: contents
              ? { ...contents, data: filteredContents ?? [] }
              : { href: '', data: [] },
            primaryContent: primaryContent
              ? { ...primaryContent, data: filteredPrimaryContent ?? [] }
              : { href: '', data: [] },
          },
        },
      ];
    });
  }

  /**
   * Catalog resource IDs are opaque. Historical imports can therefore contain
   * two album IDs for one release. Keep the best edition and its first
   * occurrence across Home; later occurrences are removed. This is a
   * presentation safeguard — catalog authoring remains the primary guard.
   */
  private async deduplicateSemanticAlbumItems(
    sections: PersonalRecommendationResource[],
  ): Promise<PersonalRecommendationResource[]> {
    const albumIds = [
      ...new Set(
        sections.flatMap((section) =>
          (section.relationships?.contents?.data ?? [])
            .filter((item) => item.type === 'albums')
            .map((item) => item.id),
        ),
      ),
    ];
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
        releaseType: true,
        upc: true,
        canonicalReleaseId: true,
      },
    });
    const albumById = new Map(albums.map((album) => [album.resourceId, album]));
    const preferredAlbumIdByKey = new Map<string, string>();

    for (const album of albums) {
      const key = this.albumPresentationKey(album);
      const preferredAlbumId = preferredAlbumIdByKey.get(key);
      const preferredAlbum = preferredAlbumId
        ? albumById.get(preferredAlbumId)
        : undefined;

      if (
        !preferredAlbum ||
        album.trackCount > preferredAlbum.trackCount ||
        (album.trackCount === preferredAlbum.trackCount &&
          album.resourceId.localeCompare(preferredAlbum.resourceId) < 0)
      ) {
        preferredAlbumIdByKey.set(key, album.resourceId);
      }
    }

    const displayedAlbumKeys = new Set<string>();
    const displayedArtworkFamilyKeys = new Set<string>();
    return sections.flatMap((section) => {
      const contents = section.relationships?.contents;
      if (!contents) return [section];

      const deduped = contents.data.filter((item) => {
        if (item.type !== 'albums') return true;
        const album = albumById.get(item.id);
        const key = album ? this.albumPresentationKey(album) : `id:${item.id}`;
        if (album && preferredAlbumIdByKey.get(key) !== item.id) return false;
        if (displayedAlbumKeys.has(key)) return false;
        const artworkFamilyKey = album
          ? this.albumArtworkFamilyKey(album)
          : `id:${item.id}`;
        if (displayedArtworkFamilyKeys.has(artworkFamilyKey)) return false;
        displayedAlbumKeys.add(key);
        displayedArtworkFamilyKeys.add(artworkFamilyKey);
        return true;
      });

      // A shelf whose only cards were already used above is not useful and
      // would otherwise render as an empty section on Home.
      if (deduped.length === 0) return [];

      return [
        {
          ...section,
          relationships: {
            primaryContent: section.relationships?.primaryContent ?? {
              href: '',
              data: [],
            },
            contents: { ...contents, data: deduped },
          },
        },
      ];
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
    releaseType: string;
    upc: string;
    canonicalReleaseId: string;
  }): string {
    const canonicalReleaseId = this.normalizedRecommendationText(
      album.canonicalReleaseId,
    );
    if (canonicalReleaseId) return `canonical:${canonicalReleaseId}`;

    const upc = this.normalizedRecommendationText(album.upc);
    if (upc) return `upc:${upc}`;

    const name = this.normalizedRecommendationText(album.name || album.title);
    const artist = this.normalizedRecommendationText(
      album.artistName || album.subtitle,
    );
    if (!name || !artist || !album.releaseDate) {
      return `id:${album.resourceId}`;
    }

    // trackCount and releaseType are intentionally excluded: a deluxe/standard
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

  /**
   * Catalog imports can give a remix, a feature version and a single release
   * separate IDs and processed artwork URLs even when the visible cover is
   * identical. The asset IDs cannot identify that collision, so use the stable
   * listener-facing work and primary artist as an additional page-wide guard.
   */
  private albumArtworkFamilyKey(album: {
    resourceId: string;
    name: string;
    title: string;
    artistName: string;
    subtitle: string;
    releaseDate: string;
    trackCount: number;
    releaseType: string;
    upc: string;
    canonicalReleaseId: string;
  }): string {
    const baseTitle = (album.name || album.title)
      .replace(
        /\([^)]*\b(?:feat(?:uring)?|ft\.?|remix|version|ver\.?|lo-?fi|sped\s*up)\b[^)]*\)/gi,
        ' ',
      )
      .replace(/\b(?:feat(?:uring)?|ft\.?)\s+.+$/i, ' ')
      .replace(
        /\b(?:remix|version|ver\.?|radio\s+edit|acoustic|live|instrumental|lo-?fi|sped\s*up|speed\s*up)\b.*$/i,
        ' ',
      )
      .replace(/\b(?:single|album)\b/gi, ' ')
      .replace(/[-–—]+$/g, ' ');
    const title = this.normalizedRecommendationText(baseTitle);
    const artist = this.normalizedRecommendationText(
      album.artistName || album.subtitle,
    );

    return title && artist ? `${title}::${artist}` : `id:${album.resourceId}`;
  }

  private buildSection(
    sectionId: string,
    title: string,
    displayKind: string,
    resourceTypes: string[],
    items: Array<{ id: string; type: string }>,
    hasSeeAll = false,
  ): PersonalRecommendationResource {
    return {
      id: sectionId,
      type: 'personal-recommendation',
      href: `/me/recommendations/${sectionId}?name=listen-now`,
      attributes: {
        display: { kind: displayKind, decorations: [] },
        hasSeeAll,
        isGroupRecommendation: false,
        kind: 'music-recommendations',
        nextUpdateDate: '',
        resourceTypes,
        title: { stringForDisplay: title },
        titleWithoutName: { stringForDisplay: title },
        version: 1,
        presentationMode:
          RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_FIXED,
        sourceAlbumId: '',
        sourceAlbumName: '',
        sourceAlbumUrl: '',
        sourceAlbumArtworkUrl: '',
        sourceAlbumArtworkBgColor: '',
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
    const displayKind =
      shelf.id === 'user-top-picks' || shelf.id === 'global-top-picks'
        ? 'MusicNotesHeroShelf'
        : 'MusicCoverShelf';
    const section = this.buildSection(
      shelf.id,
      shelf.title,
      displayKind,
      ['albums'],
      shelf.items,
      shelf.hasMore,
    );
    return {
      ...section,
      attributes: {
        ...section.attributes!,
        kind: 'ranked-personalisation',
        version: shelf.modelVersion,
        sourceAlbumId: shelf.sourceAlbumId ?? '',
        sourceAlbumName: shelf.sourceAlbumName ?? '',
        sourceAlbumUrl: shelf.sourceAlbumUrl ?? '',
        sourceAlbumArtworkUrl: shelf.sourceAlbumArtworkUrl ?? '',
        sourceAlbumArtworkBgColor: shelf.sourceAlbumArtworkBgColor ?? '',
      },
    };
  }

  /**
   * Global is a composed editorial surface, not a flat ranked list. Keep the
   * first screen balanced between timely albums, a playlist destination and
   * the playable mood stations; remaining album shelves retain their ranked
   * order and fill the lower page.
   */
  private composeGlobalHomeSections(
    albumSections: PersonalRecommendationResource[],
    playlistSection: PersonalRecommendationResource | null,
    moodSection: PersonalRecommendationResource | null,
  ): PersonalRecommendationResource[] {
    const consumed = new Set<string>();
    const take = (id: string) => {
      const section = albumSections.find((candidate) => candidate.id === id);
      if (!section || consumed.has(section.id)) return undefined;
      consumed.add(section.id);
      return section;
    };
    const takeFirstGenre = () => {
      const section = albumSections.find(
        (candidate) =>
          candidate.id.startsWith('global-genre-') &&
          !consumed.has(candidate.id),
      );
      if (section) consumed.add(section.id);
      return section;
    };

    return [
      take('global-top-picks'),
      take('global-trending-now'),
      take('global-new-releases'),
      takeFirstGenre(),
      playlistSection ?? undefined,
      moodSection ?? undefined,
      take('global-popular-now'),
      take('global-discover'),
      ...albumSections.filter((section) => !consumed.has(section.id)),
    ]
      .filter((section): section is PersonalRecommendationResource =>
        Boolean(section),
      )
      .slice(0, GLOBAL_SHELF_LIMIT);
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
      if (items.length < HOME_SHELF_ITEM_MIN) {
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
