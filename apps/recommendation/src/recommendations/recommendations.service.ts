import { Injectable, Logger } from '@nestjs/common';
import {
  CatalogResource,
  GetHomeRecommendationsRequest,
  GetHomeRecommendationsResponse,
  GetRecommendationSectionRequest,
  GetRecommendationPageForAdminRequest,
  PersonalRecommendationResource,
  PublishRecommendationPageRequest,
  RecommendationPageScope,
  RecommendationPageStatus,
  RecommendationPresentationMode,
  RecommendationRef,
  RecommendationResources,
  ReplaceHomeRecommendationsRequest,
  RefreshRecommendationSectionRequest,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import {
  Prisma,
  RecommendationPageScope as PrismaPageScope,
  RecommendationPageStatus as PrismaPageStatus,
  RecommendationPresentationMode as PrismaPresentationMode,
} from '../generated/prisma/client';
import { RecommendationCatalogService } from './recommendation-catalog.service';
import { ListeningService, TasteProfile } from '../listening/listening.service';
import { randomUUID } from 'node:crypto';

const SUPPORTED_RESOURCE_TYPES = new Set([
  'albums',
  'playlists',
  'stations',
  'editorial-items',
  'artists',
  'songs',
]);

const MAX_SECTIONS_PER_PAGE = 100;
const MAX_RESOURCES_PER_PAGE = 2_000;
const MAX_ITEMS_PER_SECTION = 500;
const MAX_JSON_FIELD_BYTES = 1_000_000;
const MAX_ARRAY_ITEMS = 100;
const MAX_TEXT_LENGTH = 100_000;
const GLOBAL_SCOPE_KEY = 'GLOBAL';
const GLOBAL_TIMEZONE = '*';
const DEFAULT_DISPLAY_KIND = 'MusicCoverShelf';
const HOME_PREVIEW_ITEM_LIMIT = 12;
const SYSTEM_DAILY_MIX_ID_PATTERN = /^daily-mix-[a-f0-9]{32}(?:-\d+)?$/;
const SYSTEM_STATION_ID_PATTERN = /^station-for-you-[a-f0-9]{32}-\d+$/;
const SUPPORTED_DISPLAY_KINDS = new Set([
  'MusicCircleCoverShelf',
  'MusicConcertsEmptyShelf',
  'MusicCoverShelf',
  'MusicNotesHeroShelf',
  'MusicSocialCardShelf',
  'MusicSuperHeroShelf',
]);

type RecommendationItemRecord = {
  resourceType: string;
  resourceId: string;
  sortOrder: number;
  isPrimary: boolean;
  resource: {
    name: string;
    title: string;
    subtitle: string;
    href: string;
    externalUrl: string;
    artistName: string;
    artistNames: string[];
    curatorName: string;
    artworkUrl: string;
    artworkBgColor: string;
    bgColor: string;
    textColor1: string;
    textColor2: string;
    textColor3: string;
    textColor4: string;
    artworkWidth: number;
    artworkHeight: number;
    shortDescription: string;
    standardDescription: string;
    editorialNotesName: string;
    editorialNotesShort: string;
    editorialNotes: string;
    audioTraits: string[];
    genreNames: string[];
    contentRating: string;
    copyright: string;
    recordLabel: string;
    releaseDate: string;
    trackCount: number;
    upc: string;
    isCompilation: boolean;
    isComplete: boolean;
    isStudioMastered: boolean;
    isPrerelease: boolean;
    isSingle: boolean;
    playlistType: string;
    editorialPlaylistKind: string;
    hasCollaboration: boolean;
    isChart: boolean;
    lastModifiedDate: string;
    supportsSing: boolean;
    stationKind: string;
    mediaKind: string;
    radioUrl: string;
    isLive: boolean;
    requiresSubscription: boolean;
    linkUrl: string;
    playParams: unknown;
    editorialArtwork: unknown;
    editorialVideo: unknown;
    plainEditorialCard: unknown;
    attributes: unknown;
    relationships: unknown;
    raw: unknown;
  } | null;
};

type RecommendationSectionRecord = {
  externalId: string;
  title: string;
  titleWithoutName: string;
  presentationMode: string;
  displayKind: string;
  displayDecorations: string[];
  sectionKind: string;
  resourceTypes: string[];
  hasSeeAll: boolean;
  isGroupRecommendation: boolean;
  nextUpdateAt: Date | null;
  version: number;
  items: RecommendationItemRecord[];
};

type RecommendationPageResourceRecord = Pick<
  RecommendationItemRecord,
  'resourceType' | 'resourceId' | 'resource'
> & {
  sortOrder: number;
};

type RecommendationScoreSnapshot = {
  resourceId: string;
  resourceType: string;
  artistName: string;
  genreNames: string[];
  releaseDate: string;
};

type UserSongSignal = {
  playCount: number;
  skipCount: number;
  lastPlayedAt: Date;
};

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: RecommendationCatalogService,
    private readonly listeningService: ListeningService,
  ) {}

  async upsertCatalogResources(resources: CatalogResource[]): Promise<number> {
    const catalogResources = resources.filter(
      (resource) => resource.id && resource.type && resource.attributes,
    );
    if (catalogResources.length === 0) return 0;

    await this.executePersistence(() =>
      this.prisma.$transaction((tx) =>
        this.upsertResourceSnapshots(tx, catalogResources, false),
      ),
    );

    return catalogResources.length;
  }

  async getHomeRecommendations(
    request: GetHomeRecommendationsRequest,
    preloadedGlobalResponse?: GetHomeRecommendationsResponse,
  ): Promise<GetHomeRecommendationsResponse> {
    const name = request.name || 'listen-now';
    const locale = request.locale || 'en-GB';
    const requestedTimezone = request.timezone || '+07:00';

    let response: GetHomeRecommendationsResponse;

    if (preloadedGlobalResponse) {
      response = preloadedGlobalResponse;
    } else {
      const page = await this.executePersistence(() =>
        this.prisma.recommendationPage.findFirst({
          where: {
            status: PrismaPageStatus.PUBLISHED,
            name,
            locale,
            scopeKey: GLOBAL_SCOPE_KEY,
            timezone: GLOBAL_TIMEZONE,
          },
          include: {
            sections: {
              orderBy: { sortOrder: 'asc' },
              include: {
                items: {
                  orderBy: { sortOrder: 'asc' },
                  include: { resource: true },
                },
              },
            },
            resourceLinks: {
              orderBy: { sortOrder: 'asc' },
              include: { resource: true },
            },
          },
        }),
      );

      if (!page) {
        return this.emptyResponse(request);
      }

      response = this.homeResponseForPage(
        page.name,
        page.locale,
        page.sections,
        page.resourceLinks,
        requestedTimezone,
        request.platform || 'web',
      );
    }

    if (request.userId) {
      const userPage = await this.executePersistence(() =>
        this.prisma.recommendationPage.findFirst({
          where: {
            status: PrismaPageStatus.PUBLISHED,
            name,
            locale,
            scopeKey: this.userScopeKey(request.userId),
            timezone: requestedTimezone,
          },
          include: {
            sections: {
              orderBy: { sortOrder: 'asc' },
              include: {
                items: {
                  orderBy: { sortOrder: 'asc' },
                  include: { resource: true },
                },
              },
            },
            resourceLinks: {
              orderBy: { sortOrder: 'asc' },
              include: { resource: true },
            },
          },
        }),
      );

      if (userPage) {
        response = this.mergeHomeResponses(
          response,
          this.homeResponseForPage(
            userPage.name,
            userPage.locale,
            userPage.sections,
            userPage.resourceLinks,
            requestedTimezone,
            request.platform || 'web',
          ),
        );
      }
    }

    return request.userId
      ? this.personalizeHomeResponse(response, request.userId, name)
      : this.deduplicateHomePreviewResources(response);
  }

  private homeResponseForPage(
    name: string,
    locale: string,
    sections: RecommendationSectionRecord[],
    resourceLinks: RecommendationPageResourceRecord[],
    timezone: string,
    platform: string,
  ): GetHomeRecommendationsResponse {
    return {
      data: sections.map((section) => this.sectionRef(section, name)),
      resources: this.buildResources(sections, name, resourceLinks),
      meta: { name, locale, timezone, platform },
    };
  }

  private mergeHomeResponses(
    globalResponse: GetHomeRecommendationsResponse,
    userResponse: GetHomeRecommendationsResponse,
  ): GetHomeRecommendationsResponse {
    if (!globalResponse.resources || !userResponse.resources) {
      return userResponse.resources ? userResponse : globalResponse;
    }

    const hero = globalResponse.data.find(
      (ref) => ref.id === 'global-featured-albums',
    );
    const userSectionKeys = new Set(
      userResponse.data.map((ref) => `${ref.type}:${ref.id}`),
    );
    const userSections = userResponse.data.filter(
      (ref) => `${ref.type}:${ref.id}` !== `${hero?.type}:${hero?.id}`,
    );
    const globalFallback = globalResponse.data.filter((ref) => {
      const key = `${ref.type}:${ref.id}`;
      return key !== `${hero?.type}:${hero?.id}` && !userSectionKeys.has(key);
    });

    return {
      data: hero ? [hero, ...userSections, ...globalFallback] : [
        ...userSections,
        ...globalFallback,
      ],
      resources: {
        personalRecommendation: {
          ...globalResponse.resources.personalRecommendation,
          ...userResponse.resources.personalRecommendation,
        },
        albums: { ...globalResponse.resources.albums, ...userResponse.resources.albums },
        playlists: {
          ...globalResponse.resources.playlists,
          ...userResponse.resources.playlists,
        },
        stations: {
          ...globalResponse.resources.stations,
          ...userResponse.resources.stations,
        },
        editorialItems: {
          ...globalResponse.resources.editorialItems,
          ...userResponse.resources.editorialItems,
        },
        artists: { ...globalResponse.resources.artists, ...userResponse.resources.artists },
        songs: { ...globalResponse.resources.songs, ...userResponse.resources.songs },
      },
      meta: globalResponse.meta,
    };
  }

  async getRecommendationSection(
    request: GetRecommendationSectionRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const requestedTimezone = request.timezone || '+07:00';
    const scopeFilters = request.userId
      ? [
          {
            scopeKey: this.userScopeKey(request.userId),
            timezone: requestedTimezone,
          },
          { scopeKey: GLOBAL_SCOPE_KEY, timezone: GLOBAL_TIMEZONE },
        ]
      : [{ scopeKey: GLOBAL_SCOPE_KEY, timezone: GLOBAL_TIMEZONE }];
    const sections = await this.executePersistence(() =>
      this.prisma.recommendationSection.findMany({
        where: {
          externalId: request.sectionId,
          page: {
            status: PrismaPageStatus.PUBLISHED,
            name: request.name || 'listen-now',
            locale: request.locale || 'en-GB',
            OR: scopeFilters,
          },
        },
        include: {
          page: true,
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { resource: true },
          },
        },
        take: 2,
      }),
    );
    const section =
      sections.find(
        (candidate) =>
          candidate.page.scopeKey === this.userScopeKey(request.userId),
      ) ??
      sections.find(
        (candidate) => candidate.page.scopeKey === GLOBAL_SCOPE_KEY,
      );

    if (!section) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Recommendation section not found',
      });
    }

    return {
      data: [this.sectionRef(section, section.page.name)],
      resources: this.buildResources([section], section.page.name),
      meta: {
        name: section.page.name,
        locale: section.page.locale,
        timezone: requestedTimezone,
        platform: 'web',
      },
    };
  }

  async refreshRecommendationSection(
    request: RefreshRecommendationSectionRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const response = await this.getRecommendationSection(request);
    const resources = response.resources;
    const section =
      resources?.personalRecommendation?.[request.sectionId];
    const relationships = section?.relationships;
    const contentsRelationship = relationships?.contents;
    const contents = contentsRelationship?.data;
    if (
      !resources ||
      !section ||
      !relationships ||
      !contentsRelationship ||
      !contents ||
      contents.length < 2
    ) {
      return response;
    }

    const refreshWindow = Math.floor(Date.now() / 60_000);
    const rankedContents = [...contents].sort(
      (left, right) =>
        this.coldStartScore(
          request.userId,
          request.sectionId,
          left.id,
          refreshWindow,
        ) -
        this.coldStartScore(
          request.userId,
          request.sectionId,
          right.id,
          refreshWindow,
        ),
    );

    return {
      ...response,
      resources: {
        ...resources,
        personalRecommendation: {
          ...resources.personalRecommendation,
          [request.sectionId]: {
            ...section,
            relationships: {
              ...relationships,
              contents: {
                ...contentsRelationship,
                data: rankedContents,
              },
            },
          },
        },
      },
    };
  }

  async replaceHomeRecommendations(
    request: ReplaceHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const normalizedRequest = this.normalizeReplacementRequest(request);
    this.validateReplacement(normalizedRequest);
    const hydratedRequest =
      await this.hydrateCatalogResources(normalizedRequest);
    this.validateReplacement(hydratedRequest);
    await this.assertReferencedResourcesExist(hydratedRequest);

    const name = hydratedRequest.name || 'listen-now';
    const locale = hydratedRequest.locale || 'en-GB';
    const requestedTimezone = hydratedRequest.timezone || '+07:00';
    const pageScope = this.pageScope(hydratedRequest.scope);
    const timezone = this.pageTimezone(pageScope, requestedTimezone);
    const pageStatus = this.pageStatus(hydratedRequest.status);
    const userId =
      pageScope === PrismaPageScope.USER ? hydratedRequest.userId : null;
    const scopeKey =
      pageScope === PrismaPageScope.USER
        ? this.userScopeKey(hydratedRequest.userId)
        : GLOBAL_SCOPE_KEY;
    const preserveImportedRaw = !hydratedRequest.actorUserId;
    const pageResourceRefs = this.pageResourceRefs(hydratedRequest);

    if (hydratedRequest.resources.length > 0) {
      await this.executePersistence(() =>
        this.prisma.$transaction((tx) =>
          this.upsertResourceSnapshots(
            tx,
            hydratedRequest.resources,
            preserveImportedRaw,
          ),
        ),
      );
    }

    const pageLockKey = [scopeKey, name, locale, timezone].join('\u001f');

    await this.executePersistence(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw<Array<{ lock: string | null }>>`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${pageLockKey}, 0)
            )::text AS "lock"
          `;

          const page = await tx.recommendationPage.upsert({
            where: {
              scopeKey_name_locale_timezone_status: {
                scopeKey,
                name,
                locale,
                timezone,
                status: pageStatus,
              },
            },
            create: {
              scope: pageScope,
              scopeKey,
              userId,
              status: pageStatus,
              name,
              locale,
              timezone,
              publishedAt:
                pageStatus === PrismaPageStatus.PUBLISHED
                  ? new Date()
                  : null,
              createdBy: hydratedRequest.actorUserId,
              updatedBy: hydratedRequest.actorUserId,
            },
            update: {
              scope: pageScope,
              userId,
              status: pageStatus,
              publishedAt:
                pageStatus === PrismaPageStatus.PUBLISHED
                  ? new Date()
                  : null,
              updatedBy: hydratedRequest.actorUserId,
            },
          });

          await tx.recommendationPageResource.deleteMany({
            where: { pageId: page.id },
          });

          if (pageResourceRefs.length) {
            await tx.recommendationPageResource.createMany({
              data: pageResourceRefs.map((resource, sortOrder) => ({
                pageId: page.id,
                resourceType: resource.type,
                resourceId: resource.id,
                sortOrder,
              })),
            });
          }

          await tx.recommendationSection.deleteMany({
            where: { pageId: page.id },
          });

          const allSectionItems: Array<{
            sectionId: string;
            resourceType: string;
            resourceId: string;
            sortOrder: number;
            isPrimary: boolean;
          }> = [];

          for (const [sectionIndex, section] of hydratedRequest.sections.entries()) {
            const attributes = section.attributes!;
            const relationships = section.relationships;
            const contents = relationships?.contents?.data ?? [];
            const primaryContent = relationships?.primaryContent?.data ?? [];
            const presentationMode = this.presentationMode(
              attributes.presentationMode,
            );

            const created = await tx.recommendationSection.create({
              data: {
                pageId: page.id,
                externalId: section.id,
                title: attributes.title?.stringForDisplay ?? '',
                titleWithoutName:
                  attributes.titleWithoutName?.stringForDisplay ?? '',
                presentationMode,
                displayKind:
                  presentationMode === PrismaPresentationMode.FIXED
                    ? attributes.display?.kind ?? ''
                    : '',
                displayDecorations: attributes.display?.decorations ?? [],
                sectionKind: attributes.kind || 'music-recommendations',
                resourceTypes: attributes.resourceTypes,
                hasSeeAll: attributes.hasSeeAll,
                isGroupRecommendation: attributes.isGroupRecommendation,
                sortOrder: sectionIndex,
                nextUpdateAt: this.parseDate(attributes.nextUpdateDate),
                version: attributes.version || 1,
                attributes: preserveImportedRaw
                  ? this.toInputJson(attributes)
                  : Prisma.DbNull,
                relationships: relationships
                  ? this.toInputJson(relationships)
                  : Prisma.DbNull,
                raw: preserveImportedRaw
                  ? this.toInputJson(section)
                  : Prisma.DbNull,
              },
              select: { id: true },
            });

            allSectionItems.push(
              ...contents.map((item, itemIndex) => ({
                sectionId: created.id,
                resourceType: item.type,
                resourceId: item.id,
                sortOrder: itemIndex,
                isPrimary: false,
              })),
              ...primaryContent.map((item, itemIndex) => ({
                sectionId: created.id,
                resourceType: item.type,
                resourceId: item.id,
                sortOrder: itemIndex,
                isPrimary: true,
              })),
            );
          }

          if (allSectionItems.length > 0) {
            await tx.recommendationSectionItem.createMany({
              data: allSectionItems,
            });
          }
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        },
      ),
    );

    return this.getRecommendationPage(
      scopeKey,
      pageStatus,
      {
        userId: hydratedRequest.userId,
        name,
        locale,
        timezone: requestedTimezone,
        platform: hydratedRequest.platform || 'web',
      },
    );
  }

  async publishRecommendationPage(
    request: PublishRecommendationPageRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const name = request.name || 'listen-now';
    const locale = request.locale || 'en-GB';
    const pageScope = this.pageScope(request.scope);
    const requestedTimezone = request.timezone || '+07:00';
    const timezone = this.pageTimezone(pageScope, requestedTimezone);

    this.requireText(request.actorUserId, 'actor_user_id', 128);
    if (pageScope === PrismaPageScope.USER) {
      this.requireText(request.userId, 'user_id', 128);
    }

    const scopeKey =
      pageScope === PrismaPageScope.USER
        ? this.userScopeKey(request.userId)
        : GLOBAL_SCOPE_KEY;
    const pageLockKey = [scopeKey, name, locale, timezone].join('\u001f');

    const published = await this.executePersistence(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ lock: string | null }>>`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${pageLockKey}, 0)
          )::text AS "lock"
        `;

        const draft = await tx.recommendationPage.findUnique({
          where: {
            scopeKey_name_locale_timezone_status: {
              scopeKey,
              name,
              locale,
              timezone,
              status: PrismaPageStatus.DRAFT,
            },
          },
          select: { id: true },
        });

        if (!draft) {
          return tx.recommendationPage.findUnique({
            where: {
              scopeKey_name_locale_timezone_status: {
                scopeKey,
                name,
                locale,
                timezone,
                status: PrismaPageStatus.PUBLISHED,
              },
            },
            select: { id: true },
          });
        }

        await tx.recommendationPage.deleteMany({
          where: {
            scopeKey,
            name,
            locale,
            timezone,
            status: PrismaPageStatus.PUBLISHED,
          },
        });

        return tx.recommendationPage.update({
          where: { id: draft.id },
          data: {
            status: PrismaPageStatus.PUBLISHED,
            publishedAt: new Date(),
            updatedBy: request.actorUserId,
          },
          select: { id: true },
        });
      }),
    );

    if (!published) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Recommendation page not found',
      });
    }

    return this.getRecommendationPage(
      scopeKey,
      PrismaPageStatus.PUBLISHED,
      {
        userId: request.userId,
        name,
        locale,
        timezone: requestedTimezone,
        platform: request.platform || 'web',
      },
    );
  }

  async getRecommendationPageForAdmin(
    request: GetRecommendationPageForAdminRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    this.requireText(request.actorUserId, 'actor_user_id', 128);
    const scope = this.pageScope(request.scope);
    const statusValue = this.pageStatus(request.status);
    if (scope === PrismaPageScope.USER) {
      this.requireText(request.userId, 'user_id', 128);
    }

    const scopeKey =
      scope === PrismaPageScope.USER
        ? this.userScopeKey(request.userId)
        : GLOBAL_SCOPE_KEY;

    return this.getRecommendationPage(scopeKey, statusValue, {
      userId: request.userId,
      name: request.name || 'listen-now',
      locale: request.locale || 'en-GB',
      timezone: request.timezone || '+07:00',
      platform: request.platform || 'web',
    });
  }

  private emptyResponse(
    request: GetHomeRecommendationsRequest,
  ): GetHomeRecommendationsResponse {
    return {
      data: [],
      resources: this.emptyResources(),
      meta: {
        name: request.name || 'listen-now',
        locale: request.locale || 'en-GB',
        timezone: request.timezone || '+07:00',
        platform: request.platform || 'web',
      },
    };
  }

  private normalizeReplacementRequest(
    request: ReplaceHomeRecommendationsRequest,
  ): ReplaceHomeRecommendationsRequest {
    return {
      ...request,
      resources: this.list(request.resources),
      sections: this.list(request.sections).map((section) => ({
        ...section,
        attributes: section.attributes
          ? {
              ...section.attributes,
              resourceTypes: this.list(section.attributes.resourceTypes),
              display: section.attributes.display
                ? {
                    ...section.attributes.display,
                    decorations: this.list(
                      section.attributes.display.decorations,
                    ),
                  }
                : undefined,
            }
          : undefined,
        relationships: section.relationships
          ? {
              ...section.relationships,
              contents: section.relationships.contents
                ? {
                    ...section.relationships.contents,
                    data: this.list(section.relationships.contents.data),
                  }
                : undefined,
              primaryContent: section.relationships.primaryContent
                ? {
                    ...section.relationships.primaryContent,
                    data: this.list(
                      section.relationships.primaryContent.data,
                    ),
                  }
                : undefined,
            }
          : undefined,
      })),
    };
  }

  private async getRecommendationPage(
    scopeKey: string,
    pageStatus: PrismaPageStatus,
    request: GetHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const page = await this.executePersistence(() =>
      this.prisma.recommendationPage.findUnique({
        where: {
          scopeKey_name_locale_timezone_status: {
            scopeKey,
            name: request.name || 'listen-now',
            locale: request.locale || 'en-GB',
            timezone:
              scopeKey === GLOBAL_SCOPE_KEY
                ? GLOBAL_TIMEZONE
                : request.timezone || '+07:00',
            status: pageStatus,
          },
        },
        include: {
          sections: {
            orderBy: { sortOrder: 'asc' },
            include: {
              items: {
                orderBy: { sortOrder: 'asc' },
                include: { resource: true },
              },
            },
          },
          resourceLinks: {
            orderBy: { sortOrder: 'asc' },
            include: { resource: true },
          },
        },
      }),
    );

    if (!page) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Recommendation page not found',
      });
    }

    const sections = page.sections as RecommendationSectionRecord[];
    const resourceLinks =
      page.resourceLinks as RecommendationPageResourceRecord[];

    return {
      data: sections.map((section) => this.sectionRef(section, page.name)),
      resources: this.buildResources(sections, page.name, resourceLinks),
      meta: {
        name: page.name,
        locale: page.locale,
        timezone: request.timezone || '+07:00',
        platform: request.platform || 'web',
      },
    };
  }

  private buildResources(
    sections: RecommendationSectionRecord[],
    pageName: string,
    pageResources?: RecommendationPageResourceRecord[],
  ): RecommendationResources {
    const resources = this.emptyResources();

    for (const section of sections) {
      resources.personalRecommendation[section.externalId] =
        this.mapSectionResource(section, pageName);

    }

    const catalogRecords =
      pageResources ?? sections.flatMap((section) => section.items);

    for (const record of catalogRecords) {
      const catalogResource = this.mapCatalogResource(record);
      const bucket = this.getCatalogBucket(resources, record.resourceType);

      if (bucket) {
        bucket[record.resourceId] = catalogResource;
      }
    }

    return resources;
  }

  private emptyResources(): RecommendationResources {
    return {
      personalRecommendation: {},
      albums: {},
      playlists: {},
      stations: {},
      editorialItems: {},
      artists: {},
      songs: {},
    };
  }

  private async personalizeHomeResponse(
    response: GetHomeRecommendationsResponse,
    userId: string,
    pageName: string,
  ): Promise<GetHomeRecommendationsResponse> {
    if (!response.resources) return response;

    const resources = this.cloneResources(response.resources);
    const recentRef = await this.addRuntimeRecentlyPlayedSection(
      userId,
      pageName,
      resources,
    );

    return this.deduplicateHomePreviewResources({
      ...response,
      data: recentRef
        ? this.insertAfterHeroShelf(response.data, recentRef)
        : response.data,
      resources,
    });
  }

  private insertAfterHeroShelf(
    refs: RecommendationRef[],
    insertedRef: RecommendationRef,
  ): RecommendationRef[] {
    const filtered = refs.filter((ref) => ref.id !== insertedRef.id);
    const heroIndex = filtered.findIndex((ref) => ref.id === 'global-featured-albums');
    if (heroIndex < 0) return [insertedRef, ...filtered];

    return [
      ...filtered.slice(0, heroIndex + 1),
      insertedRef,
      ...filtered.slice(heroIndex + 1),
    ];
  }

  private cloneResources(resources: RecommendationResources): RecommendationResources {
    return {
      personalRecommendation: { ...resources.personalRecommendation },
      albums: { ...resources.albums },
      playlists: { ...resources.playlists },
      stations: { ...resources.stations },
      editorialItems: { ...resources.editorialItems },
      artists: { ...resources.artists },
      songs: { ...resources.songs },
    };
  }

  private deduplicateHomePreviewResources(
    response: GetHomeRecommendationsResponse,
  ): GetHomeRecommendationsResponse {
    if (!response.resources) return response;

    const personalRecommendation = {
      ...response.resources.personalRecommendation,
    };
    const data: RecommendationRef[] = [];

    for (const sectionRef of response.data) {
      const section = personalRecommendation[sectionRef.id];
      const contents = section?.relationships?.contents;
      const primaryContent = section?.relationships?.primaryContent;
      const refs = [
        ...(contents?.data ?? []),
        ...(primaryContent?.data ?? []),
      ];
      if (!section || refs.length === 0) {
        data.push(sectionRef);
        continue;
      }

      if (sectionRef.id === 'user-recently-played') {
        data.push(sectionRef);
        continue;
      }

      const preview: RecommendationRef[] = [];
      const sectionResources = new Set<string>();

      for (const ref of refs) {
        const key = this.resourceKey(ref.type, ref.id);
        if (sectionResources.has(key)) continue;
        sectionResources.add(key);

        if (preview.length < HOME_PREVIEW_ITEM_LIMIT) {
          preview.push(ref);
        }
      }

      if (preview.length === 0) continue;

      personalRecommendation[sectionRef.id] = {
        ...section,
        attributes: {
          ...section.attributes!,
          // A Home shelf is selectable only when it has entries outside the
          // preview. Do not retain a stale author-provided flag: it made the
          // arrow appear for shelves that already fit on Home.
          hasSeeAll: sectionResources.size > preview.length,
        },
        relationships: {
          ...section.relationships,
          primaryContent: {
            ...(primaryContent ?? { href: '', data: [] }),
            data: [],
          },
          contents: {
            ...(contents ?? { href: '', data: [] }),
            data: preview,
          },
        },
      };
      data.push(sectionRef);
    }

    const nextResources = {
      ...response.resources,
      personalRecommendation,
    };

    return {
      ...response,
      data,
      resources: this.pruneHomeCatalogResources(nextResources, data),
    };
  }

  /**
   * Home initially renders only each shelf preview. Do not serialize resource
   * records that are reachable only from the section's overflow list; that
   * list is loaded by the section endpoint when the user asks to see more.
   */
  private pruneHomeCatalogResources(
    resources: RecommendationResources,
    sectionRefs: RecommendationRef[],
  ): RecommendationResources {
    const referenced = new Set<string>();
    for (const sectionRef of sectionRefs) {
      const section = resources.personalRecommendation[sectionRef.id];
      for (const ref of [
        ...(section?.relationships?.contents?.data ?? []),
        ...(section?.relationships?.primaryContent?.data ?? []),
      ]) {
        referenced.add(this.resourceKey(ref.type, ref.id));
      }
    }

    const selectReferenced = <T extends CatalogResource>(
      type: string,
      bucket: Record<string, T>,
    ): Record<string, T> =>
      Object.fromEntries(
        Object.entries(bucket).filter(([id]) =>
          referenced.has(this.resourceKey(type, id)),
        ),
      );

    return {
      ...resources,
      albums: selectReferenced('albums', resources.albums),
      playlists: selectReferenced('playlists', resources.playlists),
      stations: selectReferenced('stations', resources.stations),
      editorialItems: selectReferenced(
        'editorial-items',
        resources.editorialItems,
      ),
      songs: selectReferenced('songs', resources.songs),
      // Artist records are intentionally retained: referenced album/song cards
      // use them to turn only published artist names into links.
      artists: resources.artists,
    };
  }

  private async addRuntimeRecentlyPlayedSection(
    userId: string,
    pageName: string,
    resources: RecommendationResources,
  ): Promise<RecommendationRef | null> {
    const recent = await this.listeningService.getRecentlyPlayed(userId, 30);
    if (recent.length === 0) return null;

    const albumLastPlayed = new Map<
      string,
      { albumId: string; albumName: string; lastPlayedAt: Date }
    >();
    const playlistLastPlayed = new Map<string, Date>();
    const stationLastPlayed = new Map<string, Date>();
    const songLastPlayed = new Map<string, Date>();

    for (const item of recent) {
      // Station is the listening context displayed in history. Its individual
      // tracks still shape the taste profile, but never become separate cards.
      if (item.stationId) {
        const existing = stationLastPlayed.get(item.stationId);
        if (!existing || item.lastPlayedAt > existing) {
          stationLastPlayed.set(item.stationId, item.lastPlayedAt);
        }
        continue;
      }

      if (item.playlistId) {
        const existing = playlistLastPlayed.get(item.playlistId);
        if (!existing || item.lastPlayedAt > existing) {
          playlistLastPlayed.set(item.playlistId, item.lastPlayedAt);
        }
        continue;
      }

      if (item.albumId || item.albumName) {
        const key = item.albumId ? `id:${item.albumId}` : `name:${item.albumName}`;
        const existing = albumLastPlayed.get(key);
        if (!existing || item.lastPlayedAt > existing.lastPlayedAt) {
          albumLastPlayed.set(key, {
            albumId: item.albumId,
            albumName: item.albumName,
            lastPlayedAt: item.lastPlayedAt,
          });
        }
      } else {
        songLastPlayed.set(item.songId, item.lastPlayedAt);
      }
    }

    const albumIds = [...new Set(
      [...albumLastPlayed.values()]
        .map((item) => item.albumId)
        .filter(Boolean),
    )];
    const legacyAlbumNames = [...new Set(
      [...albumLastPlayed.values()]
        .filter((item) => !item.albumId)
        .map((item) => item.albumName)
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
        })
      : [];
    const songSnapshots = songLastPlayed.size
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'songs',
            resourceId: { in: [...songLastPlayed.keys()] },
          },
        })
      : [];
    const playlistSnapshots = playlistIds.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'playlists',
            resourceId: { in: playlistIds },
            playlistType: 'system-personalized',
          },
      })
      : [];
    const stationSnapshots = stationIds.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            resourceType: 'stations',
            resourceId: { in: stationIds },
            stationKind: 'system-personalized',
          },
        })
      : [];

    const albumSnapshotsById = new Map(
      albumSnapshots.map((snapshot) => [snapshot.resourceId, snapshot]),
    );
    const albumSnapshotsByLegacyName = new Map(
      albumSnapshots.map((snapshot) => [snapshot.name, snapshot]),
    );
    const items = [
      ...[...albumLastPlayed.values()].flatMap((entry) => {
        const snapshot = entry.albumId
          ? albumSnapshotsById.get(entry.albumId)
          : albumSnapshotsByLegacyName.get(entry.albumName);
        return snapshot ? [{ snapshot, lastPlayedAt: entry.lastPlayedAt }] : [];
      }),
      ...songSnapshots.map((snapshot) => ({
        snapshot,
        lastPlayedAt: songLastPlayed.get(snapshot.resourceId) ?? new Date(0),
      })),
      ...playlistSnapshots.map((snapshot) => ({
        snapshot,
        lastPlayedAt: playlistLastPlayed.get(snapshot.resourceId) ?? new Date(0),
      })),
      ...stationSnapshots.map((snapshot) => ({
        snapshot,
        lastPlayedAt: stationLastPlayed.get(snapshot.resourceId) ?? new Date(0),
      })),
    ]
      .sort((left, right) => right.lastPlayedAt.getTime() - left.lastPlayedAt.getTime())
      .slice(0, 20);

    if (items.length === 0) return null;

    const refs = items.map(({ snapshot }) => {
      const record = this.snapshotRecord(snapshot);
      const bucket = this.getCatalogBucket(resources, record.resourceType);
      if (bucket) {
        bucket[record.resourceId] = this.mapCatalogResource(record);
      }
      return this.itemRef(record);
    });

    const sectionId = 'user-recently-played';
    resources.personalRecommendation[sectionId] = {
      id: sectionId,
      type: 'personal-recommendation',
      href: this.sectionHref(sectionId, pageName),
      attributes: {
        display: { kind: 'MusicCoverShelf', decorations: [] },
        hasSeeAll: false,
        isGroupRecommendation: false,
        kind: 'recently-played',
        nextUpdateDate: '',
        resourceTypes: [...new Set(refs.map((ref) => ref.type))],
        title: { stringForDisplay: 'Recently Played' },
        titleWithoutName: { stringForDisplay: 'Recently Played' },
        version: 1,
        presentationMode:
          RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_FIXED,
      },
      relationships: {
        contents: {
          href: this.sectionRelationshipHref(sectionId, pageName, 'contents'),
          data: refs,
        },
        primaryContent: {
          href: this.sectionRelationshipHref(
            sectionId,
            pageName,
            'primary-content',
          ),
          data: [],
        },
      },
    };

    return this.sectionRef({ externalId: sectionId }, pageName);
  }

  private snapshotRecord(
    snapshot: RecommendationScoreSnapshot &
      Partial<NonNullable<RecommendationItemRecord['resource']>>,
  ): RecommendationItemRecord {
    return {
      resourceType: snapshot.resourceType,
      resourceId: snapshot.resourceId,
      sortOrder: 0,
      isPrimary: false,
      resource: snapshot as NonNullable<RecommendationItemRecord['resource']>,
    };
  }

  private async buildScoreContext(
    userId: string,
    response: GetHomeRecommendationsResponse,
    profile: TasteProfile,
  ) {
    const refs = this.responseContentRefs(response);
    const snapshotKeys = refs.map((ref) => ({
      resourceType: ref.type,
      resourceId: ref.id,
    }));
    const snapshots = snapshotKeys.length
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: {
            OR: snapshotKeys,
          },
          select: {
            resourceId: true,
            resourceType: true,
            artistName: true,
            genreNames: true,
            releaseDate: true,
          },
        })
      : [];
    const snapshotByKey = new Map(
      snapshots.map((snapshot) => [
        this.resourceKey(snapshot.resourceType, snapshot.resourceId),
        snapshot,
      ]),
    );

    const userSignals = await this.prisma.userListeningStats.findMany({
      where: { userId },
      select: {
        songId: true,
        playCount: true,
        skipCount: true,
        lastPlayedAt: true,
      },
    });
    const songSignals = new Map<string, UserSongSignal>(
      userSignals.map((signal) => [
        signal.songId,
        {
          playCount: signal.playCount,
          skipCount: signal.skipCount,
          lastPlayedAt: signal.lastPlayedAt,
        },
      ]),
    );

    const globalAlbums = await this.listeningService.getTopAlbumsGlobal(30, 100);
    const albumNameToId = await this.albumNameToId(
      globalAlbums
        .filter((album) => !album.albumId)
        .map((album) => album.albumName),
    );
    const popularityByKey = new Map<string, number>();
    const maxPlays = Number(globalAlbums[0]?.totalPlays ?? 0n) || 1;
    for (const album of globalAlbums) {
      const albumId = album.albumId || albumNameToId.get(album.albumName);
      if (!albumId) continue;
      popularityByKey.set(
        `albums:${albumId}`,
        Number(album.totalPlays) / maxPlays,
      );
    }

    const recentAlbumIds = await this.recentAlbumIds(userId);

    const artistWeights = new Map(profile.artists.map((a) => [a.name, a.weight]));
    const genreWeights = new Map(profile.genres.map((g) => [g.name, g.weight]));

    return {
      profile,
      artistWeights,
      genreWeights,
      snapshotByKey,
      songSignals,
      popularityByKey,
      recentAlbumIds,
    };
  }

  private scoreRecommendationRef(
    ref: RecommendationRef,
    context: Awaited<ReturnType<RecommendationsService['buildScoreContext']>>,
  ): number {
    const key = `${ref.type}:${ref.id}`;
    const snapshot = context.snapshotByKey.get(key);
    const artistScore = snapshot?.artistName
      ? context.artistWeights.get(snapshot.artistName) ?? 0
      : 0;
    const genreScore = snapshot?.genreNames?.length
      ? Math.min(
          1,
          snapshot.genreNames.reduce(
            (total, genre) =>
              total + (context.genreWeights.get(genre) ?? 0),
            0,
          ),
        )
      : 0;
    const popularityScore = context.popularityByKey.get(key) ?? 0;
    const recentScore = context.recentAlbumIds.has(ref.id) ? 1 : 0;
    const freshnessScore = this.releaseFreshnessScore(snapshot?.releaseDate);
    const skipPenalty =
      ref.type === 'songs'
        ? this.skipPenalty(context.songSignals.get(ref.id))
        : 1;

    return (
      popularityScore * 0.35 +
      artistScore * 0.22 +
      genreScore * 0.18 +
      recentScore * 0.15 +
      freshnessScore * 0.1
    ) * skipPenalty;
  }

  private responseContentRefs(
    response: GetHomeRecommendationsResponse,
  ): RecommendationRef[] {
    const sections = response.resources?.personalRecommendation ?? {};
    const seen = new Set<string>();
    return Object.values(sections).flatMap((section) => {
      const refs = section.relationships?.contents?.data ?? [];
      return refs.filter((ref) => {
        const key = `${ref.type}:${ref.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }

  private async albumNameToId(albumNames: string[]): Promise<Map<string, string>> {
    if (albumNames.length === 0) return new Map();
    const albums = await this.prisma.recommendationResourceSnapshot.findMany({
      where: {
        resourceType: 'albums',
        name: { in: albumNames },
      },
      select: { name: true, resourceId: true },
    });
    return new Map(albums.map((album) => [album.name, album.resourceId]));
  }

  private async recentAlbumIds(userId: string): Promise<Set<string>> {
    const recent = await this.listeningService.getRecentlyPlayed(userId, 30);
    const directAlbumIds = recent
      .map((item) => item.albumId)
      .filter(Boolean);
    const albumNames = [...new Set(
      recent
        .filter((item) => !item.albumId)
        .map((item) => item.albumName)
        .filter(Boolean),
    )];
    const nameToId = await this.albumNameToId(albumNames);
    return new Set([...directAlbumIds, ...nameToId.values()]);
  }

  private releaseFreshnessScore(releaseDate: string | undefined): number {
    if (!releaseDate) return 0;
    const releasedAt = new Date(releaseDate).getTime();
    if (!Number.isFinite(releasedAt)) return 0;
    const ageDays = Math.max(0, (Date.now() - releasedAt) / 86_400_000);
    return Math.max(0, 1 - ageDays / 120);
  }

  private skipPenalty(signal: UserSongSignal | undefined): number {
    if (!signal || signal.playCount <= 0) return 1;
    return Math.max(0.35, 1 - signal.skipCount / signal.playCount);
  }

  private mapSectionResource(
    section: RecommendationSectionRecord,
    pageName: string,
  ): PersonalRecommendationResource {
    const contents = section.items
      .filter((item) => !item.isPrimary)
      .map((item) => this.itemRef(item));
    const primaryContent = section.items
      .filter((item) => item.isPrimary)
      .map((item) => this.itemRef(item));

    return {
      id: section.externalId,
      type: 'personal-recommendation',
      href: this.sectionHref(section.externalId, pageName),
      attributes: {
        display: {
          kind: this.resolveDisplayKind(section),
          decorations: section.displayDecorations,
        },
        hasSeeAll: section.hasSeeAll,
        isGroupRecommendation: section.isGroupRecommendation,
        kind: section.sectionKind,
        nextUpdateDate: section.nextUpdateAt?.toISOString() ?? '',
        resourceTypes: section.resourceTypes,
        title: {
          stringForDisplay: section.title,
        },
        titleWithoutName: section.titleWithoutName
          ? { stringForDisplay: section.titleWithoutName }
          : undefined,
        version: section.version,
        presentationMode:
          section.presentationMode === PrismaPresentationMode.AUTO
            ? RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_AUTO
            : RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_FIXED,
      },
      relationships: {
        contents: {
          href: this.sectionRelationshipHref(
            section.externalId,
            pageName,
            'contents',
          ),
          data: contents,
        },
        primaryContent: {
          href: this.sectionRelationshipHref(
            section.externalId,
            pageName,
            'primary-content',
          ),
          data: primaryContent,
        },
      },
    };
  }

  private mapCatalogResource(
    item: Pick<
      RecommendationItemRecord,
      'resourceType' | 'resourceId' | 'resource'
    >,
  ): CatalogResource {
    const resource = item.resource;
    const raw = this.jsonObject(resource?.raw);
    const rawRelationships = this.jsonObject(raw?.relationships);
    const name = resource?.name || resource?.title || '';
    const href =
      resource?.href || this.catalogHref(item.resourceType, item.resourceId);

    return {
      id: item.resourceId,
      type: item.resourceType,
      href,
      attributes: this.wrapStruct(
        this.catalogAttributes(
          item.resourceType,
          item.resourceId,
          href,
          name,
          resource,
        ),
      ),
      relationships: this.wrapOptionalStruct(
        rawRelationships ?? this.jsonObject(resource?.relationships),
      ),
    };
  }

  private sectionRef(
    section: Pick<RecommendationSectionRecord, 'externalId'>,
    pageName: string,
  ): RecommendationRef {
    return {
      id: section.externalId,
      type: 'personal-recommendation',
      href: this.sectionHref(section.externalId, pageName),
    };
  }

  private itemRef(item: RecommendationItemRecord): RecommendationRef {
    return {
      id: item.resourceId,
      type: item.resourceType,
      href:
        item.resource?.href ||
        this.catalogHref(item.resourceType, item.resourceId),
    };
  }

  private sectionHref(sectionId: string, pageName: string): string {
    return `/me/recommendations/${sectionId}?name=${pageName}`;
  }

  private sectionRelationshipHref(
    sectionId: string,
    pageName: string,
    relationship: string,
  ): string {
    return `/me/recommendations/${sectionId}/${relationship}?name=${pageName}`;
  }

  private catalogHref(resourceType: string, resourceId: string): string {
    return `/catalog/vn/${resourceType}/${resourceId}`;
  }

  private getCatalogBucket(
    resources: RecommendationResources,
    resourceType: string,
  ): Record<string, CatalogResource> | null {
    switch (resourceType) {
      case 'albums':
        return resources.albums;
      case 'playlists':
        return resources.playlists;
      case 'stations':
        return resources.stations;
      case 'editorial-items':
        return resources.editorialItems;
      case 'artists':
        return resources.artists;
      case 'songs':
        return resources.songs;
      default:
        return null;
    }
  }

  private catalogAttributes(
    resourceType: string,
    resourceId: string,
    href: string,
    name: string,
    resource: RecommendationItemRecord['resource'],
  ): Record<string, unknown> {
    const common = {
      name,
      url: resource?.externalUrl || href,
      artwork: this.responseArtwork(resource),
      playParams:
        this.jsonValue(resource?.playParams) ??
        this.defaultPlayParams(resourceType, resourceId),
    };

    switch (resourceType) {
      case 'albums':
        return this.compactObject({
          artistName: resource?.artistName,
          ...common,
          audioTraits: resource?.audioTraits,
          contentRating: resource?.contentRating || undefined,
          copyright: resource?.copyright || undefined,
          editorialArtwork: this.jsonValue(resource?.editorialArtwork),
          editorialVideo: this.jsonValue(resource?.editorialVideo),
          genreNames: resource?.genreNames,
          isCompilation: resource?.isCompilation ?? false,
          isComplete: resource?.isComplete ?? false,
          isStudioMastered: resource?.isStudioMastered ?? false,
          isPrerelease: resource?.isPrerelease ?? false,
          isSingle: resource?.isSingle ?? false,
          plainEditorialNotes: this.editorialNotes(resource),
          recordLabel: resource?.recordLabel || undefined,
          releaseDate: resource?.releaseDate || undefined,
          trackCount: resource?.trackCount ?? 0,
          upc: resource?.upc || undefined,
        });
      case 'playlists':
        return this.compactObject({
          artistNames: resource?.artistNames,
          ...common,
          audioTraits: resource?.audioTraits,
          curatorName: resource?.curatorName || undefined,
          description: this.description(resource),
          editorialArtwork: this.jsonValue(resource?.editorialArtwork),
          editorialPlaylistKind: resource?.editorialPlaylistKind || undefined,
          editorialVideo: this.jsonValue(resource?.editorialVideo),
          hasCollaboration: resource?.hasCollaboration ?? false,
          isChart: resource?.isChart ?? false,
          lastModifiedDate: resource?.lastModifiedDate || undefined,
          plainEditorialCard: this.jsonValue(resource?.plainEditorialCard),
          plainEditorialNotes: this.editorialNotes(resource),
          playlistType: resource?.playlistType || undefined,
          supportsSing: resource?.supportsSing ?? false,
        });
      case 'stations':
        return this.compactObject({
          ...common,
          editorialArtwork: this.jsonValue(resource?.editorialArtwork),
          editorialVideo: this.jsonValue(resource?.editorialVideo),
          isLive: resource?.isLive ?? false,
          kind: resource?.stationKind || undefined,
          mediaKind: resource?.mediaKind || undefined,
          plainEditorialCard: this.jsonValue(resource?.plainEditorialCard),
          plainEditorialNotes: this.editorialNotes(resource),
          radioUrl: resource?.radioUrl || undefined,
          requiresSubscription: resource?.requiresSubscription ?? false,
        });
      case 'editorial-items':
        return this.compactObject({
          ...common,
          editorialArtwork: this.jsonValue(resource?.editorialArtwork),
          editorialVideo: this.jsonValue(resource?.editorialVideo),
          link: resource?.linkUrl ? { url: resource.linkUrl } : undefined,
          plainEditorialCard: this.jsonValue(resource?.plainEditorialCard),
          plainEditorialNotes: this.editorialNotes(resource),
        });
      case 'artists':
        return this.compactObject({
          name,
          url: resource?.externalUrl || href,
          artwork: this.responseArtwork(resource),
        });
      default:
        return this.compactObject({
          artistName: resource?.artistName || undefined,
          ...common,
          audioTraits: resource?.audioTraits,
          contentRating: resource?.contentRating || undefined,
          genreNames: resource?.genreNames,
        });
    }
  }

  private validateReplacement(
    request: ReplaceHomeRecommendationsRequest,
  ): void {
    const pageScope = this.pageScope(request.scope);
    this.pageStatus(request.status);
    if (pageScope === PrismaPageScope.USER) {
      this.requireText(request.userId, 'user_id', 128);
    }
    if (
      request.scope !==
        RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_UNSPECIFIED ||
      request.status !==
        RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_UNSPECIFIED
    ) {
      this.requireText(request.actorUserId, 'actor_user_id', 128);
    }
    this.requireText(request.name || 'listen-now', 'name', 64);
    this.requireText(request.locale || 'en-GB', 'locale', 16);
    this.requireText(request.timezone || '+07:00', 'timezone', 16);
    this.requireText(request.platform || 'web', 'platform', 32);

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(request.name || 'listen-now')) {
      this.invalidArgument('name must use slug format');
    }

    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(request.locale || 'en-GB')) {
      this.invalidArgument(
        'locale must use language or language-region format',
      );
    }

    if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(request.timezone || '+07:00')) {
      this.invalidArgument('timezone must use ±HH:MM format');
    }

    if (request.sections.length > MAX_SECTIONS_PER_PAGE) {
      this.invalidArgument(
        `sections must contain at most ${MAX_SECTIONS_PER_PAGE} entries`,
      );
    }

    if (request.resources.length > MAX_RESOURCES_PER_PAGE) {
      this.invalidArgument(
        `resources must contain at most ${MAX_RESOURCES_PER_PAGE} entries`,
      );
    }

    const resourceKeys = new Set<string>();
    for (const resource of request.resources) {
      this.validateResource(resource);
      const key = this.resourceKey(resource.type, resource.id);

      if (resourceKeys.has(key)) {
        this.invalidArgument(`duplicate resource: ${key}`);
      }
      resourceKeys.add(key);
    }

    const sectionIds = new Set<string>();
    for (const section of request.sections) {
      this.validateSection(section);

      if (sectionIds.has(section.id)) {
        this.invalidArgument(`duplicate section id: ${section.id}`);
      }
      sectionIds.add(section.id);
    }
  }

  private validateResource(resource: CatalogResource): void {
    this.requireText(resource.id, 'resource.id', 128);
    this.validateResourceType(resource.type);
    this.optionalString(resource.href, 'resource.href', 1_000);
    if (!resource.attributes) {
      this.invalidArgument(
        `resource ${this.resourceKey(resource.type, resource.id)} is missing attributes`,
      );
    }

    const attributes = this.unwrapStruct(resource.attributes);
    if (resource.type === 'editorial-items') {
      this.optionalString(
        attributes.name,
        'resource.attributes.name',
        255,
      );
    } else {
      if (typeof attributes.name !== 'string') {
        this.invalidArgument('resource.attributes.name must be a string');
      }
      this.requireText(attributes.name, 'resource.attributes.name', 255);
    }
    this.validateJsonSize(attributes, 'resource.attributes');

    this.optionalString(attributes.url, 'resource.attributes.url', 1_000);
    this.optionalString(
      attributes.artistName,
      'resource.attributes.artistName',
      255,
    );
    this.optionalString(
      attributes.curatorName,
      'resource.attributes.curatorName',
      255,
    );
    this.optionalStringOrStringArray(
      attributes.artistNames,
      'resource.attributes.artistNames',
      255,
    );
    this.optionalStringArray(
      attributes.audioTraits,
      'resource.attributes.audioTraits',
      64,
    );
    this.optionalStringArray(
      attributes.genreNames,
      'resource.attributes.genreNames',
      128,
    );

    for (const [field, maxLength] of [
      ['contentRating', 64],
      ['recordLabel', 255],
      ['releaseDate', 32],
      ['upc', 64],
      ['playlistType', 64],
      ['editorialPlaylistKind', 64],
      ['lastModifiedDate', 64],
      ['kind', 64],
      ['mediaKind', 64],
      ['radioUrl', 1_000],
    ] as const) {
      this.optionalString(
        attributes[field],
        `resource.attributes.${field}`,
        maxLength,
      );
    }

    this.optionalString(
      attributes.copyright,
      'resource.attributes.copyright',
      MAX_TEXT_LENGTH,
    );

    for (const field of [
      'isCompilation',
      'isComplete',
      'isStudioMastered',
      'isPrerelease',
      'isSingle',
      'hasCollaboration',
      'isChart',
      'supportsSing',
      'isLive',
      'requiresSubscription',
    ] as const) {
      this.optionalBoolean(attributes[field], `resource.attributes.${field}`);
    }

    this.optionalNonNegativeInteger(
      attributes.trackCount,
      'resource.attributes.trackCount',
    );

    if (
      attributes.artwork !== undefined &&
      !this.isJsonObject(attributes.artwork)
    ) {
      this.invalidArgument('resource.attributes.artwork must be an object');
    }

    if (this.isJsonObject(attributes.artwork)) {
      this.validateArtwork(attributes.artwork);
    }

    this.validateTextObject(
      attributes.description,
      'resource.attributes.description',
      false,
    );
    this.validateTextObject(
      attributes.plainEditorialNotes,
      'resource.attributes.plainEditorialNotes',
      true,
    );

    for (const field of [
      'playParams',
      'editorialArtwork',
      'editorialVideo',
      'plainEditorialCard',
      'link',
    ] as const) {
      if (
        attributes[field] !== undefined &&
        !this.isJsonObject(attributes[field])
      ) {
        this.invalidArgument(`resource.attributes.${field} must be an object`);
      }
    }

    const playParams = this.objectValue(attributes.playParams);
    this.optionalString(
      playParams?.id,
      'resource.attributes.playParams.id',
      128,
    );
    this.optionalString(
      playParams?.kind,
      'resource.attributes.playParams.kind',
      64,
    );

    const link = this.objectValue(attributes.link);
    this.optionalString(link?.url, 'resource.attributes.link.url', 1_000);

    if (
      resource.relationships !== undefined &&
      !this.isJsonObject(resource.relationships)
    ) {
      this.invalidArgument('resource.relationships must be an object');
    }

    if (resource.relationships !== undefined) {
      this.validateJsonSize(
        this.unwrapStruct(resource.relationships),
        'resource.relationships',
      );
    }
  }

  private validateSection(
    section: PersonalRecommendationResource,
  ): void {
    this.requireText(section.id, 'section.id', 128);

    if (section.type && section.type !== 'personal-recommendation') {
      this.invalidArgument(
        `section ${section.id} must have type personal-recommendation`,
      );
    }

    const attributes = section.attributes;
    if (!attributes) {
      this.invalidArgument(`section ${section.id} is missing attributes`);
    }
    const display = attributes.display;
    const presentationMode = this.presentationMode(
      attributes.presentationMode,
    );

    if (presentationMode === PrismaPresentationMode.FIXED) {
      if (!display?.kind) {
        this.invalidArgument(`section ${section.id} is missing display.kind`);
      }
      this.requireText(
        display.kind,
        `section ${section.id} display.kind`,
        64,
      );
      if (!SUPPORTED_DISPLAY_KINDS.has(display.kind)) {
        this.invalidArgument(
          `section ${section.id} uses unsupported display.kind ${display.kind}`,
        );
      }
    } else if (display?.kind) {
      this.invalidArgument(
        `section ${section.id} must omit display.kind when presentation_mode is AUTO`,
      );
    }
    this.optionalString(
      attributes.kind,
      `section ${section.id} attributes.kind`,
      64,
    );
    this.optionalStringArray(
      display?.decorations,
      `section ${section.id} display.decorations`,
      64,
    );
    this.optionalStringArray(
      attributes.resourceTypes,
      `section ${section.id} resourceTypes`,
      64,
    );

    for (const resourceType of attributes.resourceTypes) {
      this.validateResourceType(resourceType);
    }

    this.optionalString(
      attributes.title?.stringForDisplay,
      `section ${section.id} title`,
      255,
    );
    this.optionalString(
      attributes.titleWithoutName?.stringForDisplay,
      `section ${section.id} titleWithoutName`,
      255,
    );

    if (!Number.isInteger(attributes.version) || attributes.version < 0) {
      this.invalidArgument(
        `section ${section.id} version must be a non-negative integer`,
      );
    }

    this.parseDate(attributes.nextUpdateDate);
    this.optionalString(section.href, `section ${section.id} href`, 1_000);

    const contents = section.relationships?.contents?.data ?? [];
    const primaryContent = section.relationships?.primaryContent?.data ?? [];
    this.optionalString(
      section.relationships?.contents?.href,
      `section ${section.id} contents.href`,
      1_000,
    );
    this.optionalString(
      section.relationships?.primaryContent?.href,
      `section ${section.id} primaryContent.href`,
      1_000,
    );

    if (contents.length + primaryContent.length > MAX_ITEMS_PER_SECTION) {
      this.invalidArgument(
        `section ${section.id} must contain at most ${MAX_ITEMS_PER_SECTION} items`,
      );
    }

    const itemKeys = new Set<string>();
    for (const [isPrimary, items] of [
      [false, contents] as const,
      [true, primaryContent] as const,
    ]) {
      for (const item of items) {
        this.requireText(item.id, `section ${section.id} item.id`, 128);
        this.validateResourceType(item.type);
        this.optionalString(
          item.href,
          `section ${section.id} item.href`,
          1_000,
        );

        const resourceKey = this.resourceKey(item.type, item.id);
        const itemKey = `${resourceKey}:${isPrimary}`;
        if (itemKeys.has(itemKey)) {
          this.invalidArgument(
            `section ${section.id} contains duplicate item ${resourceKey}`,
          );
        }
        itemKeys.add(itemKey);
      }
    }
  }

  private pageResourceRefs(
    request: ReplaceHomeRecommendationsRequest,
  ): Array<{ type: string; id: string }> {
    const refs = [
      ...request.resources.map((resource) => ({
        type: resource.type,
        id: resource.id,
      })),
      ...request.sections.flatMap((section) => [
        ...(section.relationships?.contents?.data ?? []),
        ...(section.relationships?.primaryContent?.data ?? []),
      ]),
    ];
    const seen = new Set<string>();

    return refs.filter((ref) => {
      const key = this.resourceKey(ref.type, ref.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async hydrateCatalogResources(
    request: ReplaceHomeRecommendationsRequest,
  ): Promise<ReplaceHomeRecommendationsRequest> {
    const suppliedKeys = new Set(
      request.resources.map((resource) =>
        this.resourceKey(resource.type, resource.id),
      ),
    );
    const missing = this.pageResourceRefs(request).filter(
      (ref) => !suppliedKeys.has(this.resourceKey(ref.type, ref.id)),
    );
    if (missing.length === 0) return request;
    if (missing.length > MAX_RESOURCES_PER_PAGE) {
      this.invalidArgument(
        `page references must contain at most ${MAX_RESOURCES_PER_PAGE} unique resources`,
      );
    }

    const systemGeneratedRefs = missing.filter((ref) =>
      this.isSystemGeneratedRef(ref),
    );
    const catalogRefs = missing.filter(
      (ref) =>
        this.catalogService.supports(ref.type) &&
        !this.isSystemGeneratedRef(ref),
    );
    const hydrated = await this.catalogService.resolve(catalogRefs);
    const hydratedKeys = new Set(
      hydrated.map((resource) =>
        this.resourceKey(resource.type, resource.id),
      ),
    );
    const unpublishedCatalogRefs = catalogRefs.filter(
      (ref) => !hydratedKeys.has(this.resourceKey(ref.type, ref.id)),
    );
    if (unpublishedCatalogRefs.length) {
      this.invalidArgument(
        `catalog resources are not published: ${unpublishedCatalogRefs
          .slice(0, 10)
          .map((ref) => this.resourceKey(ref.type, ref.id))
          .join(', ')}`,
      );
    }

    const snapshotRefs = [
      ...missing.filter((ref) => !this.catalogService.supports(ref.type)),
      ...systemGeneratedRefs,
    ];
    if (snapshotRefs.length === 0) {
      return {
        ...request,
        resources: [...request.resources, ...hydrated],
      };
    }

    const existing = await this.executePersistence(() =>
      this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          OR: snapshotRefs.map((ref) => ({
            resourceType: ref.type,
            resourceId: ref.id,
          })),
        },
        select: { resourceType: true, resourceId: true },
      }),
    );
    const existingKeys = new Set(
      existing.map((resource) =>
        this.resourceKey(resource.resourceType, resource.resourceId),
      ),
    );
    const unresolvedSnapshots = snapshotRefs.filter(
      (ref) => !existingKeys.has(this.resourceKey(ref.type, ref.id)),
    );
    if (unresolvedSnapshots.length) {
      this.invalidArgument(
        `page references missing resources: ${unresolvedSnapshots
          .slice(0, 10)
          .map((ref) => this.resourceKey(ref.type, ref.id))
          .join(', ')}`,
      );
    }

    return {
      ...request,
      resources: [...request.resources, ...hydrated],
    };
  }

  private async assertReferencedResourcesExist(
    request: ReplaceHomeRecommendationsRequest,
  ): Promise<void> {
    const supplied = new Set(
      request.resources.map((resource) =>
        this.resourceKey(resource.type, resource.id),
      ),
    );
    const missing = this.pageResourceRefs(request).filter(
      (ref) => !supplied.has(this.resourceKey(ref.type, ref.id)),
    );

    if (missing.length === 0) return;
    if (missing.length > MAX_RESOURCES_PER_PAGE) {
      this.invalidArgument(
        `page references must contain at most ${MAX_RESOURCES_PER_PAGE} unique resources`,
      );
    }

    const existing = await this.executePersistence(() =>
      this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          OR: missing.map((ref) => ({
            resourceType: ref.type,
            resourceId: ref.id,
          })),
        },
        select: { resourceType: true, resourceId: true },
      }),
    );
    const existingKeys = new Set(
      existing.map((resource) =>
        this.resourceKey(resource.resourceType, resource.resourceId),
      ),
    );
    const unresolved = missing.filter(
      (ref) => !existingKeys.has(this.resourceKey(ref.type, ref.id)),
    );

    if (unresolved.length) {
      this.invalidArgument(
        `page references missing resources: ${unresolved
          .slice(0, 10)
          .map((ref) => this.resourceKey(ref.type, ref.id))
          .join(', ')}`,
      );
    }
  }

  private resourceSnapshotData(
    resource: CatalogResource,
    preserveImportedRaw: boolean,
  ) {
    const attributes = this.unwrapStruct(resource.attributes!);
    const relationships = this.unwrapOptionalStruct(resource.relationships);
    const artwork = this.objectValue(attributes.artwork);
    const plainEditorialNotes = this.objectValue(
      attributes.plainEditorialNotes,
    );
    const description = this.objectValue(attributes.description);
    const link = this.objectValue(attributes.link);
    const resourceName =
      this.stringValue(attributes.name) ||
      this.stringValue(plainEditorialNotes?.name);

    return {
      name: resourceName,
      title: resourceName,
      subtitle:
        this.stringValue(attributes.artistName) ||
        this.stringValue(attributes.curatorName),
      href: resource.href,
      externalUrl: this.stringValue(attributes.url),
      artistName: this.stringValue(attributes.artistName),
      artistNames: this.stringOrStringArrayValue(attributes.artistNames),
      curatorName: this.stringValue(attributes.curatorName),
      artworkUrl: this.stringValue(artwork?.url),
      artworkBgColor: this.normalizeColor(this.stringValue(artwork?.bgColor)),
      bgColor: this.normalizeColor(this.stringValue(artwork?.bgColor)),
      textColor1: this.normalizeColor(this.artworkTextColor(artwork, 1)),
      textColor2: this.normalizeColor(this.artworkTextColor(artwork, 2)),
      textColor3: this.normalizeColor(this.artworkTextColor(artwork, 3)),
      textColor4: this.normalizeColor(this.artworkTextColor(artwork, 4)),
      artworkWidth: this.numberValue(artwork?.width),
      artworkHeight: this.numberValue(artwork?.height),
      shortDescription: this.stringValue(description?.short),
      standardDescription: this.stringValue(description?.standard),
      editorialNotesName: this.stringValue(plainEditorialNotes?.name),
      editorialNotesShort: this.stringValue(plainEditorialNotes?.short),
      editorialNotes: this.stringValue(plainEditorialNotes?.standard),
      audioTraits: this.stringArrayValue(attributes.audioTraits),
      genreNames: this.stringArrayValue(attributes.genreNames),
      contentRating: this.stringValue(attributes.contentRating),
      copyright: this.stringValue(attributes.copyright),
      recordLabel: this.stringValue(attributes.recordLabel),
      releaseDate: this.stringValue(attributes.releaseDate),
      trackCount: this.numberValue(attributes.trackCount),
      upc: this.stringValue(attributes.upc),
      isCompilation: this.booleanValue(attributes.isCompilation),
      isComplete: this.booleanValue(attributes.isComplete),
      isStudioMastered: this.booleanValue(attributes.isStudioMastered),
      isPrerelease: this.booleanValue(attributes.isPrerelease),
      isSingle: this.booleanValue(attributes.isSingle),
      playlistType: this.stringValue(attributes.playlistType),
      editorialPlaylistKind: this.stringValue(attributes.editorialPlaylistKind),
      hasCollaboration: this.booleanValue(attributes.hasCollaboration),
      isChart: this.booleanValue(attributes.isChart),
      lastModifiedDate: this.stringValue(attributes.lastModifiedDate),
      supportsSing: this.booleanValue(attributes.supportsSing),
      stationKind: this.stringValue(attributes.kind),
      mediaKind: this.stringValue(attributes.mediaKind),
      radioUrl: this.stringValue(attributes.radioUrl),
      isLive: this.booleanValue(attributes.isLive),
      requiresSubscription: this.booleanValue(attributes.requiresSubscription),
      linkUrl: this.stringValue(link?.url),
      playParams: this.toNullableInputJson(attributes.playParams),
      editorialArtwork: this.toNullableInputJson(attributes.editorialArtwork),
      editorialVideo: this.toNullableInputJson(attributes.editorialVideo),
      plainEditorialCard: this.toNullableInputJson(
        attributes.plainEditorialCard,
      ),
      plainEditorialNotes: this.toNullableInputJson(
        attributes.plainEditorialNotes,
      ),
      attributes: this.toNullableInputJson(attributes),
      relationships: this.toNullableInputJson(relationships),
      raw: preserveImportedRaw
        ? this.toInputJson({
            id: resource.id,
            type: resource.type,
            href: resource.href,
            attributes,
            relationships: relationships ?? null,
          })
        : Prisma.DbNull,
    };
  }

  private static readonly SNAPSHOT_UPSERT_COLUMNS: ReadonlyArray<{
    column: string;
    kind: 'text' | 'int' | 'bool' | 'array' | 'json';
  }> = [
    { column: 'name', kind: 'text' },
    { column: 'title', kind: 'text' },
    { column: 'subtitle', kind: 'text' },
    { column: 'href', kind: 'text' },
    { column: 'externalUrl', kind: 'text' },
    { column: 'artistName', kind: 'text' },
    { column: 'artistNames', kind: 'array' },
    { column: 'curatorName', kind: 'text' },
    { column: 'artworkUrl', kind: 'text' },
    { column: 'artworkBgColor', kind: 'text' },
    { column: 'bgColor', kind: 'text' },
    { column: 'textColor1', kind: 'text' },
    { column: 'textColor2', kind: 'text' },
    { column: 'textColor3', kind: 'text' },
    { column: 'textColor4', kind: 'text' },
    { column: 'artworkWidth', kind: 'int' },
    { column: 'artworkHeight', kind: 'int' },
    { column: 'shortDescription', kind: 'text' },
    { column: 'standardDescription', kind: 'text' },
    { column: 'editorialNotesName', kind: 'text' },
    { column: 'editorialNotesShort', kind: 'text' },
    { column: 'editorialNotes', kind: 'text' },
    { column: 'audioTraits', kind: 'array' },
    { column: 'genreNames', kind: 'array' },
    { column: 'contentRating', kind: 'text' },
    { column: 'copyright', kind: 'text' },
    { column: 'recordLabel', kind: 'text' },
    { column: 'releaseDate', kind: 'text' },
    { column: 'trackCount', kind: 'int' },
    { column: 'upc', kind: 'text' },
    { column: 'isCompilation', kind: 'bool' },
    { column: 'isComplete', kind: 'bool' },
    { column: 'isStudioMastered', kind: 'bool' },
    { column: 'isPrerelease', kind: 'bool' },
    { column: 'isSingle', kind: 'bool' },
    { column: 'playlistType', kind: 'text' },
    { column: 'editorialPlaylistKind', kind: 'text' },
    { column: 'hasCollaboration', kind: 'bool' },
    { column: 'isChart', kind: 'bool' },
    { column: 'lastModifiedDate', kind: 'text' },
    { column: 'supportsSing', kind: 'bool' },
    { column: 'stationKind', kind: 'text' },
    { column: 'mediaKind', kind: 'text' },
    { column: 'radioUrl', kind: 'text' },
    { column: 'isLive', kind: 'bool' },
    { column: 'requiresSubscription', kind: 'bool' },
    { column: 'linkUrl', kind: 'text' },
    { column: 'playParams', kind: 'json' },
    { column: 'editorialArtwork', kind: 'json' },
    { column: 'editorialVideo', kind: 'json' },
    { column: 'plainEditorialCard', kind: 'json' },
    { column: 'plainEditorialNotes', kind: 'json' },
    { column: 'attributes', kind: 'json' },
    { column: 'relationships', kind: 'json' },
    { column: 'raw', kind: 'json' },
  ];

  private static readonly SNAPSHOT_UPSERT_BATCH_SIZE = 100;

  /**
   * Batched upsert of resource snapshots via a single multi-row
   * `INSERT ... ON CONFLICT ("resourceType", "resourceId") DO UPDATE`
   * statement per chunk, replacing per-row Prisma `upsert()` calls.
   * All values are bound as parameters (or emitted as fixed SQL fragments
   * built from a static column list) — no user value is string-concatenated.
   */
  private async upsertResourceSnapshots(
    tx: Prisma.TransactionClient,
    resources: CatalogResource[],
    preserveImportedRaw: boolean,
  ): Promise<void> {
    if (resources.length === 0) return;

    const columns = RecommendationsService.SNAPSHOT_UPSERT_COLUMNS;

    const insertColumns = Prisma.join([
      Prisma.raw('"id"'),
      Prisma.raw('"resourceType"'),
      Prisma.raw('"resourceId"'),
      ...columns.map((definition) => Prisma.raw(`"${definition.column}"`)),
      Prisma.raw('"updatedAt"'),
    ]);

    const updateAssignments = Prisma.join([
      ...columns.map((definition) =>
        Prisma.raw(`"${definition.column}" = EXCLUDED."${definition.column}"`),
      ),
      Prisma.raw('"updatedAt" = now()'),
    ]);

    const batchSize = RecommendationsService.SNAPSHOT_UPSERT_BATCH_SIZE;
    for (let start = 0; start < resources.length; start += batchSize) {
      const chunk = resources.slice(start, start + batchSize);
      const rows = chunk.map((resource) => {
        const data = this.resourceSnapshotData(
          resource,
          preserveImportedRaw,
        ) as Record<string, unknown>;
        const values = columns.map((definition) =>
          this.snapshotValueFragment(definition.kind, data[definition.column]),
        );
        return Prisma.sql`(${Prisma.join([
          Prisma.sql`${randomUUID()}`,
          Prisma.sql`${resource.type}`,
          Prisma.sql`${resource.id}`,
          ...values,
          Prisma.raw('now()'),
        ])})`;
      });

      await tx.$executeRaw`
        INSERT INTO "recommendation_resource_snapshots" (${insertColumns})
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("resourceType", "resourceId") DO UPDATE SET ${updateAssignments}
      `;
    }
  }

  private snapshotValueFragment(
    kind: 'text' | 'int' | 'bool' | 'array' | 'json',
    value: unknown,
  ): Prisma.Sql {
    switch (kind) {
      case 'array': {
        const items = Array.isArray(value) ? (value as string[]) : [];
        return items.length
          ? Prisma.sql`ARRAY[${Prisma.join(items)}]::text[]`
          : Prisma.sql`ARRAY[]::text[]`;
      }
      case 'json':
        return value === Prisma.DbNull ||
          value === null ||
          value === undefined
          ? Prisma.sql`NULL`
          : Prisma.sql`${JSON.stringify(value)}::jsonb`;
      default:
        return Prisma.sql`${value}`;
    }
  }

  private resolveDisplayKind(section: RecommendationSectionRecord): string {
    if (
      section.presentationMode !== PrismaPresentationMode.AUTO &&
      section.displayKind
    ) {
      return section.displayKind;
    }

    const contentItems = section.items.filter((item) => !item.isPrimary);
    const items = contentItems.length ? contentItems : section.items;
    const resourceTypes = new Set(
      items.map((item) => item.resourceType),
    );
    const hasPrimaryVideo = section.items.some(
      (item) =>
        item.isPrimary &&
        this.jsonValue(item.resource?.editorialVideo) !== undefined,
    );

    if (hasPrimaryVideo) {
      return 'MusicSuperHeroShelf';
    }
    if (resourceTypes.size === 1 && resourceTypes.has('stations')) {
      return 'MusicCircleCoverShelf';
    }
    if (
      resourceTypes.size === 1 &&
      resourceTypes.has('editorial-items')
    ) {
      return 'MusicSocialCardShelf';
    }
    if (items.length >= 8 && resourceTypes.size > 1) {
      return 'MusicCoverShelf';
    }

    return DEFAULT_DISPLAY_KIND;
  }

  private pageScope(value: RecommendationPageScope): PrismaPageScope {
    switch (value) {
      case RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_GLOBAL:
        return PrismaPageScope.GLOBAL;
      case RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER:
      case RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_UNSPECIFIED:
        return PrismaPageScope.USER;
      default:
        this.invalidArgument('scope is invalid');
    }
  }

  private pageStatus(value: RecommendationPageStatus): PrismaPageStatus {
    switch (value) {
      case RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_DRAFT:
        return PrismaPageStatus.DRAFT;
      case RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_ARCHIVED:
        return PrismaPageStatus.ARCHIVED;
      case RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_PUBLISHED:
      case RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_UNSPECIFIED:
        return PrismaPageStatus.PUBLISHED;
      default:
        this.invalidArgument('status is invalid');
    }
  }

  private presentationMode(
    value: RecommendationPresentationMode,
  ): PrismaPresentationMode {
    switch (value) {
      case RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_AUTO:
        return PrismaPresentationMode.AUTO;
      case RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_FIXED:
      case RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_UNSPECIFIED:
        return PrismaPresentationMode.FIXED;
      default:
        this.invalidArgument('presentation_mode is invalid');
    }
  }

  private userScopeKey(userId: string): string {
    return `USER:${userId}`;
  }

  private pageTimezone(
    scope: PrismaPageScope,
    requestedTimezone: string,
  ): string {
    return scope === PrismaPageScope.GLOBAL
      ? GLOBAL_TIMEZONE
      : requestedTimezone;
  }

  private coldStartScore(
    userId: string,
    sectionId: string,
    resourceId: string,
    refreshWindow: number,
  ): number {
    const value = `${userId}\u001f${sectionId}\u001f${resourceId}\u001f${refreshWindow}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private optionalString(
    value: unknown,
    field: string,
    maxLength: number,
  ): void {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (typeof value !== 'string') {
      this.invalidArgument(`${field} must be a string`);
    }

    if (value.length > maxLength) {
      this.invalidArgument(`${field} must not exceed ${maxLength} characters`);
    }
  }

  private optionalBoolean(value: unknown, field: string): void {
    if (value === undefined || value === null) {
      return;
    }

    if (typeof value !== 'boolean') {
      this.invalidArgument(`${field} must be a boolean`);
    }
  }

  private optionalNonNegativeInteger(value: unknown, field: string): void {
    if (value === undefined || value === null) {
      return;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      this.invalidArgument(`${field} must be a non-negative integer`);
    }
  }

  private optionalStringArray(
    value: unknown,
    field: string,
    maxItemLength: number,
  ): void {
    if (value === undefined || value === null) {
      return;
    }

    if (!Array.isArray(value)) {
      this.invalidArgument(`${field} must be an array`);
    }

    if (value.length > MAX_ARRAY_ITEMS) {
      this.invalidArgument(
        `${field} must contain at most ${MAX_ARRAY_ITEMS} entries`,
      );
    }

    for (const item of value) {
      if (typeof item !== 'string') {
        this.invalidArgument(`${field} must contain only strings`);
      }
      if (item.length > maxItemLength) {
        this.invalidArgument(
          `${field} entries must not exceed ${maxItemLength} characters`,
        );
      }
    }
  }

  private optionalStringOrStringArray(
    value: unknown,
    field: string,
    maxItemLength: number,
  ): void {
    if (typeof value === 'string') {
      this.optionalString(value, field, maxItemLength);
      return;
    }

    this.optionalStringArray(value, field, maxItemLength);
  }

  private validateArtwork(artwork: Record<string, unknown>): void {
    this.optionalString(artwork.url, 'resource.attributes.artwork.url', 1_000);

    for (const field of [
      'bgColor',
      'textColor1',
      'textColor2',
      'textColor3',
      'textColor4',
    ] as const) {
      this.optionalString(
        artwork[field],
        `resource.attributes.artwork.${field}`,
        16,
      );
    }

    this.optionalNonNegativeInteger(
      artwork.width,
      'resource.attributes.artwork.width',
    );
    this.optionalNonNegativeInteger(
      artwork.height,
      'resource.attributes.artwork.height',
    );
  }

  private validateTextObject(
    value: unknown,
    field: string,
    includesName: boolean,
  ): void {
    if (value === undefined || value === null) {
      return;
    }

    if (!this.isJsonObject(value)) {
      this.invalidArgument(`${field} must be an object`);
    }

    if (includesName) {
      this.optionalString(value.name, `${field}.name`, 255);
    }
    this.optionalString(value.short, `${field}.short`, MAX_TEXT_LENGTH);
    this.optionalString(value.standard, `${field}.standard`, MAX_TEXT_LENGTH);
  }

  private validateJsonSize(value: unknown, field: string): void {
    const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
    if (size > MAX_JSON_FIELD_BYTES) {
      this.invalidArgument(
        `${field} must not exceed ${MAX_JSON_FIELD_BYTES} bytes`,
      );
    }
  }

  private requireText(value: string, field: string, maxLength: number): void {
    if (!value.trim()) {
      this.invalidArgument(`${field} is required`);
    }

    if (value.length > maxLength) {
      this.invalidArgument(`${field} must not exceed ${maxLength} characters`);
    }
  }

  private validateResourceType(resourceType: string): void {
    if (!SUPPORTED_RESOURCE_TYPES.has(resourceType)) {
      this.invalidArgument(`unsupported resource type: ${resourceType}`);
    }
  }

  private toInputJson(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private toNullableInputJson(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (value === undefined || value === null) {
      return Prisma.DbNull;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private parseDate(value: string): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      this.invalidArgument('section.attributes.next_update_date is invalid');
    }

    return date;
  }

  private normalizeColor(value: string): string {
    return value.startsWith('#') ? value.slice(1) : value;
  }

  private stripHash(color: string): string {
    return color.startsWith('#') ? color.slice(1) : color;
  }

  private artworkTextColor(
    artwork: Record<string, unknown> | undefined,
    index: 1 | 2 | 3 | 4,
  ): string {
    if (!artwork) {
      return '';
    }

    return (
      this.stringValue(artwork[`textColor${index}`]) ||
      this.stringValue(artwork[`textColor_${index}`])
    );
  }

  private responseArtwork(
    resource: RecommendationItemRecord['resource'],
  ): Record<string, unknown> | undefined {
    if (
      !resource?.artworkUrl &&
      !resource?.artworkWidth &&
      !resource?.artworkHeight
    ) {
      return undefined;
    }

    const storedAttributes = this.objectValue(this.jsonValue(resource?.attributes));
    const storedArtwork = this.objectValue(storedAttributes?.artwork);
    const variants = this.jsonValue(storedArtwork?.variants);

    return this.compactObject({
      url: resource.artworkUrl || undefined,
      bgColor: this.stripHash(
        resource.artworkBgColor || resource.bgColor || '',
      ),
      textColor1: this.stripHash(resource.textColor1) || undefined,
      textColor2: this.stripHash(resource.textColor2) || undefined,
      textColor3: this.stripHash(resource.textColor3) || undefined,
      textColor4: this.stripHash(resource.textColor4) || undefined,
      width: resource.artworkWidth,
      height: resource.artworkHeight,
      variants,
    });
  }

  private editorialNotes(
    resource: RecommendationItemRecord['resource'],
  ): Record<string, unknown> | undefined {
    if (
      !resource?.editorialNotesName &&
      !resource?.editorialNotesShort &&
      !resource?.editorialNotes
    ) {
      return undefined;
    }

    return this.compactObject({
      name: resource.editorialNotesName || undefined,
      short: resource.editorialNotesShort || undefined,
      standard: resource.editorialNotes || undefined,
    });
  }

  private description(
    resource: RecommendationItemRecord['resource'],
  ): Record<string, unknown> | undefined {
    if (!resource?.shortDescription && !resource?.standardDescription) {
      return undefined;
    }

    return this.compactObject({
      short: resource.shortDescription || undefined,
      standard: resource.standardDescription || undefined,
    });
  }

  private defaultPlayParams(
    resourceType: string,
    resourceId: string,
  ): Record<string, string> {
    const kindByType: Record<string, string> = {
      albums: 'album',
      playlists: 'playlist',
      stations: 'radioStation',
      artists: 'artist',
      songs: 'song',
    };

    return {
      id: resourceId,
      kind: kindByType[resourceType] ?? resourceType,
    };
  }

  private jsonValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value));
  }

  private jsonObject(value: unknown): Record<string, unknown> | undefined {
    return this.isJsonObject(value)
      ? (this.jsonValue(value) as Record<string, unknown>)
      : undefined;
  }

  private wrapStruct(value: Record<string, unknown>): Record<string, unknown> {
    return {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.wrapStructValue(item),
        ]),
      ),
    };
  }

  private wrapOptionalStruct(
    value: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    return value ? this.wrapStruct(value) : undefined;
  }

  private unwrapStruct(value: unknown): Record<string, unknown> {
    if (this.isStructLike(value)) {
      return Object.fromEntries(
        Object.entries(value.fields).map(([key, item]) => [
          key,
          this.unwrapStructValue(item),
        ]),
      );
    }

    return this.isJsonObject(value) ? value : {};
  }

  private unwrapOptionalStruct(
    value: unknown,
  ): Record<string, unknown> | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const unwrapped = this.unwrapStruct(value);
    return Object.keys(unwrapped).length > 0 ? unwrapped : undefined;
  }

  private isStructLike(
    value: unknown,
  ): value is { fields: Record<string, unknown> } {
    return this.isJsonObject(value) && this.isJsonObject(value.fields);
  }

  private wrapStructValue(value: unknown): Record<string, unknown> {
    if (value === null) {
      return { nullValue: 0 };
    }

    if (Array.isArray(value)) {
      return {
        listValue: {
          values: value.map((item) => this.wrapStructValue(item)),
        },
      };
    }

    if (this.isJsonObject(value)) {
      return { structValue: this.wrapStruct(value) };
    }

    switch (typeof value) {
      case 'number':
        return { numberValue: value };
      case 'boolean':
        return { boolValue: value };
      case 'string':
        return { stringValue: value };
      default:
        return { nullValue: 0 };
    }
  }

  private unwrapStructValue(value: unknown): unknown {
    if (!this.isJsonObject(value)) {
      return null;
    }

    if ('stringValue' in value) {
      return value.stringValue;
    }
    if ('numberValue' in value) {
      return value.numberValue;
    }
    if ('boolValue' in value) {
      return value.boolValue;
    }
    if ('structValue' in value) {
      return this.unwrapStruct(value.structValue);
    }
    if ('listValue' in value) {
      const listValue = this.objectValue(value.listValue);
      const values = listValue?.values;
      return Array.isArray(values)
        ? values.map((item) => this.unwrapStructValue(item))
        : [];
    }

    return null;
  }

  private objectValue(value: unknown): Record<string, unknown> | undefined {
    return this.isJsonObject(value) ? value : undefined;
  }

  private isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private compactObject(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    );
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private list<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
  }

  private stringOrStringArrayValue(value: unknown): string[] {
    if (typeof value === 'string') {
      return value ? [value] : [];
    }

    return this.stringArrayValue(value);
  }

  private stringArrayValue(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private numberValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private booleanValue(value: unknown): boolean {
    return typeof value === 'boolean' ? value : false;
  }

  private resourceKey(resourceType: string, resourceId: string): string {
    return `${resourceType}:${resourceId}`;
  }

  private isSystemGeneratedRef(ref: { type: string; id: string }): boolean {
    return (
      (ref.type === 'playlists' && SYSTEM_DAILY_MIX_ID_PATTERN.test(ref.id)) ||
      (ref.type === 'stations' && SYSTEM_STATION_ID_PATTERN.test(ref.id))
    );
  }

  private async executePersistence<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
          case 'P2002':
            return this.persistenceError(
              status.ALREADY_EXISTS,
              'Recommendation data already exists',
              error,
            );
          case 'P2003':
            return this.persistenceError(
              status.FAILED_PRECONDITION,
              'Recommendation data violates a relationship constraint',
              error,
            );
          case 'P2024':
            return this.persistenceError(
              status.UNAVAILABLE,
              'Recommendation database is temporarily unavailable',
              error,
            );
          case 'P2034':
            return this.persistenceError(
              status.ABORTED,
              'Recommendation update conflicted with another request',
              error,
            );
        }
      }

      this.persistenceError(
        status.INTERNAL,
        'Recommendation persistence operation failed',
        error,
      );
    }
  }

  private persistenceError(
    code: status,
    message: string,
    cause: unknown,
  ): never {
    this.logger.error(
      message,
      cause instanceof Error ? cause.stack : String(cause),
    );

    throw new RpcException({ code, message });
  }

  private invalidArgument(message: string): never {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message,
    });
  }
}
