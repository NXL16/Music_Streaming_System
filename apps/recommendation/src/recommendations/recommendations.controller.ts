import { Controller, UseGuards } from '@nestjs/common';
import {
  GetHomeRecommendationsRequest,
  GetHomeRecommendationsResponse,
  GetRecommendationSectionRequest,
  RecommendationServiceController,
  RecommendationServiceControllerMethods,
  ReplaceHomeRecommendationsRequest,
  RefreshRecommendationSectionRequest,
} from '@musical/shared-proto';
import { RecommendationsService } from './recommendations.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';

@Controller()
@UseGuards(InternalGrpcGuard)
@RecommendationServiceControllerMethods()
export class RecommendationsController implements RecommendationServiceController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  getHomeRecommendations(
    request: GetHomeRecommendationsRequest,
  ): Promise<GetHomeRecommendationsResponse> {
    return this.recommendationsService.getHomeRecommendations(request);
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
}
