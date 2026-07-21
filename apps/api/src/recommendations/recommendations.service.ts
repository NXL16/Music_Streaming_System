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
  RecordListeningEventRequest,
  RecordListeningEventResponse,
  RecordRecommendationInteractionRequest,
  RecordRecommendationInteractionResponse,
  GenerateRecommendationsRequest,
  GetListeningAnalyticsRequest,
  ListeningAnalyticsResponse,
  SystemStationArtworkResponse,
  UpsertSystemStationArtworkRequest,
} from '@musical/shared-proto';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';
import { ConfigService } from '@nestjs/config';
import { Metadata } from '@grpc/grpc-js';
import { unwrapStructOutput } from '../common/utils/protobuf-struct';

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
      await grpcFirstValueFrom(
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
      await grpcFirstValueFrom(
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
      await grpcFirstValueFrom(
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
      await grpcFirstValueFrom(
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
      await grpcFirstValueFrom(
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
      await grpcFirstValueFrom(
        this.recommendationClient.getRecommendationPageForAdmin(
          request,
          this.metadata(),
        ),
      ),
    );
  }

  async recordListeningEvent(
    request: RecordListeningEventRequest,
  ): Promise<RecordListeningEventResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.recordListeningEvent(request, this.metadata()),
    );
  }

  async recordRecommendationInteraction(
    request: RecordRecommendationInteractionRequest,
  ): Promise<RecordRecommendationInteractionResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.recordRecommendationInteraction(
        request,
        this.metadata(),
      ),
    );
  }

  async generateRecommendations(
    request: GenerateRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.normalizeResponse(
      await grpcFirstValueFrom(
        this.recommendationClient.generateRecommendations(
          request,
          this.metadata(),
        ),
      ),
    );
  }

  async getListeningAnalytics(
    request: GetListeningAnalyticsRequest,
  ): Promise<ListeningAnalyticsResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.getListeningAnalytics(request, this.metadata()),
    );
  }

  upsertSystemStationArtwork(
    request: UpsertSystemStationArtworkRequest,
  ): Promise<SystemStationArtworkResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.upsertSystemStationArtwork(
        request,
        this.metadata(),
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
          attributes: unwrapStructOutput(resource.attributes) ?? {},
          relationships: unwrapStructOutput(resource.relationships),
        },
      ]),
    );
  }
}
