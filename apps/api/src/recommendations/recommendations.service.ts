import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  CatalogResource,
  GetHomeRecommendationsRequest,
  GetHomeRecommendationsResponse,
  GetRecommendationSectionRequest,
  GetRecommendationPageForAdminRequest,
  PublishRecommendationPageRequest,
  RecommendationServiceClient,
  ReplaceHomeRecommendationsRequest,
  RefreshRecommendationSectionRequest,
} from '@musical/shared-proto';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { Metadata } from '@grpc/grpc-js';

@Injectable()
export class RecommendationsService implements OnModuleInit {
  private recommendationClient!: RecommendationServiceClient;

  constructor(
    @Inject('RECOMMENDATION_SERVICE')
    private readonly client: ClientGrpc,
    private readonly configService: ConfigService,
  ) {}

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set(
      'x-internal-token',
      this.configService.getOrThrow<string>('INTERNAL_GRPC_TOKEN'),
    );
    return metadata;
  }

  onModuleInit() {
    this.recommendationClient =
      this.client.getService<RecommendationServiceClient>(
        'RecommendationService',
      );
  }

  async getHomeRecommendations(
    request: GetHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.normalizeResponse(
      await firstValueFrom(
        this.recommendationClient.getHomeRecommendations(
          request,
          this.metadata(),
        ),
      ),
    );
  }

  async getRecommendationSection(
    request: GetRecommendationSectionRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.normalizeResponse(
      await firstValueFrom(
        this.recommendationClient.getRecommendationSection(
          request,
          this.metadata(),
        ),
      ),
    );
  }

  async refreshRecommendationSection(
    request: RefreshRecommendationSectionRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.normalizeResponse(
      await firstValueFrom(
        this.recommendationClient.refreshRecommendationSection(
          request,
          this.metadata(),
        ),
      ),
    );
  }

  async replaceHomeRecommendations(
    request: ReplaceHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.normalizeResponse(
      await firstValueFrom(
        this.recommendationClient.replaceHomeRecommendations(
          request,
          this.metadata(),
        ),
      ),
    );
  }

  async publishRecommendationPage(
    request: PublishRecommendationPageRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.normalizeResponse(
      await firstValueFrom(
        this.recommendationClient.publishRecommendationPage(
          request,
          this.metadata(),
        ),
      ),
    );
  }

  async getRecommendationPageForAdmin(
    request: GetRecommendationPageForAdminRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.normalizeResponse(
      await firstValueFrom(
        this.recommendationClient.getRecommendationPageForAdmin(
          request,
          this.metadata(),
        ),
      ),
    );
  }

  private normalizeResponse(
    response: GetHomeRecommendationsResponse,
  ): GetHomeRecommendationsResponse {
    if (!response.resources) {
      return response;
    }

    return {
      ...response,
      resources: {
        ...response.resources,
        albums: this.normalizeBucket(response.resources.albums),
        playlists: this.normalizeBucket(response.resources.playlists),
        stations: this.normalizeBucket(response.resources.stations),
        editorialItems: this.normalizeBucket(response.resources.editorialItems),
        artists: this.normalizeBucket(response.resources.artists),
        songs: this.normalizeBucket(response.resources.songs),
      },
    };
  }

  private normalizeBucket(
    bucket: Record<string, CatalogResource> | undefined,
  ): Record<string, CatalogResource> {
    if (!bucket) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(bucket).map(([id, resource]) => [
        id,
        {
          ...resource,
          attributes: this.unwrapStruct(resource.attributes),
          relationships: this.unwrapOptionalStruct(resource.relationships),
        },
      ]),
    );
  }

  private unwrapOptionalStruct(
    value: unknown,
  ): Record<string, unknown> | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return this.unwrapStruct(value);
  }

  private unwrapStruct(value: unknown): Record<string, unknown> {
    if (!this.isJsonObject(value)) {
      return {};
    }

    if (!this.isJsonObject(value.fields)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value.fields).map(([key, item]) => [
        key,
        this.unwrapStructValue(item),
      ]),
    );
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
      const listValue = this.isJsonObject(value.listValue)
        ? value.listValue
        : undefined;
      const values = listValue?.values;
      return Array.isArray(values)
        ? values.map((item) => this.unwrapStructValue(item))
        : [];
    }

    return null;
  }

  private isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
