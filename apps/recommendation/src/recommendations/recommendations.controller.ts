import { Controller, Logger, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  GetHomeRecommendationsRequest,
  GetHomeRecommendationsResponse,
  GetRecommendationSectionRequest,
  GetAlbumRelatedRecommendationsRequest,
  GetAlbumRelatedRecommendationsResponse,
  GetRecommendationPageForAdminRequest,
  PublishRecommendationPageRequest,
  RecommendationServiceController,
  RecommendationServiceControllerMethods,
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
  UpsertSystemStationArtworkRequest,
  SystemStationArtworkResponse,
  UpsertSystemPlaylistArtworkRequest,
  SetSystemPlaylistArtworkColorRequest,
  SystemPlaylistArtworkResponse,
  CleanupPlaylistHistoryRequest,
  CleanupPlaylistHistoryResponse,
  RecordPreferenceEventRequest,
  RecordPreferenceEventResponse,
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
import { RecommendationsService } from './recommendations.service';
import { ListeningService } from '../listening/listening.service';
import { GenerationService } from '../generation/generation.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';
import { RecommendationRpcMetricsInterceptor } from '../common/observability/recommendation-rpc-metrics.interceptor';
import { SystemStationArtworkService } from './system-station-artwork.service';
import { SystemPlaylistArtworkService } from './system-playlist-artwork.service';
import { developmentCacheDisabled } from '../common/configs/development-cache';
import { RecommendationEngineService } from '../generation/recommendation-engine.service';
import { PreferenceService } from '../preferences/preference.service';
import { SongStationService } from '../stations/song-station.service';
import { ArtistStationService } from '../stations/artist-station.service';

@Controller()
@UseGuards(InternalGrpcGuard)
@UseInterceptors(RecommendationRpcMetricsInterceptor)
@RecommendationServiceControllerMethods()
export class RecommendationsController implements RecommendationServiceController {
  private readonly logger = new Logger(RecommendationsController.name);

  constructor(
    private readonly recommendationsService: RecommendationsService,
    private readonly listeningService: ListeningService,
    private readonly generationService: GenerationService,
    private readonly systemStationArtworkService: SystemStationArtworkService,
    private readonly systemPlaylistArtworkService: SystemPlaylistArtworkService,
    private readonly recommendationEngine: RecommendationEngineService,
    private readonly preferenceService: PreferenceService,
    private readonly songStationService: SongStationService,
    private readonly artistStationService: ArtistStationService,
  ) { }

  async cleanupPlaylistHistory(
    request: CleanupPlaylistHistoryRequest,
  ): Promise<CleanupPlaylistHistoryResponse> {
    await this.listeningService.cleanupPlaylistHistory(
      request.userId,
      request.playlistId,
    );
    return { success: true };
  }

  createSongStation(
    request: CreateSongStationRequest,
  ): Promise<SongStationResponse> {
    return this.songStationService.create(
      request.userId,
      request.songId,
      request.sourceAlbumId,
      request.stationArtworkAssetId,
      request.stationArtworkBgColor,
    );
  }

  getSongStation(request: GetSongStationRequest): Promise<SongStationResponse> {
    return this.songStationService.get(request.userId, request.stationId);
  }

  getSongStationTracks(
    request: GetSongStationTracksRequest,
  ): Promise<SongStationTracksResponse> {
    return this.songStationService.getTracks(
      request.userId,
      request.stationId,
      request.excludedSongIds,
      request.limit,
    );
  }

  createArtistStation(
    request: CreateArtistStationRequest,
  ): Promise<ArtistStationResponse> {
    return this.artistStationService.create(
      request.userId,
      request.artistId,
      request.stationArtworkAssetId,
      request.stationArtworkBgColor,
      request.artistOnly,
    );
  }

  getArtistStation(
    request: GetArtistStationRequest,
  ): Promise<ArtistStationResponse> {
    return this.artistStationService.get(request.userId, request.stationId);
  }

  getArtistStationTracks(
    request: GetArtistStationTracksRequest,
  ): Promise<SongStationTracksResponse> {
    return this.artistStationService.getTracks(
      request.userId,
      request.stationId,
      request.excludedSongIds,
      request.limit,
    );
  }

  async getSystemPlaylistTracks(
    request: GetSystemPlaylistTracksRequest,
  ): Promise<SystemPlaylistTracksResponse> {
    return {
      trackIds: await this.recommendationsService.getSystemPlaylistTracks(
        request.userId,
        request.playlistId,
      ),
    };
  }

  async getAlbumRelatedRecommendations(
    request: GetAlbumRelatedRecommendationsRequest,
  ): Promise<GetAlbumRelatedRecommendationsResponse> {
    return {
      albumIds: await this.recommendationEngine.getAlbumRelatedRecommendations(
        request.userId,
        request.albumId,
        request.limit,
      ),
    };
  }

  async getHomeRecommendations(
    request: GetHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    const bypassCache = developmentCacheDisabled();
    let globalResult = await this.recommendationsService.getHomeRecommendations(
      {
        ...request,
        userId: '',
      },
    );

    const isGlobalStale = await this.generationService.isGlobalPageStale(
      request.name,
      request.locale,
    );

    if (globalResult.data.length === 0 || (bypassCache && isGlobalStale)) {
      const generated = await this.generationService.tryLazyGenerateGlobal(
        request.name,
        request.locale,
        request.timezone,
        request.platform,
      );
      if (generated && generated.data.length > 0) {
        globalResult = generated;
      }
    } else if (isGlobalStale) {
      // Serve the last published page immediately and refresh it in the
      // background. A stale Home must never make a listener wait for catalog
      // synchronization, candidate scoring, and page persistence.
      void this.generationService
        .tryLazyGenerateGlobal(
          request.name,
          request.locale,
          request.timezone,
          request.platform,
        )
        .catch((error: unknown) =>
          this.logger.warn('Background global generation failed', error),
        );
    }

    if (request.userId) {
      if (bypassCache) {
        // Development requires source changes to be reflected by this request,
        // not by a later stale-while-revalidate request.
        await this.generationService.tryLazyGenerateUser(
          request.userId,
          request.name,
          request.locale,
          request.timezone,
          request.platform,
        );
      } else {
        // Keep Home on its fast path. The web client listens for telemetry
        // acceptance and schedules a debounced revalidation after this
        // background regeneration has had time to publish the new page.
        void this.generationService
          .tryLazyGenerateUser(
            request.userId,
            request.name,
            request.locale,
            request.timezone,
            request.platform,
          )
          .catch((error: unknown) =>
            this.logger.warn('Background user generation failed', error),
          );
      }
    }

    return request.userId
      ? this.recommendationsService.getHomeRecommendations(
        request,
        globalResult,
      )
      : globalResult;
  }

  getRecommendationSection(
    request: GetRecommendationSectionRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.recommendationsService.getRecommendationSection(request);
  }

  refreshRecommendationSection(
    request: RefreshRecommendationSectionRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.recommendationsService.refreshRecommendationSection(request);
  }

  replaceHomeRecommendations(
    request: ReplaceHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.recommendationsService.replaceHomeRecommendations(request);
  }

  publishRecommendationPage(
    request: PublishRecommendationPageRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.recommendationsService.publishRecommendationPage(request);
  }

  getRecommendationPageForAdmin(
    request: GetRecommendationPageForAdminRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.recommendationsService.getRecommendationPageForAdmin(request);
  }

  recordListeningEvent(
    request: RecordListeningEventRequest,
  ): Promise<RecordListeningEventResponse> {
    return this.listeningService.recordEvent(request);
  }

  recordRecommendationInteraction(
    request: RecordRecommendationInteractionRequest,
  ): Promise<RecordRecommendationInteractionResponse> {
    return this.recommendationsService.recordRecommendationInteraction(request);
  }

  recordPreferenceEvent(
    request: RecordPreferenceEventRequest,
  ): Promise<RecordPreferenceEventResponse> {
    return this.preferenceService.record(request);
  }
  listContentPreferences(request: { userId: string }) {
    return this.preferenceService.listHiddenContent(request.userId);
  }
  setArtistFollow(
    request: SetArtistFollowRequest,
  ): Promise<ArtistFollowResponse> {
    return this.preferenceService.setArtistFollow(
      request.userId,
      request.artistId,
      request.isFollowed,
    );
  }
  getArtistFollow(
    request: GetArtistFollowRequest,
  ): Promise<ArtistFollowResponse> {
    return this.preferenceService
      .isArtistFollowed(request.userId, request.artistId)
      .then((result) => ({ success: true, ...result, changed: false }));
  }

  generateRecommendations(
    request: GenerateRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.generationService.generate(request);
  }

  getListeningAnalytics(
    request: GetListeningAnalyticsRequest,
  ): Promise<ListeningAnalyticsResponse> {
    return this.listeningService.getListeningAnalytics(request);
  }

  getRecommendationQualityAnalytics(
    request: GetRecommendationQualityAnalyticsRequest,
  ): Promise<RecommendationQualityAnalyticsResponse> {
    return this.recommendationsService.getRecommendationQualityAnalytics(
      request,
    );
  }

  async upsertSystemStationArtwork(
    request: UpsertSystemStationArtworkRequest,
  ): Promise<SystemStationArtworkResponse> {
    const artwork = await this.systemStationArtworkService.bind(
      request.stationKey,
      request.coverAssetId,
      request.heroVideoAssetId,
    );
    return {
      stationKey: request.stationKey,
      coverAssetId: artwork.cover.assetId,
      heroVideoAssetId: request.heroVideoAssetId,
    };
  }

  async upsertSystemPlaylistArtwork(
    request: UpsertSystemPlaylistArtworkRequest,
  ): Promise<SystemPlaylistArtworkResponse> {
    const hasVideoMedia = Boolean(
      request.detailSquareVideoAssetId ||
      request.detailMobileVideoAssetId ||
      request.homeHeroVideoAssetId,
    );
    const artwork = hasVideoMedia
      ? await this.systemPlaylistArtworkService.bindVideos(
        request.playlistKey,
        request.detailSquareVideoAssetId,
        request.detailMobileVideoAssetId,
        request.homeHeroVideoAssetId,
      )
      : await this.systemPlaylistArtworkService.bind(
        request.playlistKey,
        request.coverAssetId,
        request.homeCardAssetId,
      );
    return {
      playlistKey: request.playlistKey,
      coverAssetId: artwork.cover.assetId,
      homeCardAssetId: artwork.homeCard.assetId,
      detailSquareVideoAssetId: request.detailSquareVideoAssetId,
      detailMobileVideoAssetId: request.detailMobileVideoAssetId,
      homeHeroVideoAssetId: request.homeHeroVideoAssetId,
    };
  }

  async setSystemPlaylistArtworkColor(
    request: SetSystemPlaylistArtworkColorRequest,
  ): Promise<SystemPlaylistArtworkResponse> {
    const artwork = await this.systemPlaylistArtworkService.setColor(
      request.playlistKey,
      request.bgColor,
    );
    return {
      playlistKey: request.playlistKey,
      coverAssetId: artwork.cover.assetId,
      homeCardAssetId: artwork.homeCard.assetId,
      detailSquareVideoAssetId: '',
      detailMobileVideoAssetId: '',
      homeHeroVideoAssetId: '',
    };
  }
}
