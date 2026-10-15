import { Injectable, Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { createHash, randomUUID } from 'node:crypto';
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
  SystemPlaylistArtworkService,
  type SystemPlaylistArtworkPair,
  type StoredSystemPlaylistArtworkPair,
} from '../recommendations/system-playlist-artwork.service';
import {
  GeneratedShelf,
  PERSONALIZATION_MODEL_VERSION,
  RecommendationEngineService,
} from './recommendation-engine.service';
import {
  PRODUCTION_RECOMMENDATION_POLICY,
  scoreGlobalTopPick,
} from './production-recommendation-policy';
import { developmentCacheDisabled } from '../common/configs/development-cache';
import { GenerationLeaseService } from './generation-lease.service';
import { audioFeaturesFromAttributes } from '../common/audio-features';
import { ArtistStationService } from '../stations/artist-station.service';
import { STATION_TRACK_SELECTION_VERSION } from '../stations/station-track-selection.service';
import {
  GENERATION_LEASE_LOST_MESSAGE,
  type GenerationLease,
} from './generation-lease.types';
import {
  SYSTEM_PLAYLIST_CURATOR_NAME,
  SYSTEM_PLAYLIST_DESCRIPTIONS,
} from '../recommendations/system-playlist-copy';
import { systemPlaylistArtistPreview } from '../recommendations/system-playlist-artist-preview';
import { systemPlaylistTrackIds } from '../recommendations/system-playlist-track-ids';
import { chillIntentScore, hasAudioAnalysis } from '../common/chill-intent';

const STALE_DURATION_MS = 6 * 60 * 60 * 1000;
const MAX_PER_ARTIST = 3;
const SYSTEM_PLAYLIST_MAX_PER_ARTIST = 2;
const NEW_MUSIC_MAX_TRACKS_PER_RELEASE = 1;
const SYSTEM_PLAYLIST_SELECTION_VERSION = 2;
const SYSTEM_PLAYLIST_TRACK_LIMIT = 25;
const SYSTEM_PLAYLIST_MIN_TRACKS = 5;
const HEAVY_ROTATION_MIN_TRACKS = 10;
const HEAVY_ROTATION_WINDOW_MS = 30 * 86_400_000;
const HEAVY_ROTATION_DECAY_DAYS = 14;
// Fetch enough scored songs to absorb catalog removals and the per-artist cap
// without expanding a user's entire listening history into a Home request.
const HEAVY_ROTATION_CANDIDATE_LIMIT = 250;
// Used only until an admin configures the two real artwork assets for a fixed
// system playlist. It keeps the catalog playlists publishable on a new
// environment without invoking the unrelated Hero-blur artwork flow.
const SYSTEM_PLAYLIST_ARTWORK_URL = '/assets/artwork/1x1.gif';
const STATION_TRACK_LIMIT = 80;
const PERSONAL_STATION_MIN_TRACKS = 5;
// Small local catalogs should still expose a truthful mood station once it has
// enough variety to avoid immediately repeating a track.
const MOOD_STATION_MIN_TRACKS = 5;
const FAMILIAR_ARTIST_STATION_LIMIT = 5;
const DISCOVERY_ARTIST_STATION_LIMIT = 5;
const SYSTEM_VARIANT_MAX_OVERLAP_RATIO = 0.6;
const SYSTEM_VARIANT_MIN_NOVEL_RATIO = 0.25;
const MIN_LISTENED_SONGS = 3;
const HOME_SHELF_ITEM_MIN = 10;
const HOME_SHELF_ITEM_LIMIT = 40;
const HOME_HERO_SHELF_ITEM_LIMIT = 10;
const TOP_PICK_NEW_RELEASE_ALBUM_LIMIT = 3;
const LISTEN_AGAIN_ALBUM_CANDIDATE_LIMIT = 20;
const TOP_PICK_FRESHNESS_WINDOW_MS = 30 * 86_400_000;
const TOP_PICK_REVISIT_WINDOW_MS = 30 * 86_400_000;
const TOP_PICK_RELEVANCE_WEIGHT = 70;
const TOP_PICK_FRESHNESS_WEIGHT = 20;
const TOP_PICK_REVISIT_WEIGHT = 10;
// Eight complete shelves are a rich Global page. Requiring twelve caused a
// valid regenerated page to be rejected when sparse catalog facets were
// correctly removed instead of rendering six-card genre rails.
const GLOBAL_PUBLISH_MIN_SHELVES = 8;
const GLOBAL_SHELF_LIMIT = 15;

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
  albumKey?: string;
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
  attributes?: unknown;
  relationships?: unknown;
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

const VIETNAM_WEEKDAY = {
  SUNDAY: 0,
  MONDAY: 1,
  FRIDAY: 5,
} as const;

type FixedSystemPlaylist = {
  key: 'get-up' | 'chill' | 'new-music' | 'heavy-rotation';
  title: string;
  description: string;
  artworkBgColor: string;
  refreshWeekday: (typeof VIETNAM_WEEKDAY)[keyof typeof VIETNAM_WEEKDAY];
  minimumTracks?: number;
  personalizedOnly?: boolean;
};

const FIXED_SYSTEM_PLAYLISTS: readonly FixedSystemPlaylist[] = [
  {
    key: 'get-up',
    title: 'Get Up',
    description: SYSTEM_PLAYLIST_DESCRIPTIONS['get-up'],
    artworkBgColor: 'd41414',
    refreshWeekday: VIETNAM_WEEKDAY.MONDAY,
  },
  {
    key: 'chill',
    title: 'Chill',
    description: SYSTEM_PLAYLIST_DESCRIPTIONS.chill,
    artworkBgColor: '22788a',
    refreshWeekday: VIETNAM_WEEKDAY.SUNDAY,
  },
  {
    key: 'new-music',
    title: 'New Music',
    description: SYSTEM_PLAYLIST_DESCRIPTIONS['new-music'],
    artworkBgColor: 'e87c91',
    refreshWeekday: VIETNAM_WEEKDAY.FRIDAY,
  },
  {
    key: 'heavy-rotation',
    title: 'Heavy Rotation',
    description: SYSTEM_PLAYLIST_DESCRIPTIONS['heavy-rotation'],
    artworkBgColor: '5c3fba',
    // The record is published globally so it has one stable URL, but its
    // content is only surfaced once the current listener has ten qualifiers.
    refreshWeekday: VIETNAM_WEEKDAY.MONDAY,
    minimumTracks: HEAVY_ROTATION_MIN_TRACKS,
    personalizedOnly: true,
  },
];

type SystemPlaylistBuildResult = {
  topPick: { id: string; type: 'playlists'; refreshedAt?: Date };
  playlistShelf: PersonalRecommendationResource;
};

type ArtistStationBuildResult = {
  items: Array<{ id: string; type: 'stations' }>;
  topPickStations: Array<{ id: string; type: 'stations' }>;
};

type RankedTopPickItem = {
  id: string;
  type: 'albums' | 'playlists' | 'stations';
  relevance: number;
  freshnessAt?: Date;
  revisitAt?: Date;
  score?: number;
};

type GlobalTopPickItem = {
  id: string;
  type: 'albums' | 'playlists' | 'stations';
  refreshedAt?: Date;
  score?: number;
};

const SYSTEM_PLAYLIST_TIMEZONE = 'Asia/Ho_Chi_Minh';
const SYSTEM_STATION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

function systemPlaylistScheduledRefresh(
  definition: FixedSystemPlaylist,
  now = new Date(),
): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SYSTEM_PLAYLIST_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    parts.find((part) => part.type === 'weekday')?.value ?? '',
  );
  const daysSinceRefresh = (weekday - definition.refreshWeekday + 7) % 7;
  // Vietnam has no daylight-saving adjustment. Local midnight is UTC-7.
  return new Date(
    Date.UTC(
      value('year'),
      value('month') - 1,
      value('day') - daysSinceRefresh,
    ) -
      7 * 3_600_000,
  );
}

function latestSystemPlaylistDefinition(now = new Date()): FixedSystemPlaylist {
  return FIXED_SYSTEM_PLAYLISTS.reduce((latest, definition) =>
    systemPlaylistScheduledRefresh(definition, now) >
    systemPlaylistScheduledRefresh(latest, now)
      ? definition
      : latest,
  );
}

function nextSystemPlaylistRefresh(now = new Date()): Date {
  return FIXED_SYSTEM_PLAYLISTS.map((definition) => {
    const scheduled = systemPlaylistScheduledRefresh(definition, now);
    return scheduled.getTime() > now.getTime()
      ? scheduled
      : new Date(scheduled.getTime() + 7 * 86_400_000);
  }).reduce((next, scheduled) => (scheduled < next ? scheduled : next));
}

function vietnamHourStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SYSTEM_PLAYLIST_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(
    Date.UTC(value('year'), value('month') - 1, value('day'), value('hour')) -
      7 * 3_600_000,
  );
}

function systemStationScheduledRefresh(index: number, now = new Date()): Date {
  const hourStart = vietnamHourStart(now);
  const cycleSize = PRODUCTION_RECOMMENDATION_POLICY.moodStations.length;
  const currentHour = Math.floor(
    hourStart.getTime() / SYSTEM_STATION_REFRESH_INTERVAL_MS,
  );
  const hoursSinceStationRefresh =
    (currentHour - index + cycleSize) % cycleSize;
  return new Date(
    hourStart.getTime() -
      hoursSinceStationRefresh * SYSTEM_STATION_REFRESH_INTERVAL_MS,
  );
}

function nextSystemStationRefresh(now = new Date()): Date {
  const hourStart = vietnamHourStart(now);
  return new Date(hourStart.getTime() + SYSTEM_STATION_REFRESH_INTERVAL_MS);
}

