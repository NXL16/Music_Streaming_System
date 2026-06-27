import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtUser } from '@musical/shared-types';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { RecommendationsService } from './recommendations.service';

@Controller('me/recommendations')
@UseGuards(StrictJwtAuthGuard)
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get()
  getHomeRecommendations(
    @Req() req: Request,
    @Query('name') name?: string,
    @Query('l') locale?: string,
    @Query('timezone') timezone?: string,
    @Query('platform') platform?: string,
  ) {
    const user = req.user as JwtUser;

    return this.recommendationsService.getHomeRecommendations({
      userId: user.userId,
      name: name || 'listen-now',
      locale: locale || 'en-GB',
      timezone: timezone || '+07:00',
      platform: platform || 'web',
    });
  }

  @Get(':id')
  getRecommendationSection(
    @Req() req: Request,
    @Param('id') sectionId: string,
    @Query('name') name?: string,
    @Query('l') locale?: string,
    @Query('timezone') timezone?: string,
    @Query('action') action?: string,
  ) {
    const user = req.user as JwtUser;
    const request = {
      userId: user.userId,
      sectionId,
      name: name || 'listen-now',
      locale: locale || 'en-GB',
      timezone: timezone || '+07:00',
    };

    if (action === 'refresh') {
      return this.recommendationsService.refreshRecommendationSection(request);
    }

    return this.recommendationsService.getRecommendationSection(request);
  }
}
