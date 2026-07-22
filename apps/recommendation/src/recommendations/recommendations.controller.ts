import { Controller, Logger, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  GetHomeRecommendationsRequest,
  GetHomeRecommendationsResponse,
  GetRecommendationSectionRequest,
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
  UpsertSystemStationArtworkRequest,
  SystemStationArtworkResponse,
} from '@musical/shared-proto';
import { RecommendationsService } from './recommendations.service';
import { ListeningService } from '../listening/listening.service';
import { GenerationService } from '../generation/generation.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';
import { RecommendationRpcMetricsInterceptor } from '../common/observability/recommendation-rpc-metrics.interceptor';
import { SystemStationArtworkService } from './system-station-artwork.service';
import { developmentCacheDisabled } from '../common/configs/development-cache';

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
  ) {}

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
        // User regeneration follows the stale-while-revalidate contract in
        // normal operation, preserving the fast path for listeners.
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

  async upsertSystemStationArtwork(
    request: UpsertSystemStationArtworkRequest,
  ): Promise<SystemStationArtworkResponse> {
    const artwork = await this.systemStationArtworkService.bind(
      request.stationKey,
      request.assetId,
    );
    return { stationKey: request.stationKey, assetId: artwork.assetId };
  }
}
