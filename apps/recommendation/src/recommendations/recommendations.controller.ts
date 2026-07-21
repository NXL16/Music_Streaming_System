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
} from '@musical/shared-proto';
import { RecommendationsService } from './recommendations.service';
import { ListeningService } from '../listening/listening.service';
import { GenerationService } from '../generation/generation.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';
import { RecommendationRpcMetricsInterceptor } from '../common/observability/recommendation-rpc-metrics.interceptor';

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
  ) {}

  async getHomeRecommendations(
    request: GetHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
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

    if (globalResult.data.length === 0) {
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
      // User regeneration follows the same stale-while-revalidate contract.
      // The current request keeps its fast path (published user page or global
      // cold-start fallback), while the next request receives the fresh page.
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
}
