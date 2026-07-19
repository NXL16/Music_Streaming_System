import { Controller, UseGuards } from '@nestjs/common';
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
  GenerateRecommendationsRequest,
  GetListeningAnalyticsRequest,
  ListeningAnalyticsResponse,
} from '@musical/shared-proto';
import { RecommendationsService } from './recommendations.service';
import { ListeningService } from '../listening/listening.service';
import { GenerationService } from '../generation/generation.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';

@Controller()
@UseGuards(InternalGrpcGuard)
@RecommendationServiceControllerMethods()
export class RecommendationsController implements RecommendationServiceController {
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

    if (globalResult.data.length === 0 || isGlobalStale) {
      const generated = await this.generationService.tryLazyGenerateGlobal(
        request.name,
        request.locale,
        request.timezone,
        request.platform,
      );
      if (generated && generated.data.length > 0) {
        globalResult = generated;
      }
    }

    if (request.userId) {
      await this.generationService.tryLazyGenerateUser(
        request.userId,
        request.name,
        request.locale,
        request.timezone,
        request.platform,
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
