import { Injectable, Logger } from '@nestjs/common';
import {
  CatalogResource,
  GetHomeRecommendationsRequest,
  GetHomeRecommendationsResponse,
  GetRecommendationSectionRequest,
  PersonalRecommendationResource,
  RecommendationRef,
  RecommendationResources,
  ReplaceHomeRecommendationsRequest,
  RefreshRecommendationSectionRequest,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Prisma } from '../generated/prisma/client';

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
    isMasteredForItunes: boolean;
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
    relationships: unknown;
    raw: unknown;
  } | null;
};

type RecommendationSectionRecord = {
  externalId: string;
  title: string;
  titleWithoutName: string;
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

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getHomeRecommendations(
    request: GetHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const page = await this.executePersistence(() =>
      this.prisma.recommendationPage.findUnique({
        where: {
          userId_name_locale_timezone: {
            userId: request.userId,
            name: request.name || 'listen-now',
            locale: request.locale || 'en-GB',
            timezone: request.timezone || '+07:00',
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
        },
      }),
    );

    if (!page) {
      return this.emptyResponse(request);
    }

    const sections = page.sections as RecommendationSectionRecord[];

    return {
      data: sections.map((section) => this.sectionRef(section, page.name)),
      resources: this.buildResources(sections, page.name),
      meta: {
        name: page.name,
        locale: page.locale,
        timezone: page.timezone,
        platform: request.platform || 'web',
      },
    };
  }

  async getRecommendationSection(
    request: GetRecommendationSectionRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const section = await this.executePersistence(() =>
      this.prisma.recommendationSection.findFirst({
        where: {
          externalId: request.sectionId,
          page: {
            userId: request.userId,
            name: request.name || 'listen-now',
            locale: request.locale || 'en-GB',
            timezone: request.timezone || '+07:00',
          },
        },
        include: {
          page: true,
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { resource: true },
          },
        },
      }),
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
        timezone: section.page.timezone,
        platform: 'web',
      },
    };
  }

  refreshRecommendationSection(
    request: RefreshRecommendationSectionRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    void request;
    return Promise.reject(
      new RpcException({
        code: status.UNIMPLEMENTED,
        message: 'Recommendation refresh is not configured',
      }),
    );
  }

  async replaceHomeRecommendations(
    request: ReplaceHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    this.validateReplacement(request);

    const name = request.name || 'listen-now';
    const locale = request.locale || 'en-GB';
    const timezone = request.timezone || '+07:00';

    const pageLockKey = [request.userId, name, locale, timezone].join('\u001f');

    await this.executePersistence(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw<Array<{ lock: string | null }>>`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${pageLockKey}, 0)
            )::text AS "lock"
          `;

          for (const resource of request.resources) {
            const data = this.resourceSnapshotData(resource);

            await tx.recommendationResourceSnapshot.upsert({
              where: {
                resourceType_resourceId: {
                  resourceType: resource.type,
                  resourceId: resource.id,
                },
              },
              create: {
                resourceType: resource.type,
                resourceId: resource.id,
                ...data,
              },
              update: data,
            });
          }

          const page = await tx.recommendationPage.upsert({
            where: {
              userId_name_locale_timezone: {
                userId: request.userId,
                name,
                locale,
                timezone,
              },
            },
            create: {
              userId: request.userId,
              name,
              locale,
              timezone,
            },
            update: {},
          });

          await tx.recommendationSection.deleteMany({
            where: { pageId: page.id },
          });

          for (const [sectionIndex, section] of request.sections.entries()) {
            const attributes = section.attributes!;
            const relationships = section.relationships;
            const contents = relationships?.contents?.data ?? [];
            const primaryContent = relationships?.primaryContent?.data ?? [];

            await tx.recommendationSection.create({
              data: {
                pageId: page.id,
                externalId: section.id,
                title: attributes.title?.stringForDisplay ?? '',
                titleWithoutName:
                  attributes.titleWithoutName?.stringForDisplay ?? '',
                displayKind: attributes.display!.kind,
                displayDecorations: attributes.display?.decorations ?? [],
                sectionKind: attributes.kind || 'music-recommendations',
                resourceTypes: attributes.resourceTypes,
                hasSeeAll: attributes.hasSeeAll,
                isGroupRecommendation: attributes.isGroupRecommendation,
                sortOrder: sectionIndex,
                nextUpdateAt: this.parseDate(attributes.nextUpdateDate),
                version: attributes.version || 1,
                attributes: this.toInputJson(attributes),
                relationships: relationships
                  ? this.toInputJson(relationships)
                  : Prisma.DbNull,
                raw: this.toInputJson(section),
                items: {
                  create: [
                    ...contents.map((item, itemIndex) => ({
                      resourceType: item.type,
                      resourceId: item.id,
                      sortOrder: itemIndex,
                      isPrimary: false,
                    })),
                    ...primaryContent.map((item, itemIndex) => ({
                      resourceType: item.type,
                      resourceId: item.id,
                      sortOrder: itemIndex,
                      isPrimary: true,
                    })),
                  ],
                },
              },
            });
          }
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        },
      ),
    );

    return this.getHomeRecommendations({
      userId: request.userId,
      name,
      locale,
      timezone,
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

  private buildResources(
    sections: RecommendationSectionRecord[],
    pageName: string,
  ): RecommendationResources {
    const resources = this.emptyResources();

    for (const section of sections) {
      resources.personalRecommendation[section.externalId] =
        this.mapSectionResource(section, pageName);

      for (const item of section.items) {
        const catalogResource = this.mapCatalogResource(item);
        const bucket = this.getCatalogBucket(resources, item.resourceType);

        if (bucket) {
          bucket[item.resourceId] = catalogResource;
        }
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
          kind: section.displayKind,
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

  private mapCatalogResource(item: RecommendationItemRecord): CatalogResource {
    const resource = item.resource;
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
        this.jsonObject(resource?.relationships),
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
          isMasteredForItunes: resource?.isMasteredForItunes ?? false,
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
    this.requireText(request.userId, 'user_id', 128);
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
      this.validateSection(section, resourceKeys);

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
    if (typeof attributes.name !== 'string') {
      this.invalidArgument('resource.attributes.name must be a string');
    }
    this.requireText(attributes.name, 'resource.attributes.name', 255);
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
    this.optionalStringArray(
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
      'isMasteredForItunes',
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
    resourceKeys: Set<string>,
  ): void {
    this.requireText(section.id, 'section.id', 128);

    if (section.type && section.type !== 'personal-recommendation') {
      this.invalidArgument(
        `section ${section.id} must have type personal-recommendation`,
      );
    }

    const attributes = section.attributes;
    const display = attributes?.display;

    if (!attributes || !display?.kind) {
      this.invalidArgument(`section ${section.id} is missing display.kind`);
    }

    this.requireText(
      display.kind,
      `section ${section.id} display.kind`,
      64,
    );
    this.optionalString(
      attributes.kind,
      `section ${section.id} attributes.kind`,
      64,
    );
    this.optionalStringArray(
      display.decorations,
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
        if (!resourceKeys.has(resourceKey)) {
          this.invalidArgument(
            `section ${section.id} references missing resource ${resourceKey}`,
          );
        }

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

  private resourceSnapshotData(resource: CatalogResource) {
    const attributes = this.unwrapStruct(resource.attributes!);
    const relationships = this.unwrapOptionalStruct(resource.relationships);
    const artwork = this.objectValue(attributes.artwork);
    const plainEditorialNotes = this.objectValue(
      attributes.plainEditorialNotes,
    );
    const description = this.objectValue(attributes.description);
    const link = this.objectValue(attributes.link);

    return {
      name: this.stringValue(attributes.name),
      title: this.stringValue(attributes.name),
      subtitle:
        this.stringValue(attributes.artistName) ||
        this.stringValue(attributes.curatorName),
      href: resource.href,
      externalUrl: this.stringValue(attributes.url),
      artistName: this.stringValue(attributes.artistName),
      artistNames: this.stringArrayValue(attributes.artistNames),
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
      isMasteredForItunes: this.booleanValue(attributes.isMasteredForItunes),
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
      relationships: this.toNullableInputJson(relationships),
      raw: Prisma.DbNull,
    };
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
