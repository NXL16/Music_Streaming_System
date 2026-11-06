import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  CatalogResource,
  GetHomeRecommendationsRequest,
  GetHomeRecommendationsResponse,
  GetRecommendationSectionRequest,
  GetAlbumRelatedRecommendationsRequest,
  GetAlbumRelatedRecommendationsResponse,
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
  GetRecommendationQualityAnalyticsRequest,
  RecommendationQualityAnalyticsResponse,
  SystemStationArtworkResponse,
  UpsertSystemStationArtworkRequest,
  SystemPlaylistArtworkResponse,
  UpsertSystemPlaylistArtworkRequest,
  SetSystemPlaylistArtworkColorRequest,
  CleanupPlaylistHistoryRequest,
  CleanupPlaylistHistoryResponse,
  RecordPreferenceEventRequest,
  RecordPreferenceEventResponse,
  ListContentPreferencesRequest,
  ListContentPreferencesResponse,
  SetArtistFollowRequest,
  GetArtistFollowRequest,
  ArtistFollowResponse,
  CreateSongStationRequest,
  GetSongStationRequest,
  SongStationResponse,
  GetSongStationTracksRequest,
  SongStationTracksResponse,
  CreateArtistStationRequest,
  GetArtistStationRequest,
  ArtistStationResponse,
  GetArtistStationTracksRequest,
  GetSystemPlaylistTracksRequest,
  SystemPlaylistTracksResponse,
} from '@musical/shared-proto';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';
import { ConfigService } from '@nestjs/config';
import { Metadata } from '@grpc/grpc-js';
import { unwrapStructOutput } from '../common/utils/protobuf-struct';

// Generation resolves and snapshots a whole Home page. It is intentionally
// allowed more time than read and interaction RPCs, which must stay snappy.
const ADMIN_GENERATION_TIMEOUT_MS = 30_000;
const PREFERENCE_RETRY_QUEUE = 'recommendation:preference-events:retry';
const PREFERENCE_PROCESSING_QUEUE =
  'recommendation:preference-events:processing';

