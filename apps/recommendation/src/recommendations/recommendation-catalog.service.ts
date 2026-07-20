import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import {
  CatalogResource,
  CatalogResponse,
  BrowseCatalogResponse,
  SongServiceClient,
} from '@musical/shared-proto';
import { firstValueFrom } from 'rxjs';

type ResourceRef = {
  type: string;
  id: string;
};

export type CatalogBrowsePage = {
  resources: CatalogResource[];
  nextCursor: string;
  hasMore: boolean;
};

type JsonObject = Record<string, unknown>;

const CATALOG_RESOURCE_TYPES = new Set([
  'albums',
  'playlists',
  'songs',
  'artists',
]);
const MAX_SHORT_TEXT_LENGTH = 255;

const LIMITED_STRING_FIELDS = new Set([
  'artistName',
  'curatorName',
  'recordLabel',
  'contentRating',
  'releaseDate',
  'upc',
  'playlistType',
  'editorialPlaylistKind',
  'lastModifiedDate',
  'kind',
  'mediaKind',
]);

const LIMITED_STRING_ARRAY_FIELDS = new Set([
  'artistNames',
  'audioTraits',
  'genreNames',
]);

@Injectable()
export class RecommendationCatalogService implements OnModuleInit {
  private client!: SongServiceClient;

  constructor(
    @Inject('SONG_SERVICE')
    private readonly grpcClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.client =
      this.grpcClient.getService<SongServiceClient>('SongService');
  }

  supports(resourceType: string): boolean {
    return CATALOG_RESOURCE_TYPES.has(resourceType);
  }

  async resolve(
    refs: ResourceRef[],
    storefront = 'vn',
  ): Promise<CatalogResource[]> {
    const resources = refs.filter((ref) =>
      CATALOG_RESOURCE_TYPES.has(ref.type),
    );
    if (resources.length === 0) return [];

    let response: CatalogResponse;
    try {
      response = await firstValueFrom(
        this.client.getCatalogResources({ storefront, resources }),
      );
    } catch {
      throw new RpcException({
        code: status.UNAVAILABLE,
        message: 'Catalog service is temporarily unavailable',
      });
    }

    return this.flatten(response);
  }

  async browse(
    resourceType: string,
    limit = 20,
    sort = 'latest',
    storefront = 'vn',
  ): Promise<CatalogResource[]> {
    return (
      await this.browsePage(resourceType, limit, sort, storefront)
    ).resources;
  }

  async browsePage(
    resourceType: string,
    limit = 100,
    sort = 'latest',
    storefront = 'vn',
    cursor = '',
  ): Promise<CatalogBrowsePage> {
    let response: BrowseCatalogResponse;
    try {
      response = await firstValueFrom(
        this.client.browseCatalog({
          storefront,
          resourceType,
          limit,
          sort,
          cursor,
        }),
      );
    } catch {
      throw new RpcException({
        code: status.UNAVAILABLE,
        message: 'Catalog service is temporarily unavailable',
      });
    }

    return {
      resources: this.flatten(response),
      nextCursor: response.nextCursor || '',
      hasMore: Boolean(response.hasMore && response.nextCursor),
    };
  }

  private flatten(response: CatalogResponse): CatalogResource[] {
    const resources = response.resources;
    if (!resources) return [];

    return [
      ...Object.values(resources.albums ?? {}).map((resource) =>
        this.resource(
          resource.id,
          resource.type,
          resource.href,
          resource.attributes,
          resource.relationships,
        ),
      ),
      ...Object.values(resources.playlists ?? {}).map((resource) =>
        this.resource(
          resource.id,
          resource.type,
          resource.href,
          resource.attributes,
          resource.relationships,
        ),
      ),
      ...Object.values(resources.songs ?? {}).map((resource) =>
        this.resource(
          resource.id,
          resource.type,
          resource.href,
          resource.attributes,
          resource.relationships,
        ),
      ),
      ...Object.values(resources.artists ?? {}).map((resource) =>
        this.resource(
          resource.id,
          resource.type,
          resource.href,
          resource.attributes,
        ),
      ),
    ];
  }

  private resource(
    id: string,
    type: string,
    href: string,
    attributes: object | undefined,
    relationships?: object,
  ): CatalogResource {
    const normalizedAttributes = this.recommendationAttributes(
      type,
      attributes ?? {},
    );

    return {
      id,
      type,
      href,
      attributes: this.struct(normalizedAttributes),
      relationships: relationships
        ? this.struct(this.plainObject(relationships))
        : undefined,
    };
  }