function homeStaleAfter(now = new Date()): Date {
  const routineStaleAt = new Date(now.getTime() + STALE_DURATION_MS);
  const playlistRefreshAt = nextSystemPlaylistRefresh(now);
  const stationRefreshAt = nextSystemStationRefresh(now);
  return [routineStaleAt, playlistRefreshAt, stationRefreshAt].reduce(
    (earliest, candidate) => (candidate < earliest ? candidate : earliest),
  );
}

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
    private readonly systemPlaylistArtworkService?: SystemPlaylistArtworkService,
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

    if (!isStale) return null;

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
    const globalTopPickShelf = globalShelves.find(
      (shelf) => shelf.id === 'global-top-picks',
    );
    const albumSections = globalShelves.map((shelf) =>
      this.buildEngineSection(shelf),
    );

    const [moodStations, systemPlaylists] = await Promise.all([
      this.buildGlobalMoodStationsSection(),
      this.buildFixedSystemPlaylists(''),
    ]);
    const stationTopPick = await this.latestSystemStationTopPick(
      '',
      moodStations,
    );
    const rankedTopPickItems = await this.rankGlobalTopPickItems({
      albums: globalTopPickShelf?.items ?? [],
      albumScores: globalTopPickShelf?.topPickScores ?? {},
      playlist: systemPlaylists?.topPick,
      station: stationTopPick,
    });
    const topPicks = this.composeGlobalTopPicks(
      albumSections.find((section) => section.id === 'global-top-picks'),
      rankedTopPickItems,
    );
    const sections = this.composeGlobalHomeSections(
      topPicks
        ? albumSections.map((section) =>
            section.id === topPicks.id ? topPicks : section,
          )
        : albumSections,
      {
        playlists: systemPlaylists?.playlistShelf ?? null,
        moodStations,
      },
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

    // Global Home keeps its visible preview release-unique. Detail overflow is
    // allowed to overlap another shelf and is loaded only after the listener
    // selects that shelf.
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
      { lease, staleAfter: homeStaleAfter() },
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
    // A Favourite (or comparable explicit positive preference) is a valid
    // cold-start signal even before the listener has three qualified plays.
    // Keep this aligned with `hasListeningHistory`, otherwise lazy generation
    // is permitted but this method silently returns the Global page.
    const hasSufficientSignals =
      profile.listenedSongIds.size >=
        PRODUCTION_RECOMMENDATION_POLICY.minimumHistoryEvents ||
      (await this.listeningService.hasListeningHistory(
        userId,
        PRODUCTION_RECOMMENDATION_POLICY.minimumHistoryEvents,
      ));
    if (!hasSufficientSignals) {
      // Cold-start users get the stable global editorial page. We do not
      // invent a fake personal profile or label random results as "For You".
      return this.recommendationsService.getHomeRecommendations({
        userId: '',
        name,
        locale,
        timezone,
        platform,
      });
    }
    await this.ensureFixedSystemPlaylistsPublished();
    const recentlyPlayed = await this.buildRecentlyPlayedSection(userId);
    const systemPlaylists = await this.buildFixedSystemPlaylists(
      userId,
      profile,
    );
    const personalizedStationItems = await this.buildPersonalizedStationItems(
      userId,
      profile,
    );
    const artistStations = await this.buildArtistStationsForYouSection(
      userId,
      profile,
    );
    const artistStationItems = artistStations?.items ?? [];
    const stations = this.buildStationsForYouSection([
      ...personalizedStationItems,
      ...artistStationItems,
    ]);
    const moodStations = await this.buildMoodStationsSection(userId, profile);
    const shelves = await this.recommendationEngine.generateUserShelves(
      userId,
      profile,
    );
    const shelfById = new Map(
      shelves.map((shelf) => [shelf.id, this.buildEngineSection(shelf)]),
    );
    // Top Picks deliberately reuses the already-ranked New Releases shelf.
    // This makes its album portion both fresh and deterministic, rather than
    // creating a second, slightly different freshness ranking.
    const topPickNewReleaseAlbums = (
      shelfById.get('user-new-releases')?.relationships?.contents?.data ?? []
    )
      .filter((item) => item.type === 'albums')
      .slice(0, TOP_PICK_NEW_RELEASE_ALBUM_LIMIT)
      .map((item) => ({ id: item.id, type: 'albums' as const }));
    const [stationTopPick, listenAgainAlbum] = await Promise.all([
      this.latestSystemStationTopPick(userId, moodStations),
      this.mostListenedAlbumTopPick(userId, profile),
    ]);
    const rankedTopPickItems = await this.rankUserTopPickItems({
      systemPlaylist: systemPlaylists?.topPick,
      moodStation: stationTopPick,
      personalizedStations: personalizedStationItems,
      artistStations: artistStations?.topPickStations ?? [],
      listenAgainAlbum,
      newReleaseAlbums: topPickNewReleaseAlbums.filter(
        (album) => album.id !== listenAgainAlbum?.id,
      ),
    });
    const userTopPicks = this.composeRankedTopPicks(
      shelfById.get('user-top-picks'),
      rankedTopPickItems,
      listenAgainAlbum?.id,
    );
    if (userTopPicks) shelfById.set(userTopPicks.id, userTopPicks);
    const systemSections = new Map<
      string,
      PersonalRecommendationResource | null
    >([
      ['recently-played', recentlyPlayed],
      ['made-for-you', systemPlaylists?.playlistShelf ?? null],
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

    // Do not publish a sparse page under the user's name. The personal Home
    // contract is 12–22 meaningful shelves; catalog constraints can make a
    // listener eligible for personalisation while still leaving too few
    // distinct, publishable collections. In that case Global Home is the
    // honest product fallback.
    if (
      publishableSections.length <
      PRODUCTION_RECOMMENDATION_POLICY.minUserHomeShelves
    ) {
      this.logger.warn(
        `[user-home] skip: only ${publishableSections.length} publishable shelves ` +
          `(need ${PRODUCTION_RECOMMENDATION_POLICY.minUserHomeShelves})`,
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
      { lease, staleAfter: homeStaleAfter() },
    );

    return result;
  }

  // ─── Scoring engine ───

  private scoreSong(song: SnapshotRow, profile: TasteProfile): number {
    let score = 0;

    // Genre affinity: sum of matching genre weights, capped.
    let genreScore = 0;
    for (const genre of song.genreNames) {
      const gw = profile.genres.find((g) => g.name === genre)?.weight ?? 0;
      genreScore += gw;
    }
    score += Math.min(genreScore, 1) * 0.32;

    // Artist affinity: known artist = proportional, unknown = discovery bonus.
    const artistWeight =
      profile.artists.find((a) => a.name === song.artistName)?.weight ?? 0;
    if (artistWeight > 0) {
      score += artistWeight * 0.16;
    } else {
      score += 0.08;
    }

    // AI-derived sound affinity. These fields were calculated at upload time
    // and are optional, so imported or not-yet-analysed songs remain eligible.
    const audio = audioFeaturesFromAttributes(song.attributes);
    if (audio.tags.length && profile.audioTags.length) {
      const preferredTags = new Map(
        profile.audioTags.map((tag) => [tag.name, tag.weight]),
      );
      const tagScore = audio.tags.reduce(
        (best, tag) => Math.max(best, preferredTags.get(tag) ?? 0),
        0,
      );
      score += tagScore * 0.1;
    }
    if (audio.bpm !== undefined && profile.preferredBpm !== null) {
      const tolerance = profile.bpmTolerance ?? 20;
      score +=
        Math.max(
          0,
          1 - Math.abs(audio.bpm - profile.preferredBpm) / tolerance,
        ) * 0.06;
    }
    if (audio.energy !== undefined && profile.preferredEnergy !== null) {
      const tolerance = profile.energyTolerance ?? 0.2;
      score +=
        Math.max(
          0,
          1 - Math.abs(audio.energy - profile.preferredEnergy) / tolerance,
        ) * 0.06;
    }

    // Freshness bonus: unheard songs get full bonus.
    if (!profile.listenedSongIds.has(song.resourceId)) {
      score += 0.24;
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
      this.personalizedPopularityScores(candidateIds),
      this.personalizedCollaborativeScores(
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
            PRODUCTION_RECOMMENDATION_POLICY.personalizedPlaylistWeights.taste +
          (popularity.get(candidate.resourceId) ?? 0) *
            PRODUCTION_RECOMMENDATION_POLICY.personalizedPlaylistWeights
              .popularity +
          (collaborative.get(candidate.resourceId) ?? 0) *
            PRODUCTION_RECOMMENDATION_POLICY.personalizedPlaylistWeights
              .collaborative,
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
      SYSTEM_PLAYLIST_MAX_PER_ARTIST,
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
      ? ['moods', 'moodTags', 'tags', 'audioTags'].flatMap((key) => {
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

  private async personalizedPopularityScores(songIds: string[]) {
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

  private async personalizedCollaborativeScores(
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
      const albumId = track.attributes.albumId;
      if (typeof albumId === 'string' && albumId.trim()) {
        return `albumId:${albumId.trim().toLowerCase()}`;
      }
    }
    return `song:${track.resourceId}`;
  }

  // ─── User sections ───

  private async buildFixedSystemPlaylists(
    userId: string,
    profile?: TasteProfile,
    forceRefresh = false,
  ): Promise<SystemPlaylistBuildResult | null> {
    const now = new Date();
    const refreshStates =
      await this.prisma.systemPlaylistRefreshState.findMany();
    const refreshStateByKey = new Map(
      refreshStates.map((state) => [state.playlistKey, state]),
    );
    const playlistArtwork = this.systemPlaylistArtworkService
      ? await this.systemPlaylistArtworkService.byKeys(
          FIXED_SYSTEM_PLAYLISTS.map(({ key }) => key),
        )
      : new Map<string, StoredSystemPlaylistArtworkPair>();
    const userTrackCacheByKey = new Map<
      string,
      { trackCount: number; updatedAt: Date }
    >();
    if (userId) {
      const cachedTracks = await this.prisma.userSystemPlaylistTrack.findMany({
        where: { userId },
        select: { playlistKey: true, updatedAt: true },
      });
      for (const track of cachedTracks) {
        const current = userTrackCacheByKey.get(track.playlistKey) ?? {
          trackCount: 0,
          updatedAt: track.updatedAt,
        };
        current.trackCount += 1;
        if (track.updatedAt > current.updatedAt)
          current.updatedAt = track.updatedAt;
        userTrackCacheByKey.set(track.playlistKey, current);
      }
    }
    const heavyRotationCache = userTrackCacheByKey.get('heavy-rotation');
    const heavyRotationHasNewActivity =
      Boolean(userId && heavyRotationCache) &&
      (await this.hasHeavyRotationActivitySince(
        userId,
        heavyRotationCache!.updatedAt,
      ));
    const definitionsToRefresh = FIXED_SYSTEM_PLAYLISTS.filter((definition) => {
      const state = refreshStateByKey.get(definition.key);
      if (userId) {
        const userCache = userTrackCacheByKey.get(definition.key);
        if (definition.key === 'heavy-rotation') {
          return !userCache || heavyRotationHasNewActivity;
        }
        return (
          !state ||
          !userCache ||
          userCache.trackCount < SYSTEM_PLAYLIST_TRACK_LIMIT ||
          userCache.updatedAt < state.refreshedAt
        );
      }
      const artworkUpdatedAt = playlistArtwork.get(definition.key)?.updatedAt;
      return (
        forceRefresh ||
        !state ||
        state.selectionVersion < SYSTEM_PLAYLIST_SELECTION_VERSION ||
        state.refreshedAt < systemPlaylistScheduledRefresh(definition, now) ||
        (artworkUpdatedAt !== undefined && artworkUpdatedAt > state.refreshedAt)
      );
    });
    const playlistIds = new Map(
      await Promise.all(
        FIXED_SYSTEM_PLAYLISTS.map(
          async (definition) =>
            [
              definition.key,
              await this.fixedSystemPlaylistId(definition.key),
            ] as const,
        ),
      ),
    );
    const songSelection = {
      resourceId: true,
      resourceType: true,
      artistName: true,
      genreNames: true,
      audioTraits: true,
      moodTags: true,
      attributes: true,
      relationships: true,
      releaseDate: true,
      releaseType: true,
    } as const;
    const listenedSongIds = profile ? [...profile.listenedSongIds] : [];
    let candidates: SnapshotRow[] = [];
    if (definitionsToRefresh.length) {
      candidates = await this.prisma.recommendationResourceSnapshot.findMany({
        where: { resourceType: 'songs' },
        orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
        take: 500,
        select: songSelection,
      });
      if (listenedSongIds.length) {
        const unlistenedCandidates = candidates.filter(
          (candidate) => !listenedSongIds.includes(candidate.resourceId),
        );
        if (unlistenedCandidates.length >= SYSTEM_PLAYLIST_TRACK_LIMIT) {
          candidates = unlistenedCandidates;
        }
      }
    }
    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.resourceId, candidate]),
    );
    if (!userId && definitionsToRefresh.length === 0) {
      await this.syncSystemPlaylistArtistPreviews(playlistIds);
    }
    const selectedAcrossPlaylists = new Set<string>();
    const visiblePersonalizedPlaylistKeys = new Set(
      [...userTrackCacheByKey].flatMap(([key, cache]) =>
        cache.trackCount >= HEAVY_ROTATION_MIN_TRACKS && key === 'heavy-rotation'
          ? [key]
          : [],
      ),
    );
    for (const definition of FIXED_SYSTEM_PLAYLISTS) {
      const playlistId = playlistIds.get(definition.key)!;
      if (!definitionsToRefresh.includes(definition)) continue;
      let ranked: ScoredItem[];
      let candidatesForSelection = candidatesById;
      if (definition.key === 'heavy-rotation' && userId) {
        const heavyRotation = await this.rankHeavyRotationTracks(userId, now);
        ranked = heavyRotation.ranked;
        candidatesForSelection = new Map([
          ...candidatesById,
          ...heavyRotation.candidates.map((candidate) => [
            candidate.resourceId,
            candidate,
          ] as const),
        ]);
      } else {
        ranked = await this.rankFixedSystemPlaylistTracks(
          userId,
          candidates,
          profile,
          definition,
        );
      }
      const selectedCandidates = ranked
        .filter(
          (item) =>
            definition.key === 'heavy-rotation' ||
            !selectedAcrossPlaylists.has(item.id),
        )
        .slice(0, SYSTEM_PLAYLIST_TRACK_LIMIT)
        .flatMap((item) => {
          const candidate = candidatesForSelection.get(item.id);
          return candidate ? [candidate] : [];
        });
      // Heavy Rotation deliberately preserves score order. The other system
      // playlists are sequenced for variety after their intent ranking.
      const selected =
        definition.key === 'heavy-rotation'
          ? selectedCandidates
          : this.sequencePersonalizedTracks(selectedCandidates);
      const minimumTracks =
        definition.minimumTracks ?? SYSTEM_PLAYLIST_MIN_TRACKS;
      if (selected.length < minimumTracks) {
        if (userId && definition.personalizedOnly) {
          await this.prisma.$transaction([
            this.prisma.userSystemPlaylistTrack.deleteMany({
              where: { userId, playlistKey: definition.key },
            }),
            this.prisma.userSystemPlaylistMetadata.deleteMany({
              where: { userId, playlistKey: definition.key },
            }),
          ]);
          continue;
        }
        this.logger.warn(
          `[system-playlists] ${definition.key} skipped: only ${selected.length} qualified tracks (need ${minimumTracks})`,
        );
        return null;
      }
      if (definition.key !== 'heavy-rotation') {
        selected.forEach((track) =>
          selectedAcrossPlaylists.add(track.resourceId),
        );
      }
      if (userId && definition.personalizedOnly) {
        visiblePersonalizedPlaylistKeys.add(definition.key);
      }
      // Product playlists are global catalog entries. A listener gets a
      // private track selection for one of those playlists, never a private
      // Playlist record or URL.
      const configuredArtwork = playlistArtwork.get(definition.key);
      const cover = configuredArtwork?.cover;
      const homeCard = configuredArtwork?.homeCard;
      const artistPreview = systemPlaylistArtistPreview(
        selected.map((track) => track.artistName),
      );
      if (userId) {
        // This is a recommendation cache, not a playlist. It is intentionally
        // keyed by user and product intent so no user-owned Playlist rows are
        // created in the Song database.
        await this.prisma.$transaction([
          this.prisma.userSystemPlaylistTrack.deleteMany({
            where: { userId, playlistKey: definition.key },
          }),
          this.prisma.userSystemPlaylistTrack.createMany({
            data: selected.map((track, sortOrder) => ({
              userId,
              playlistKey: definition.key,
              songId: track.resourceId,
              sortOrder,
            })),
          }),
          this.prisma.userSystemPlaylistMetadata.upsert({
            where: {
              userId_playlistKey: { userId, playlistKey: definition.key },
            },
            create: {
              userId,
              playlistKey: definition.key,
              shortDescription: artistPreview,
              standardDescription: artistPreview,
            },
            update: {
              shortDescription: artistPreview,
              standardDescription: artistPreview,
            },
          }),
        ]);
      } else {
        // The catalog has these physical playlists. Only Global
        // generation owns their default track list and shared metadata.
        await this.catalogService.upsertSystemPlaylist({
          playlistId,
          storefront: 'vn',
          name: definition.title,
          description: definition.description,
          url: definition.key,
          artworkUrl: cover?.url || SYSTEM_PLAYLIST_ARTWORK_URL,
          artworkBgColor: cover?.bgColor || definition.artworkBgColor,
          artworkVariantsJson: cover
            ? JSON.stringify({
                ...cover.variants,
                homeCard,
                systemPlaylistMedia: {
                  detailSquareVideo: configuredArtwork?.detailSquareVideo,
                  detailMobileVideo: configuredArtwork?.detailMobileVideo,
                  homeHeroVideo: configuredArtwork?.homeHeroVideo,
                },
              })
            : '',
          artworkWidth: cover?.width || 1,
          artworkHeight: cover?.height || 1,
          songIds: selected.map((track) => track.resourceId),
        });
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
            ...this.fixedSystemPlaylistSnapshot(
              definition,
              playlistId,
              selected.map((track) => track.resourceId),
              configuredArtwork,
              artistPreview,
            ),
          },
          update: this.fixedSystemPlaylistSnapshot(
            definition,
            playlistId,
            selected.map((track) => track.resourceId),
            configuredArtwork,
            artistPreview,
          ),
        });
      }
      if (!userId) {
        await this.prisma.systemPlaylistRefreshState.upsert({
          where: { playlistKey: definition.key },
          create: {
            playlistKey: definition.key,
            refreshedAt: now,
            selectionVersion: SYSTEM_PLAYLIST_SELECTION_VERSION,
          },
          update: {
            refreshedAt: now,
            selectionVersion: SYSTEM_PLAYLIST_SELECTION_VERSION,
          },
        });
      }
    }
    const topPickDefinition = latestSystemPlaylistDefinition(now);
    const playlistItems = FIXED_SYSTEM_PLAYLISTS.filter(
      (definition) =>
        !definition.personalizedOnly ||
        (Boolean(userId) && visiblePersonalizedPlaylistKeys.has(definition.key)),
    ).map((definition) => ({
      id: playlistIds.get(definition.key)!,
      type: 'playlists' as const,
    }));
    if (!userId) await this.repairSystemPlaylistUserCaches();
    return {
      topPick: {
        id: playlistIds.get(topPickDefinition.key)!,
        type: 'playlists',
        refreshedAt: refreshStateByKey.get(topPickDefinition.key)?.refreshedAt,
      },
      playlistShelf: this.buildSection(
        userId
          ? 'user-playlists-made-for-you'
          : 'global-playlists-made-for-you',
        'Playlists Made for You',
        'MusicNotesHeroShelf',
        ['playlists'],
        playlistItems,
      ),
    };
  }

  /**
   * User pages reference global catalog playlists. Generation may
   * run before a Global Home refresh after a deployment, so verify their
   * catalog presence here instead of silently dropping the shelf later in
   * `excludeUnpublishedCatalogContent`.
   */
  private async ensureFixedSystemPlaylistsPublished(): Promise<void> {
    const playlistIds = await Promise.all(
      FIXED_SYSTEM_PLAYLISTS.map((definition) =>
        this.fixedSystemPlaylistId(definition.key),
      ),
    );
    const initiallyPublished = await this.catalogService.resolve(
      playlistIds.map((id) => ({ id, type: 'playlists' })),
    );
    const globalPlaylists = await this.buildFixedSystemPlaylists(
      '',
      undefined,
      initiallyPublished.length !== FIXED_SYSTEM_PLAYLISTS.length,
    );
    if (!globalPlaylists) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: 'Fixed system playlists could not be published',
      });
    }
    if (initiallyPublished.length === FIXED_SYSTEM_PLAYLISTS.length) return;
    const published = await this.catalogService.resolve(
      playlistIds.map((id) => ({ id, type: 'playlists' })),
    );
    if (published.length !== FIXED_SYSTEM_PLAYLISTS.length) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: 'Fixed system playlists could not be published',
      });
    }
  }

  private async fixedSystemPlaylistId(
    key: FixedSystemPlaylist['key'],
  ): Promise<string> {
    const scopeKey = 'GLOBAL';
    const playlist = await this.prisma.generatedSystemPlaylist.upsert({
      where: { scopeKey_playlistKey: { scopeKey, playlistKey: key } },
      create: { scopeKey, playlistKey: key, playlistId: randomUUID() },
      update: {},
      select: { playlistId: true },
    });
    return playlist.playlistId;
  }

  private fixedSystemPlaylistSnapshot(
    definition: FixedSystemPlaylist,
    playlistId: string,
    songIds: string[],
    configuredArtwork: SystemPlaylistArtworkPair | undefined,
    artistPreview: string,
  ) {
    const href = `/playlist/${definition.key}/${playlistId}`;
    const attributes = {
      name: definition.title,
      curatorName: SYSTEM_PLAYLIST_CURATOR_NAME,
      description: {
        short: artistPreview,
        standard: artistPreview,
      },
      artwork: {
        ...(configuredArtwork?.cover || {
          url: SYSTEM_PLAYLIST_ARTWORK_URL,
          width: 1,
          height: 1,
          bgColor: definition.artworkBgColor,
        }),
        ...(configuredArtwork?.homeCard
          ? {
              variants: {
                ...configuredArtwork.cover.variants,
                homeCard: configuredArtwork.homeCard,
                systemPlaylistMedia: {
                  detailSquareVideo: configuredArtwork.detailSquareVideo,
                  detailMobileVideo: configuredArtwork.detailMobileVideo,
                  homeHeroVideo: configuredArtwork.homeHeroVideo,
                },
              },
            }
          : {}),
        alt: definition.title,
      },
      ...(configuredArtwork?.homeHeroVideo
        ? {
            editorialVideo: {
              motionTallVideo3x4: configuredArtwork.homeHeroVideo,
            },
          }
        : {}),
      playlistType: 'system-personalized',
      trackCount: songIds.length,
      url: definition.key,
    };
    return {
      name: definition.title,
      title: definition.title,
      curatorName: SYSTEM_PLAYLIST_CURATOR_NAME,
      href,
      externalUrl: href,
      artworkUrl: configuredArtwork?.cover?.url || SYSTEM_PLAYLIST_ARTWORK_URL,
      artworkBgColor:
        configuredArtwork?.cover?.bgColor || definition.artworkBgColor,
      artworkWidth: configuredArtwork?.cover?.width || 1,
      artworkHeight: configuredArtwork?.cover?.height || 1,
      shortDescription: artistPreview,
      standardDescription: artistPreview,
      // Home cards use the artists selected for their current track list.
      // Clear imported editorial copy so it cannot compete with that source.
      editorialNotesName: '',
      editorialNotesShort: '',
      editorialNotes: '',
      plainEditorialNotes: Prisma.DbNull,
      playlistType: 'system-personalized',
      trackCount: songIds.length,
      attributes: attributes as Prisma.InputJsonObject,
      relationships: {
        tracks: {
          href: `/me/recommendations/system-playlists/${playlistId}/tracks`,
          data: songIds.map((songId) => ({
            id: songId,
            type: 'songs',
            href: `/catalog/vn/songs/${songId}`,
          })),
        },
      } as Prisma.InputJsonObject,
    };
  }

  private async syncSystemPlaylistArtistPreviews(
    playlistIds: Map<FixedSystemPlaylist['key'], string>,
  ): Promise<void> {
    const playlists = await this.prisma.recommendationResourceSnapshot.findMany(
      {
        where: {
          resourceType: 'playlists',
          resourceId: { in: [...playlistIds.values()] },
        },
        select: {
          id: true,
          resourceId: true,
          shortDescription: true,
          standardDescription: true,
          editorialNotesName: true,
          editorialNotesShort: true,
          editorialNotes: true,
          plainEditorialNotes: true,
          attributes: true,
          relationships: true,
        },
      },
    );
    const trackIdsByPlaylist = new Map(
      playlists.map((playlist) => [
        playlist.resourceId,
        systemPlaylistTrackIds(playlist.relationships),
      ]),
    );
    const trackIds = [...new Set([...trackIdsByPlaylist.values()].flat())];
    if (!trackIds.length) return;

    const tracks = await this.prisma.recommendationResourceSnapshot.findMany({
      where: { resourceType: 'songs', resourceId: { in: trackIds } },
      select: { resourceId: true, artistName: true },
    });
    const artistByTrackId = new Map(
      tracks.map((track) => [track.resourceId, track.artistName]),
    );
    const definitionByPlaylistId = new Map(
      FIXED_SYSTEM_PLAYLISTS.map((definition) => [
        playlistIds.get(definition.key)!,
        definition,
      ]),
    );
    await Promise.all(
      playlists.flatMap((playlist) => {
        const definition = definitionByPlaylistId.get(playlist.resourceId);
        if (!definition) return [];
        const artistPreview = systemPlaylistArtistPreview(
          (trackIdsByPlaylist.get(playlist.resourceId) ?? []).map(
            (id) => artistByTrackId.get(id) ?? '',
          ),
        );
        const hasLegacyEditorialCopy =
          Boolean(
            playlist.editorialNotesName ||
            playlist.editorialNotesShort ||
            playlist.editorialNotes,
          ) || playlist.plainEditorialNotes !== null;
        if (
          playlist.shortDescription === artistPreview &&
          playlist.standardDescription === artistPreview &&
          !hasLegacyEditorialCopy
        ) {
          return [];
        }
        const attributes = isRecord(playlist.attributes)
          ? {
              ...playlist.attributes,
              description: {
                short: artistPreview,
                standard: artistPreview,
              },
            }
          : undefined;
        return [
          this.prisma.recommendationResourceSnapshot.update({
            where: { id: playlist.id },
            data: {
              shortDescription: artistPreview,
              standardDescription: artistPreview,
              editorialNotesName: '',
              editorialNotesShort: '',
              editorialNotes: '',
              plainEditorialNotes: Prisma.DbNull,
              ...(attributes
                ? { attributes: attributes }
                : {}),
            },
          }),
        ];
      }),
    );
  }

  /**
   * A system playlist refresh is global, but its track order is personalised.
   * Repair only caches that are missing, short, or older than the shared
   * playlist revision so every existing listener sees a complete list.
   */
  private async repairSystemPlaylistUserCaches(): Promise<void> {
    const [refreshStates, cachedTracks] = await Promise.all([
      this.prisma.systemPlaylistRefreshState.findMany(),
      this.prisma.userSystemPlaylistTrack.groupBy({
        by: ['userId', 'playlistKey'],
        _count: { songId: true },
        _max: { updatedAt: true },
      }),
    ]);
    const refreshStateByKey = new Map(
      refreshStates.map((state) => [state.playlistKey, state.refreshedAt]),
    );
    const cacheByUser = new Map<
      string,
      Map<string, { trackCount: number; updatedAt: Date | null }>
    >();
    for (const cache of cachedTracks) {
      const playlists =
        cacheByUser.get(cache.userId) ??
        new Map<string, { trackCount: number; updatedAt: Date | null }>();
      playlists.set(cache.playlistKey, {
        trackCount: cache._count.songId,
        updatedAt: cache._max.updatedAt,
      });
      cacheByUser.set(cache.userId, playlists);
    }
    const userIdsToRepair = [...cacheByUser].flatMap(([userId, playlists]) =>
      FIXED_SYSTEM_PLAYLISTS.some((definition) => {
        const cache = playlists.get(definition.key);
        const refreshedAt = refreshStateByKey.get(definition.key);
        return (
          !cache ||
          cache.trackCount !== SYSTEM_PLAYLIST_TRACK_LIMIT ||
          !cache.updatedAt ||
          !refreshedAt ||
          cache.updatedAt < refreshedAt
        );
      })
        ? [userId]
        : [],
    );
    for (const userId of userIdsToRepair) {
      const profile = await this.listeningService.getUserTasteProfile(userId);
      const repaired = await this.buildFixedSystemPlaylists(userId, profile);
      if (!repaired) {
        this.logger.warn(
          `[system-playlists] could not repair incomplete cache for user ${userId}`,
        );
      }
    }
  }

  private async rankFixedSystemPlaylistTracks(
    userId: string,
    candidates: SnapshotRow[],
    profile: TasteProfile | undefined,
    definition: FixedSystemPlaylist,
  ): Promise<ScoredItem[]> {
    const personalized = profile
      ? await this.rankPersonalizedTracks(
          userId,
          candidates,
          profile,
          candidates.length,
          SYSTEM_PLAYLIST_MAX_PER_ARTIST,
        )
      : [];
    const personalScores = new Map(
      personalized.map((item) => [item.id, item.score]),
    );
    const artistCounts = new Map<string, number>();
    const releaseCounts = new Map<string, number>();
    return candidates
      .filter(
        (candidate) =>
          !profile ||
          !this.isHidden(profile, candidate.resourceType, candidate.resourceId),
      )
      .map((candidate) => ({
        id: candidate.resourceId,
        type: candidate.resourceType,
        artistName: candidate.artistName,
        albumKey: this.systemPlaylistAlbumKey(candidate),
        score:
          this.fixedSystemPlaylistIntentScore(candidate, definition) * 0.58 +
          (profile
            ? (personalScores.get(candidate.resourceId) ?? 0) * 0.42
            : this.globalSystemPlaylistScore(candidate, definition) * 0.42),
      }))
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.id.localeCompare(right.id),
      )
      .filter((item) => {
        const artistCount = artistCounts.get(item.artistName) ?? 0;
        if (artistCount >= SYSTEM_PLAYLIST_MAX_PER_ARTIST) return false;
        if (definition.key === 'new-music') {
          const releaseCount = releaseCounts.get(item.albumKey) ?? 0;
          if (releaseCount >= NEW_MUSIC_MAX_TRACKS_PER_RELEASE) return false;
          releaseCounts.set(item.albumKey, releaseCount + 1);
        }
        artistCounts.set(item.artistName, artistCount + 1);
        return true;
      });
  }

  private async hasHeavyRotationActivitySince(
    userId: string,
    cachedAt: Date,
  ): Promise<boolean> {
    return Boolean(
      await this.prisma.listeningEvent.findFirst({
        where: {
          userId,
          eventType: 'PLAY_START',
          createdAt: { gt: cachedAt },
        },
        select: { id: true },
      }),
    );
  }

  /** Rank plays from the last 30 days, with each older play decaying smoothly. */
  private async rankHeavyRotationTracks(
    userId: string,
    now: Date,
  ): Promise<{ ranked: ScoredItem[]; candidates: SnapshotRow[] }> {
    const events = await this.prisma.listeningEvent.findMany({
      where: {
        userId,
        eventType: 'PLAY_START',
        createdAt: { gte: new Date(now.getTime() - HEAVY_ROTATION_WINDOW_MS) },
      },
      select: { songId: true, createdAt: true },
    });
    const scores = new Map<string, number>();
    for (const event of events) {
      const ageDays = Math.max(0, now.getTime() - event.createdAt.getTime()) / 86_400_000;
      scores.set(
        event.songId,
        (scores.get(event.songId) ?? 0) + Math.exp(-ageDays / HEAVY_ROTATION_DECAY_DAYS),
      );
    }
    const scoredSongIds = [...scores]
      .sort(
        ([leftId, leftScore], [rightId, rightScore]) =>
          rightScore - leftScore || leftId.localeCompare(rightId),
      )
      .slice(0, HEAVY_ROTATION_CANDIDATE_LIMIT)
      .map(([songId]) => songId);
    if (scoredSongIds.length === 0) return { ranked: [], candidates: [] };

    // Heavy Rotation intentionally does not use the discovery candidate pool:
    // that pool removes listened songs, while this playlist is defined by them.
    const candidates = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'songs',
        resourceId: { in: scoredSongIds },
      },
      select: {
        resourceId: true,
        resourceType: true,
        artistName: true,
        genreNames: true,
        audioTraits: true,
        moodTags: true,
        attributes: true,
        relationships: true,
        releaseDate: true,
        releaseType: true,
      },
    });
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.resourceId, candidate]),
    );
    const artistCounts = new Map<string, number>();
    const ranked = scoredSongIds
      .flatMap((songId) => {
        const candidate = candidateById.get(songId);
        const score = scores.get(songId);
        return candidate && score !== undefined
          ? [
              {
                id: songId,
                type: candidate.resourceType,
                artistName: candidate.artistName,
                score,
              },
            ]
          : [];
      })
      .filter((item) => {
        const count = artistCounts.get(item.artistName) ?? 0;
        if (count >= SYSTEM_PLAYLIST_MAX_PER_ARTIST) return false;
        artistCounts.set(item.artistName, count + 1);
        return true;
      });
    return { ranked, candidates };
  }

  private systemPlaylistAlbumKey(track: SnapshotRow): string {
    if (isRecord(track.attributes)) {
      const albumId = track.attributes.albumId;
      if (typeof albumId === 'string' && albumId.trim()) {
        return `album:${albumId.trim().toLowerCase()}`;
      }
    }
    if (isRecord(track.relationships) && isRecord(track.relationships.albums)) {
      const albums = track.relationships.albums.data;
      if (Array.isArray(albums) && isRecord(albums[0])) {
        const albumId = albums[0].id;
        if (typeof albumId === 'string' && albumId.trim()) {
          return `album:${albumId.trim().toLowerCase()}`;
        }
      }
    }
    return `song:${track.resourceId}`;
  }

  private fixedSystemPlaylistIntentScore(
    candidate: SnapshotRow,
    definition: FixedSystemPlaylist,
  ): number {
    if (definition.key === 'new-music') return 1;
    const audio = audioFeaturesFromAttributes(candidate.attributes);
    const tags = [
      ...audio.tags,
      ...(candidate.audioTraits ?? []),
      ...(candidate.moodTags ?? []),
    ].map((tag) => tag.trim().toLowerCase());
    const hasTag = (terms: string[]) =>
      tags.some((tag) => terms.some((term) => tag.includes(term)));
    if (definition.key === 'get-up') {
      return Math.max(
        hasTag(['energetic', 'upbeat', 'party', 'workout', 'dance']) ? 1 : 0,
        audio.energy ?? 0,
      );
    }
    return chillIntentScore({
      tags,
      energy: hasAudioAnalysis(candidate.attributes) ? audio.energy : undefined,
    });
  }

  private globalSystemPlaylistScore(
    candidate: SnapshotRow,
    definition: FixedSystemPlaylist,
  ): number {
    if (definition.key !== 'new-music') return 1;
    const releasedAt = Date.parse(candidate.releaseDate);
    return Number.isFinite(releasedAt)
      ? Math.max(0, 1 - (Date.now() - releasedAt) / (180 * 86_400_000))
      : 0;
  }

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

  private async buildArtistStationsForYouSection(
    userId: string,
    profile: TasteProfile,
  ): Promise<ArtistStationBuildResult | null> {
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
        (artist): artist is { resourceId: string; genreNames: string[] } =>
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
                  this.artistDiscoveryRank(
                    userId,
                    left.resourceId,
                  ).localeCompare(
                    this.artistDiscoveryRank(userId, right.resourceId),
                  ),
              )
              .slice(0, DISCOVERY_ARTIST_STATION_LIMIT),
          )
      : [];
    const [familiarItems, discoveryItems] = await Promise.all([
      this.ensureArtistStationItems(
        familiarArtists.map((artist) => artist.resourceId),
      ),
      this.ensureArtistStationItems(
        discoveryArtists.map((artist) => artist.resourceId),
      ),
    ]);
    const items = [...familiarItems, ...discoveryItems];
    if (!items.length) return null;

    return {
      items,
      topPickStations: [
        ...familiarItems.slice(0, 1),
        ...discoveryItems.slice(0, 1),
      ].map((station) => ({ id: station.id, type: 'stations' })),
    };
  }

  private buildStationsForYouSection(
    items: Array<{ id: string; type: 'stations' }>,
  ): PersonalRecommendationResource | null {
    if (!items.length) return null;
    return this.buildSection(
      'user-stations-for-you',
      'Stations for You',
      'MusicCoverShelf',
      ['stations'],
      items,
    );
  }

  /**
   * Builds the two reusable Station products that lead the listener's station
   * shelf. Their artwork is a shared editorial template, while IDs, tracks,
   * and relationships are private to the current listener.
   */
  private async buildPersonalizedStationItems(
    userId: string,
    profile: TasteProfile,
  ): Promise<Array<{ id: string; type: 'stations' }>> {
    const definitions = PRODUCTION_RECOMMENDATION_POLICY.personalizedStations;
    const artworkByKey = await this.systemStationArtworkService.byStationKeys(
      definitions.map((station) => station.key),
    );
    const candidates =
      await this.prisma.recommendationResourceSnapshot.findMany({
        where: { resourceType: 'songs' },
        orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
        take: 500,
        select: {
          resourceId: true,
          resourceType: true,
          artistName: true,
          genreNames: true,
          audioTraits: true,
          moodTags: true,
          attributes: true,
          releaseDate: true,
          releaseType: true,
          artworkUrl: true,
          artworkBgColor: true,
          artworkWidth: true,
          artworkHeight: true,
        },
      });
    if (candidates.length < PERSONAL_STATION_MIN_TRACKS) return [];

    const ranked = await this.rankPersonalizedTracks(
      userId,
      candidates,
      profile,
      candidates.length,
      SYSTEM_PLAYLIST_MAX_PER_ARTIST,
    );
    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.resourceId, candidate]),
    );
    const knownArtists = new Set(
      profile.artists
        .filter((artist) => artist.weight > 0)
        .map((artist) => artist.name),
    );
    const familiar = ranked.flatMap((item) => {
      const candidate = candidatesById.get(item.id);
      return candidate ? [candidate] : [];
    });
    const discovery = familiar.filter(
      (candidate) =>
        !profile.listenedSongIds.has(candidate.resourceId) &&
        !knownArtists.has(candidate.artistName),
    );
    const selections = new Map<string, typeof candidates>([
      ['your-station', familiar],
      ['discovery-station', discovery],
    ]);
    const items: Array<{ id: string; type: 'stations' }> = [];

    for (const definition of definitions) {
      const selected = this.sequencePersonalizedTracks(
        (selections.get(definition.key) ?? []).slice(0, STATION_TRACK_LIMIT),
      );
      if (selected.length < PERSONAL_STATION_MIN_TRACKS) {
        this.logger.warn(
          `[personal-stations] ${definition.key} skipped: only ${selected.length} qualified tracks (need ${PERSONAL_STATION_MIN_TRACKS})`,
        );
        continue;
      }

      const stationId = this.personalStationId(userId, definition.key);
      const configuredArtwork = artworkByKey.get(definition.key);
      const artworkSource =
        selected.find((song) => song.artworkUrl) ?? selected[0];
      const artworkUrl =
        configuredArtwork?.cover.url || artworkSource.artworkUrl;
      const artworkWidth =
        configuredArtwork?.cover.width || artworkSource.artworkWidth || 1000;
      const artworkHeight =
        configuredArtwork?.cover.height || artworkSource.artworkHeight || 1000;
      const artworkBgColor =
        configuredArtwork?.cover.bgColor || artworkSource.artworkBgColor;
      const artworkVariants = configuredArtwork
        ? {
            ...configuredArtwork.cover.variants,
            ...(configuredArtwork.heroVideo
              ? {
                  systemStationMedia: {
                    heroVideo: configuredArtwork.heroVideo,
                  },
                }
              : {}),
          }
        : artworkVariantsFromAttributes(artworkSource.attributes);
      const stationData = {
        name: definition.title,
        title: definition.title,
        curatorName: 'Musical',
        href: '',
        externalUrl: '',
        artworkUrl,
        artworkBgColor,
        artworkWidth,
        artworkHeight,
        trackCount: selected.length,
        shortDescription: '',
        standardDescription: '',
        stationKind:
          definition.key === 'your-station'
            ? 'personalized-user'
            : 'personalized-discovery',
        mediaKind: 'audio',
        attributes: {
          name: definition.title,
          kind:
            definition.key === 'your-station'
              ? 'personalized-user'
              : 'personalized-discovery',
          mediaKind: 'audio',
          trackCount: selected.length,
          artwork: {
            url: artworkUrl,
            width: artworkWidth,
            height: artworkHeight,
            bgColor: artworkBgColor,
            alt: definition.title,
            ...(artworkVariants ? { variants: artworkVariants } : {}),
          },
          url: '',
        },
        relationships: {
          tracks: {
            href: `/me/system-stations/${stationId}/tracks`,
            data: selected.map((song) => ({
              id: song.resourceId,
              type: 'songs',
              href: `/catalog/vn/songs/${song.resourceId}`,
            })),
          },
        },
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
      items.push({ id: stationId, type: 'stations' });
    }
    return items;
  }

  private async ensureArtistStationItems(
    artistIds: string[],
  ): Promise<Array<{ id: string; type: 'stations' }>> {
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
        select: { resourceId: true, attributes: true, raw: true },
      });
    const existingStationsById = new Map(
      existingStations.map((station) => [station.resourceId, station]),
    );

    const items: Array<{ id: string; type: 'stations' }> = [];
    for (const artistId of artistIds) {
      const stationId = this.artistStationService.canonicalStationId(artistId);
      const existing = existingStationsById.get(stationId);
      if (existing && this.artistStationIsCurrent(existing)) {
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
    return (
      isRecord(attributes) &&
      typeof attributes.stationArtworkReady === 'boolean'
    );
  }

  private artistStationIsCurrent(station: {
    attributes: Prisma.JsonValue | null;
    raw: Prisma.JsonValue | null;
  }) {
    const artistStation = isRecord(station.raw)
      ? station.raw.artistStation
      : undefined;
    return (
      this.stationArtworkStateIsKnown(station.attributes) &&
      isRecord(station.attributes) &&
      typeof station.attributes.primaryArtistName === 'string' &&
      station.attributes.primaryArtistName.length > 0 &&
      typeof station.attributes.trackCount === 'number' &&
      station.attributes.trackCount > 0 &&
      isRecord(artistStation) &&
      artistStation.trackSelectionVersion === STATION_TRACK_SELECTION_VERSION
    );
  }

  private sharedGenreCount(genres: string[], expected: Set<string>) {
    return genres.reduce(
      (count, genre) => count + Number(expected.has(genre)),
      0,
    );
  }

  private artistDiscoveryRank(userId: string, artistId: string) {
    return createHash('sha256').update(`${userId}:${artistId}`).digest('hex');
  }

  private async buildSystemStationsSection(
    userId: string,
    profile: TasteProfile,
  ): Promise<PersonalRecommendationResource | null> {
    const isGlobalMood = !userId;
    const stationSeeds = PRODUCTION_RECOMMENDATION_POLICY.moodStations;
    const now = new Date();
    const stationIds = stationSeeds.map((_, index) =>
      this.stationId(userId, index),
    );
    const stationArtworkByKey: Map<string, SystemStationArtwork> =
      await this.systemStationArtworkService.byStationKeys(
        stationSeeds.map((mood) => mood.key),
      );
    const existingStations =
      await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'stations',
          resourceId: { in: stationIds },
        },
        select: { resourceId: true, updatedAt: true },
      });
    const existingStationById = new Map(
      existingStations.map((station) => [station.resourceId, station]),
    );
    const refreshStates = isGlobalMood
      ? await this.prisma.systemStationRefreshState.findMany()
      : [];
    const refreshStateByKey = new Map(
      refreshStates.map((state) => [state.stationKey, state]),
    );

    const songSelection = {
      resourceId: true,
      resourceType: true,
      artistName: true,
      genreNames: true,
      audioTraits: true,
      moodTags: true,
      attributes: true,
      releaseDate: true,
      releaseType: true,
      artworkUrl: true,
      artworkBgColor: true,
      artworkWidth: true,
      artworkHeight: true,
    } as const;
    const stationItems: Array<{ id: string; type: string }> = [];
    const stationRefreshAtById = new Map<string, Date>();
    const stationTracklists: string[][] = [];

    for (const [index, mood] of stationSeeds.entries()) {
      const stationId = stationIds[index];
      const scheduledRefresh = systemStationScheduledRefresh(index, now);
      const existingStation = existingStationById.get(stationId);
      const refreshState = refreshStateByKey.get(mood.key);
      const configuredArtwork = stationArtworkByKey.get(mood.key);
      const artworkChanged =
        !!configuredArtwork?.updatedAt &&
        !!existingStation &&
        configuredArtwork.updatedAt > existingStation.updatedAt;
      if (
        existingStation &&
        !artworkChanged &&
        existingStation.updatedAt >= scheduledRefresh &&
        (!isGlobalMood ||
          (refreshState && refreshState.refreshedAt >= scheduledRefresh))
      ) {
        stationItems.push({ id: stationId, type: 'stations' });
        stationRefreshAtById.set(
          stationId,
          isGlobalMood
            ? (refreshState?.refreshedAt ?? scheduledRefresh)
            : scheduledRefresh,
        );
        continue;
      }
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
      const [curatedCandidates, recentCandidates] = await Promise.all([
        this.prisma.recommendationResourceSnapshot.findMany({
          where: candidateWhere,
          orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
          take: 250,
          select: songSelection,
        }),
        // AI tags are kept in the catalog attribute payload. Pull a bounded
        // recent window as well, otherwise a song that has only AI tags (and
        // no hand-authored audioTraits/moodTags) can never reach the semantic
        // mood matcher below.
        this.prisma.recommendationResourceSnapshot.findMany({
          where: { resourceType: 'songs' },
          orderBy: [{ releaseDate: 'desc' }, { resourceId: 'asc' }],
          take: 250,
          select: songSelection,
        }),
      ]);
      const genreCandidates = [
        ...new Map(
          [...curatedCandidates, ...recentCandidates].map((candidate) => [
            candidate.resourceId,
            candidate,
          ]),
        ).values(),
      ];
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

      const artworkSource =
        selected.find((song) => song.artworkUrl) ?? selected[0];
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
        configuredArtwork?.cover.url || artworkSource.artworkUrl;
      const stationArtworkWidth =
        configuredArtwork?.cover.width || artworkSource.artworkWidth || 1000;
      const stationArtworkHeight =
        configuredArtwork?.cover.height || artworkSource.artworkHeight || 1000;
      const stationArtworkBgColor =
        configuredArtwork?.cover.bgColor || artworkSource.artworkBgColor;
      const stationArtworkVariants = configuredArtwork
        ? {
            ...configuredArtwork.cover.variants,
            ...(configuredArtwork.heroVideo
              ? {
                  systemStationMedia: {
                    heroVideo: configuredArtwork.heroVideo,
                  },
                }
              : {}),
          }
        : artworkVariantsFromAttributes(artworkSource.attributes);
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
      if (isGlobalMood) {
        await this.prisma.systemStationRefreshState.upsert({
          where: { stationKey: mood.key },
          create: { stationKey: mood.key, refreshedAt: scheduledRefresh },
          update: { refreshedAt: scheduledRefresh },
        });
      }
      stationItems.push({ id: stationId, type: 'stations' });
      stationRefreshAtById.set(stationId, scheduledRefresh);
      stationTracklists.push(selected.map((song) => song.resourceId));
    }

    if (stationItems.length === 0) return null;

    // Stations refresh one at a time on an hourly cycle. Surface the station
    // with the newest tracklist first instead of pinning the seed order.
    stationItems.sort(
      (left, right) =>
        (stationRefreshAtById.get(right.id)?.getTime() ?? 0) -
        (stationRefreshAtById.get(left.id)?.getTime() ?? 0),
    );

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
      audioTags: [],
      preferredBpm: null,
      bpmTolerance: null,
      preferredEnergy: null,
      energyTolerance: null,
      avgCompletionRate: 0,
      totalListenTimeSec: 0,
      listenedSongIds: new Set(),
      audioSeedSongIds: new Set(),
      listenedAlbumIds: new Set(),
      listenedAlbumNames: new Set(),
      hiddenResourceIds: new Map(),
    };
  }

  private stationId(userId: string, index: number): string {
    const digest = createHash('sha256').update(userId).digest('hex');
    return `mood-station-${digest.slice(0, 32)}-${index}`;
  }

  private personalStationId(userId: string, key: string): string {
    const digest = createHash('sha256').update(userId).digest('hex');
    return `${key}-${digest.slice(0, 32)}`;
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
      { albumId: string; lastPlayedAt: Date }
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

      if (entry.albumId) {
        const existing = albumLastPlayed.get(entry.albumId);
        if (!existing || entry.lastPlayedAt > existing.lastPlayedAt) {
          albumLastPlayed.set(entry.albumId, {
            albumId: entry.albumId,
            lastPlayedAt: entry.lastPlayedAt,
          });
        }
      }
    }

    const albumIds = [...albumLastPlayed.keys()];
    const playlistIds = [...playlistLastPlayed.keys()];
    const stationIds = [...stationLastPlayed.keys()];
    const albumSnapshots = albumIds.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'albums',
            resourceId: { in: albumIds },
          },
          select: { resourceId: true },
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
    const albumSnapshotIds = new Set(
      albumSnapshots.map((snapshot) => snapshot.resourceId),
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
      if (albumSnapshotIds.has(entry.albumId)) {
        items.push({
          id: entry.albumId,
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

    // Multiple events can resolve to the same catalog resource, so dedupe
    // after sorting to retain the most recently played item.
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

  /**
   * A Listen Again card represents the album with the highest cumulative play
   * count across its tracks. Catalog resolution keeps an old listening record
   * from surfacing an album that has since been unpublished.
   */
  private async mostListenedAlbumTopPick(
    userId: string,
    profile: TasteProfile,
  ): Promise<{ id: string; type: 'albums'; lastPlayedAt: Date } | undefined> {
    const albumGroups = await this.prisma.userListeningStats.groupBy({
      by: ['albumId'],
      where: {
        userId,
        albumId: { not: '' },
        playCount: { gt: 0 },
      },
      _sum: { playCount: true },
      _max: { lastPlayedAt: true },
      orderBy: [{ _sum: { playCount: 'desc' } }, { albumId: 'asc' }],
      take: LISTEN_AGAIN_ALBUM_CANDIDATE_LIMIT,
    });
    const candidateIds = albumGroups
      .map((group) => group.albumId)
      .filter((albumId) => !this.isHidden(profile, 'albums', albumId));
    if (candidateIds.length === 0) return undefined;

    const publishedAlbumIds = new Set(
      (
        await this.catalogService.resolve(
          candidateIds.map((id) => ({ id, type: 'albums' })),
        )
      )
        .filter((resource) => resource.type === 'albums')
        .map((resource) => resource.id),
    );
    const group = albumGroups.find((candidate) =>
      publishedAlbumIds.has(candidate.albumId),
    );
    if (!group?.albumId || !group._max.lastPlayedAt) return undefined;
    return {
      id: group.albumId,
      type: 'albums',
      lastPlayedAt: group._max.lastPlayedAt,
    };
  }

  /**
   * Top Picks is one ranked portfolio, not a fixed sequence of card types.
   * The input candidates are already individually eligible for their source
   * shelf; this method only decides their relative order on Home.
   */
  private async rankUserTopPickItems(input: {
    systemPlaylist:
      { id: string; type: 'playlists'; refreshedAt?: Date } | undefined;
    moodStation:
      { id: string; type: 'stations'; refreshedAt?: Date } | undefined;
    personalizedStations: Array<{ id: string; type: 'stations' }>;
    artistStations: Array<{ id: string; type: 'stations' }>;
    listenAgainAlbum:
      { id: string; type: 'albums'; lastPlayedAt: Date } | undefined;
    newReleaseAlbums: Array<{ id: string; type: 'albums' }>;
  }): Promise<
    Array<{ id: string; type: 'albums' | 'playlists' | 'stations' }>
  > {
    const now = Date.now();
    const snapshotIds = [...input.newReleaseAlbums.map((item) => item.id)];
    type TopPickSnapshot = {
      resourceId: string;
      releaseDate: string;
    };
    const snapshotPromise: Promise<TopPickSnapshot[]> = snapshotIds.length
      ? this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'albums',
            resourceId: { in: snapshotIds },
          },
          select: { resourceId: true, releaseDate: true },
        })
      : Promise.resolve([]);
    const [snapshots, playlistStates] = await Promise.all([
      snapshotPromise,
      this.prisma.systemPlaylistRefreshState.findMany({
        orderBy: { refreshedAt: 'desc' },
        take: 1,
        select: { refreshedAt: true },
      }),
    ]);
    const snapshotById = new Map(
      snapshots.map((snapshot) => [snapshot.resourceId, snapshot]),
    );
    const freshness = (at: Date | undefined) =>
      at
        ? Math.max(
            0,
            1 - Math.max(0, now - at.getTime()) / TOP_PICK_FRESHNESS_WINDOW_MS,
          )
        : 0;
    const revisit = (at: Date | undefined) =>
      at
        ? Math.min(
            1,
            Math.max(0, now - at.getTime()) / TOP_PICK_REVISIT_WINDOW_MS,
          )
        : 0;
    const releaseDate = (value: string | undefined) => {
      const date = value ? new Date(value) : undefined;
      return date && !Number.isNaN(date.getTime()) ? date : undefined;
    };
    const candidates: RankedTopPickItem[] = [];
    const add = (candidate: RankedTopPickItem) => candidates.push(candidate);

    if (input.systemPlaylist) {
      add({
        ...input.systemPlaylist,
        relevance: 0.75,
        freshnessAt:
          input.systemPlaylist.refreshedAt ?? playlistStates[0]?.refreshedAt,
      });
    }
    if (input.moodStation) {
      add({
        ...input.moodStation,
        relevance: 0.62,
        freshnessAt: input.moodStation.refreshedAt,
      });
    }
    input.personalizedStations.forEach((station, index) => {
      add({
        ...station,
        relevance: index === 0 ? 0.9 : 0.58,
      });
    });
    input.artistStations.forEach((station, index) => {
      add({
        ...station,
        relevance: index === 0 ? 0.82 : 0.52,
      });
    });
    if (input.listenAgainAlbum) {
      add({
        id: input.listenAgainAlbum.id,
        type: 'albums',
        relevance: 0.95,
        revisitAt: input.listenAgainAlbum.lastPlayedAt,
      });
    }
    for (const album of input.newReleaseAlbums) {
      add({
        ...album,
        relevance: 0.78,
        freshnessAt: releaseDate(snapshotById.get(album.id)?.releaseDate),
      });
    }

    const unique = new Map<string, RankedTopPickItem>();
    for (const candidate of candidates) {
      const key = `${candidate.type}:${candidate.id}`;
      const score =
        candidate.relevance * TOP_PICK_RELEVANCE_WEIGHT +
        freshness(candidate.freshnessAt) * TOP_PICK_FRESHNESS_WEIGHT +
        revisit(candidate.revisitAt) * TOP_PICK_REVISIT_WEIGHT;
      const existing = unique.get(key);
      if (!existing || score > (existing.score ?? 0)) {
        unique.set(key, { ...candidate, score });
      }
    }
    return [...unique.values()]
      .sort(
        (left, right) =>
          (right.score ?? 0) - (left.score ?? 0) ||
          left.type.localeCompare(right.type) ||
          left.id.localeCompare(right.id),
      )
      .map(({ id, type }) => ({ id, type }));
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
    const previewAlbumKeys = new Set<string>();
    const previewArtworkFamilyKeys = new Set<string>();
    return sections.flatMap((section) => {
      const contents = section.relationships?.contents;
      if (!contents) return [section];

      const preferredAlbumIdByKey = new Map<string, string>();
      for (const item of contents.data) {
        if (item.type !== 'albums') continue;
        const album = albumById.get(item.id);
        if (!album) continue;
        const key = this.albumPresentationKey(album);
        const preferredId = preferredAlbumIdByKey.get(key);
        const preferred = preferredId ? albumById.get(preferredId) : undefined;
        if (
          !preferred ||
          album.trackCount > preferred.trackCount ||
          (album.trackCount === preferred.trackCount &&
            album.resourceId.localeCompare(preferred.resourceId) < 0)
        ) {
          preferredAlbumIdByKey.set(key, album.resourceId);
        }
      }

      const isAlbumShelf =
        section.attributes?.resourceTypes?.includes('albums');
      const isPersonalTopPicks = section.id === 'user-top-picks';
      const isChronologicalNewRelease = section.id === 'user-new-releases';
      const isMixedGlobalTopPicks = section.id === 'global-top-picks';
      // Album rails render a fixed Home preview before their detail view is
      // opened. System playlist/station shelves retain their own card counts.
      // `HOME_SHELF_ITEM_LIMIT` (40) is the detail-page payload cap, not the
      // Home preview size; using it here incorrectly discarded valid Global
      // shelves that had exactly their required twelve preview albums.
      const previewLimit =
        section.attributes?.display?.kind === 'MusicNotesHeroShelf'
          ? HOME_HERO_SHELF_ITEM_LIMIT
          : isAlbumShelf
            ? PRODUCTION_RECOMMENDATION_POLICY.shelfLimit
            : HOME_SHELF_ITEM_LIMIT;
      const localAlbumKeys = new Set<string>();
      const localArtworkFamilyKeys = new Set<string>();
      let visibleContentCount = 0;

      const deduped = contents.data.filter((item) => {
        if (item.type !== 'albums') {
          visibleContentCount += 1;
          return true;
        }
        const album = albumById.get(item.id);
        const key = album ? this.albumPresentationKey(album) : `id:${item.id}`;
        if (album && preferredAlbumIdByKey.get(key) !== item.id) return false;
        const artworkFamilyKey = album
          ? this.albumArtworkFamilyKey(album)
          : `id:${item.id}`;
        if (
          localAlbumKeys.has(key) ||
          localArtworkFamilyKeys.has(artworkFamilyKey)
        ) {
          return false;
        }

        const isPreviewCard = visibleContentCount < previewLimit;
        if (
          isPreviewCard &&
          !isChronologicalNewRelease &&
          (previewAlbumKeys.has(key) ||
            previewArtworkFamilyKeys.has(artworkFamilyKey))
        ) {
          return false;
        }

        localAlbumKeys.add(key);
        localArtworkFamilyKeys.add(artworkFamilyKey);
        if (isPreviewCard) {
          previewAlbumKeys.add(key);
          previewArtworkFamilyKeys.add(artworkFamilyKey);
        }
        visibleContentCount += 1;
        return true;
      });

      // Global Top Picks is a mixed hero shelf: playlist/station cards count
      // toward its visible contract just like albums. Its generation contract
      // guarantees at least six cards; ordinary album rails require a full
      // preview, while New Releases remains chronological.
      const minimumVisibleItems = isMixedGlobalTopPicks
        ? Math.min(
            PRODUCTION_RECOMMENDATION_POLICY.globalMinimumShelfSize,
            previewLimit,
          )
        : previewLimit;
      if (
        (isAlbumShelf &&
          !isPersonalTopPicks &&
          !isChronologicalNewRelease &&
          visibleContentCount < minimumVisibleItems) ||
        deduped.length === 0
      ) {
        return [];
      }

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
        listenAgainAlbumId: '',
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

  private async latestSystemStationTopPick(
    userId: string,
    moodStations: PersonalRecommendationResource | null,
  ): Promise<{ id: string; type: 'stations'; refreshedAt?: Date } | undefined> {
    if (!moodStations) return undefined;

    const states = await this.prisma.systemStationRefreshState.findMany({
      orderBy: { refreshedAt: 'desc' },
    });
    const stationKeys = states.length
      ? states.map((state) => state.stationKey)
      : PRODUCTION_RECOMMENDATION_POLICY.moodStations
          .map((station, index) => ({
            key: station.key,
            refreshedAt: systemStationScheduledRefresh(index),
          }))
          .sort(
            (left, right) =>
              right.refreshedAt.getTime() - left.refreshedAt.getTime(),
          )
          .map((station) => station.key);
    const refreshedAtByKey = new Map(
      states.map((state) => [state.stationKey, state.refreshedAt]),
    );

    const artworkByKey =
      await this.systemStationArtworkService.byStationKeys(stationKeys);
    for (const stationKey of stationKeys) {
      const index = PRODUCTION_RECOMMENDATION_POLICY.moodStations.findIndex(
        (station) => station.key === stationKey,
      );
      if (index < 0 || !artworkByKey.get(stationKey)?.heroVideo) {
        continue;
      }
      const stationId = this.stationId(userId, index);
      if (
        !moodStations.relationships?.contents?.data.some(
          (item) => item.type === 'stations' && item.id === stationId,
        )
      ) {
        continue;
      }
      return {
        id: stationId,
        type: 'stations',
        refreshedAt: refreshedAtByKey.get(stationKey),
      };
    }
    return undefined;
  }

  private async rankGlobalTopPickItems(input: {
    albums: Array<{ id: string; type: 'albums' }>;
    albumScores: Record<string, number>;
    playlist: { id: string; type: 'playlists'; refreshedAt?: Date } | undefined;
    station: { id: string; type: 'stations'; refreshedAt?: Date } | undefined;
  }): Promise<Array<{ id: string; type: GlobalTopPickItem['type'] }>> {
    const auxiliaryItems = [input.playlist, input.station].filter(
      (item): item is NonNullable<typeof item> => Boolean(item),
    );
    const since = new Date(
      Date.now() -
        PRODUCTION_RECOMMENDATION_POLICY.historyWindowDays * 86_400_000,
    );
    const interactions = auxiliaryItems.length
      ? await this.prisma.recommendationInteraction.findMany({
          where: {
            occurredAt: { gte: since },
            OR: auxiliaryItems.map((item) => ({
              resourceType: item.type,
              resourceId: item.id,
            })),
          },
          select: {
            resourceType: true,
            resourceId: true,
            eventType: true,
            occurredAt: true,
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
          take: PRODUCTION_RECOMMENDATION_POLICY.globalTopPickInteractionLimit,
        })
      : [];
    const engagement = new Map<string, number>();
    for (const interaction of interactions) {
      const weight =
        interaction.eventType === 'PLAY'
          ? 1
          : interaction.eventType === 'OPEN'
            ? 0.35
            : interaction.eventType === 'DISMISS'
              ? -0.5
              : 0.02;
      const ageDays =
        Math.max(0, Date.now() - interaction.occurredAt.getTime()) / 86_400_000;
      const recentWeight = weight * Math.pow(0.5, ageDays / 90);
      const key = `${interaction.resourceType}:${interaction.resourceId}`;
      engagement.set(
        key,
        Math.max(0, (engagement.get(key) ?? 0) + recentWeight),
      );
    }
    const maximumEngagement = Math.max(1, ...engagement.values());
    const freshness = (refreshedAt: Date | undefined) =>
      refreshedAt
        ? Math.max(
            0,
            1 -
              Math.max(0, Date.now() - refreshedAt.getTime()) /
                (PRODUCTION_RECOMMENDATION_POLICY.globalTopPickFreshnessWindowDays *
                  86_400_000),
          )
        : 0;
    const ranked: GlobalTopPickItem[] = [
      ...input.albums.map((album) => ({
        ...album,
        score: input.albumScores[album.id] ?? 0,
      })),
      ...auxiliaryItems.map((item) => {
        const interactionScore =
          (engagement.get(`${item.type}:${item.id}`) ?? 0) / maximumEngagement;
        return {
          ...item,
          // Play/open interaction is the global proxy for both popularity
          // and engagement; refresh time is the independent freshness signal.
          score: scoreGlobalTopPick({
            popularity: interactionScore,
            freshness: freshness(item.refreshedAt),
            engagement: interactionScore,
          }),
        };
      }),
    ];
    return ranked
      .sort(
        (left, right) =>
          (right.score ?? 0) - (left.score ?? 0) ||
          (right.refreshedAt?.getTime() ?? 0) -
            (left.refreshedAt?.getTime() ?? 0) ||
          left.type.localeCompare(right.type) ||
          left.id.localeCompare(right.id),
      )
      .map(({ id, type }) => ({ id, type }));
  }

  private composeGlobalTopPicks(
    section: PersonalRecommendationResource | undefined,
    rankedItems: Array<{ id: string; type: GlobalTopPickItem['type'] }>,
  ): PersonalRecommendationResource | undefined {
    if (!section) return section;
    const attributes = section.attributes;
    const relationships = section.relationships;
    const contents = relationships?.contents;
    if (!attributes || !relationships || !contents) return section;
    const items = rankedItems.map((item) => ({
      id: item.id,
      type: item.type,
      href: `/catalog/vn/${item.type}/${item.id}`,
    }));
    return {
      ...section,
      attributes: {
        ...attributes,
        resourceTypes: ['stations', 'playlists', 'albums'],
      },
      relationships: {
        ...relationships,
        contents: {
          ...contents,
          data: items,
        },
      },
    };
  }

  private composeRankedTopPicks(
    section: PersonalRecommendationResource | undefined,
    items: Array<{ id: string; type: 'albums' | 'playlists' | 'stations' }>,
    listenAgainAlbumId?: string,
  ): PersonalRecommendationResource | undefined {
    if (!section?.attributes || !section.relationships?.contents) {
      return section;
    }
    return {
      ...section,
      attributes: {
        ...section.attributes,
        resourceTypes: [...new Set(items.map((item) => item.type))],
        ...(listenAgainAlbumId ? { listenAgainAlbumId } : {}),
      },
      relationships: {
        ...section.relationships,
        contents: {
          ...section.relationships.contents,
          data: items.map((item) => ({
            ...item,
            href: `/catalog/vn/${item.type}/${item.id}`,
          })),
        },
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
    catalogSections: {
      playlists: PersonalRecommendationResource | null;
      moodStations: PersonalRecommendationResource | null;
    },
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
      take('global-popular-now'),
      take('global-new-releases'),
      takeFirstGenre(),
      catalogSections.playlists ?? undefined,
      catalogSections.moodStations ?? undefined,
      take('global-chill-music'),
      take('global-listener-favourites'),
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
}