@Injectable()
export class RecommendationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecommendationsService.name);
  private recommendationClient!: RecommendationServiceClient;

  constructor(
    @Inject('RECOMMENDATION_SERVICE')
    private readonly client: ClientGrpc,
    private readonly configService: ConfigService,
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
  ) {}

  private retryTimer?: NodeJS.Timeout;

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
    this.retryTimer = setInterval(
      () => void this.retryPreferenceEvents(),
      5_000,
    );
    void this.recoverInFlightPreferenceEvents();
  }

  onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  async cleanupPlaylistHistory(
    request: CleanupPlaylistHistoryRequest,
  ): Promise<CleanupPlaylistHistoryResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.cleanupPlaylistHistory(
        request,
        this.metadata(),
      ),
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

  async getAlbumRelatedRecommendations(
    request: GetAlbumRelatedRecommendationsRequest,
  ): Promise<GetAlbumRelatedRecommendationsResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.getAlbumRelatedRecommendations(
        request,
        this.metadata(),
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

  async recordPreferenceEvent(
    request: RecordPreferenceEventRequest,
  ): Promise<RecordPreferenceEventResponse> {
    try {
      return await grpcFirstValueFrom(
        this.recommendationClient.recordPreferenceEvent(
          request,
          this.metadata(),
        ),
      );
    } catch (error) {
      // Preference delivery is asynchronous product telemetry. A temporary
      // Recommendation outage must never roll back a completed Library or
      // Favourite operation in its owning service.
      this.logger.warn(
        `Preference event delivery failed: ${request.eventId}`,
        error,
      );
      await this.redis
        .lpush(PREFERENCE_RETRY_QUEUE, JSON.stringify(request))
        .catch(() => undefined);
      return { success: false };
    }
  }

  async listContentPreferences(
    userId: string,
  ): Promise<ListContentPreferencesResponse> {
    const request: ListContentPreferencesRequest = { userId };
    return grpcFirstValueFrom(
      this.recommendationClient.listContentPreferences(
        request,
        this.metadata(),
      ),
    );
  }

  private async retryPreferenceEvents() {
    for (let index = 0; index < 24; index += 1) {
      const raw = (await this.redis
        .call(
          'LMOVE',
          PREFERENCE_RETRY_QUEUE,
          PREFERENCE_PROCESSING_QUEUE,
          'RIGHT',
          'LEFT',
        )
        .catch(() => null)) as string | null;
      if (!raw) return;
      try {
        const request = JSON.parse(raw) as RecordPreferenceEventRequest;
        const result = await grpcFirstValueFrom(
          this.recommendationClient.recordPreferenceEvent(
            request,
            this.metadata(),
          ),
        );
        if (result.success) {
          await this.redis.lrem(PREFERENCE_PROCESSING_QUEUE, 1, raw);
        } else {
          await this.releasePreferenceEvent(raw);
        }
      } catch {
        await this.releasePreferenceEvent(raw);
        return;
      }
    }
  }

  private async releasePreferenceEvent(raw: string) {
    await this.redis
      .lrem(PREFERENCE_PROCESSING_QUEUE, 1, raw)
      .catch(() => undefined);
    await this.redis.lpush(PREFERENCE_RETRY_QUEUE, raw).catch(() => undefined);
  }

  private async recoverInFlightPreferenceEvents() {
    for (;;) {
      const raw = await this.redis
        .rpop(PREFERENCE_PROCESSING_QUEUE)
        .catch(() => null);
      if (!raw) return;
      await this.redis
        .lpush(PREFERENCE_RETRY_QUEUE, raw)
        .catch(() => undefined);
    }
  }

  async setArtistFollow(
    userId: string,
    artistId: string,
    isFollowed: boolean,
  ): Promise<ArtistFollowResponse> {
    const request: SetArtistFollowRequest = { userId, artistId, isFollowed };
    return grpcFirstValueFrom(
      this.recommendationClient.setArtistFollow(request, this.metadata()),
    );
  }

  async isArtistFollowed(
    userId: string,
    artistId: string,
  ): Promise<ArtistFollowResponse> {
    const request: GetArtistFollowRequest = { userId, artistId };
    return grpcFirstValueFrom(
      this.recommendationClient.getArtistFollow(request, this.metadata()),
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
        ADMIN_GENERATION_TIMEOUT_MS,
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

  async getRecommendationQualityAnalytics(
    request: GetRecommendationQualityAnalyticsRequest,
  ): Promise<RecommendationQualityAnalyticsResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.getRecommendationQualityAnalytics(
        request,
        this.metadata(),
      ),
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

  upsertSystemPlaylistArtwork(
    request: UpsertSystemPlaylistArtworkRequest,
  ): Promise<SystemPlaylistArtworkResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.upsertSystemPlaylistArtwork(request, this.metadata()),
    );
  }
  setSystemPlaylistArtworkColor(
    request: SetSystemPlaylistArtworkColorRequest,
  ): Promise<SystemPlaylistArtworkResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.setSystemPlaylistArtworkColor(request, this.metadata()),
    );
  }

  createSongStation(
    request: CreateSongStationRequest,
  ): Promise<SongStationResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.createSongStation(request, this.metadata()),
    );
  }

  getSongStation(request: GetSongStationRequest): Promise<SongStationResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.getSongStation(request, this.metadata()),
    );
  }

  getSongStationTracks(
    request: GetSongStationTracksRequest,
  ): Promise<SongStationTracksResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.getSongStationTracks(request, this.metadata()),
    );
  }

  createArtistStation(
    request: CreateArtistStationRequest,
  ): Promise<ArtistStationResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.createArtistStation(request, this.metadata()),
    );
  }

  getArtistStation(
    request: GetArtistStationRequest,
  ): Promise<ArtistStationResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.getArtistStation(request, this.metadata()),
    );
  }

  getArtistStationTracks(
    request: GetArtistStationTracksRequest,
  ): Promise<SongStationTracksResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.getArtistStationTracks(
        request,
        this.metadata(),
      ),
    );
  }

  getSystemPlaylistTracks(
    request: GetSystemPlaylistTracksRequest,
  ): Promise<SystemPlaylistTracksResponse> {
    return grpcFirstValueFrom(
      this.recommendationClient.getSystemPlaylistTracks(
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