  private recommendationAttributes(
    type: string,
    attributes: object,
  ): JsonObject {
    const normalized = this.plainObject(attributes);
    if (type === 'albums') {
      const { editorialNotes, ...albumAttributes } = normalized;
      return {
        ...albumAttributes,
        plainEditorialNotes:
          normalized.plainEditorialNotes ?? editorialNotes,
      };
    }

    if (type !== 'playlists') return normalized;

    const {
      descriptionShort,
      descriptionStandard,
      editorialNotes,
      ...playlistAttributes
    } = normalized;

    return {
      ...playlistAttributes,
      description: {
        short: descriptionShort ?? '',
        standard: descriptionStandard ?? '',
      },
      plainEditorialNotes:
        normalized.plainEditorialNotes ?? editorialNotes,
    };
  }

  private normalizeCatalogAttribute(key: string, value: unknown): unknown {
    if (LIMITED_STRING_FIELDS.has(key)) {
      return this.truncateString(value, MAX_SHORT_TEXT_LENGTH);
    }

    if (LIMITED_STRING_ARRAY_FIELDS.has(key)) {
      return this.truncateStringArray(value, MAX_SHORT_TEXT_LENGTH);
    }

    return value;
  }

  private truncateString(value: unknown, maxLength: number): unknown {
    if (typeof value !== 'string') return value;
    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }

  private truncateStringArray(value: unknown, maxItemLength: number): unknown {
    if (!Array.isArray(value)) return value;
    const values: unknown[] = value;
    return values.map((item) =>
      typeof item === 'string' && item.length > maxItemLength
        ? item.slice(0, maxItemLength)
        : item,
    );
  }

  private plainObject(value: object): JsonObject {
    if (this.isStruct(value)) {
      return Object.fromEntries(
        Object.entries(value.fields).map(([key, item]) => [
          key,
          this.normalizeCatalogAttribute(key, this.plainStructValue(item)),
        ]),
      );
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [
          key,
          this.normalizeCatalogAttribute(key, this.plainValue(item)),
        ]),
    );
  }

  private plainValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.plainValue(item));
    }
    if (value !== null && typeof value === 'object') {
      return this.plainObject(value);
    }
    return value;
  }

  private plainStructValue(value: unknown): unknown {
    if (!value || typeof value !== 'object') return null;
    const item = value as JsonObject;
    if (item.stringValue !== undefined) return item.stringValue;
    if (item.numberValue !== undefined) return item.numberValue;
    if (item.boolValue !== undefined) return item.boolValue;
    if (item.structValue && typeof item.structValue === 'object') {
      return this.plainObject(item.structValue);
    }
    if (item.listValue && typeof item.listValue === 'object') {
      const values = (item.listValue as JsonObject).values;
      return Array.isArray(values)
        ? values.map((entry) => this.plainStructValue(entry))
        : [];
    }
    return null;
  }

  private isStruct(value: object): value is { fields: JsonObject } {
    return (
      'fields' in value &&
      typeof value.fields === 'object' &&
      value.fields !== null &&
      !Array.isArray(value.fields)
    );
  }

  private struct(value: object): CatalogResource['attributes'] {
    return {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.structValue(item),
        ]),
      ),
    };
  }

  private structValue(value: unknown): JsonObject {
    if (value === null || value === undefined) {
      return { nullValue: 0 };
    }
    if (Array.isArray(value)) {
      return {
        listValue: {
          values: value.map((item) => this.structValue(item)),
        },
      };
    }
    if (typeof value === 'object') {
      return { structValue: this.struct(value) };
    }

    switch (typeof value) {
      case 'string':
        return { stringValue: value };
      case 'number':
        return { numberValue: value };
      case 'boolean':
        return { boolValue: value };
      default:
        return { nullValue: 0 };
    }
  }

  async resolveSongAlbums(
    songIds: string[],
  ): Promise<Map<string, { albumName: string; albumId?: string }>> {
    if (songIds.length === 0) return new Map();

    const refs = songIds.map((id) => ({ type: 'songs', id }));
    let resources: CatalogResource[];
    try {
      resources = await this.resolve(refs);
    } catch {
      return new Map();
    }

    const result = new Map<string, { albumName: string; albumId?: string }>();
    for (const resource of resources) {
      if (resource.type !== 'songs') continue;
      const attrs = this.plainObject(resource.attributes ?? { fields: {} });
      const albumName = attrs.albumName;
      if (!albumName || typeof albumName !== 'string') continue;

      let albumId: string | undefined;
      if (resource.relationships) {
        const rels = this.plainObject(resource.relationships);
        const albumsRel = rels.albums as
          | { data?: Array<{ id?: string }> }
          | undefined;
        const firstAlbum = albumsRel?.data?.[0];
        if (firstAlbum?.id && typeof firstAlbum.id === 'string') {
          albumId = firstAlbum.id;
        }
      }

      result.set(resource.id, { albumName, albumId });
    }
    return result;
  }
}
