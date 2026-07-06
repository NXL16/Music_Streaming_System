import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtUser } from '@musical/shared-types';
import type {
  GetRecommendationPageForAdminRequest,
  PublishRecommendationPageRequest,
  ReplaceHomeRecommendationsRequest,
} from '@musical/shared-proto';
import {
  RecommendationPageScope,
  RecommendationPageStatus,
  RecommendationPresentationMode,
} from '@musical/shared-proto';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RecommendationsService } from './recommendations.service';

function normalizePageScope(value: unknown): RecommendationPageScope {
  if (typeof value === 'number') return value;
  if (value === undefined || value === null || value === '') {
    return RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_UNSPECIFIED;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('scope must be GLOBAL or USER');
  }

  switch (value.toUpperCase()) {
    case 'GLOBAL':
      return RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_GLOBAL;
    case 'USER':
      return RecommendationPageScope.RECOMMENDATION_PAGE_SCOPE_USER;
    default:
      throw new BadRequestException('scope must be GLOBAL or USER');
  }
}

function normalizePresentationMode(
  value: unknown,
): RecommendationPresentationMode {
  if (typeof value === 'number') return value;
  if (value === undefined || value === null || value === '') {
    return RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_FIXED;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(
      'presentationMode must be AUTO or FIXED',
    );
  }

  switch (value.toUpperCase()) {
    case 'AUTO':
      return RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_AUTO;
    case 'FIXED':
      return RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_FIXED;
    default:
      throw new BadRequestException(
        'presentationMode must be AUTO or FIXED',
      );
  }
}

function normalizePageStatus(value: unknown): RecommendationPageStatus {
  if (typeof value === 'number') return value;
  if (value === undefined || value === null || value === '') {
    return RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_DRAFT;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(
      'status must be DRAFT, PUBLISHED or ARCHIVED',
    );
  }

  switch (value.toUpperCase()) {
    case 'DRAFT':
      return RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_DRAFT;
    case 'PUBLISHED':
      return RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_PUBLISHED;
    case 'ARCHIVED':
      return RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_ARCHIVED;
    default:
      throw new BadRequestException(
        'status must be DRAFT, PUBLISHED or ARCHIVED',
      );
  }
}

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

@Controller('admin/recommendations')
@UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
@Permissions('recommendation.manage')
export class RecommendationAdminController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get('home')
  getRecommendationPage(
    @Req() req: Request,
    @Query('scope') scope?: string,
    @Query('status') pageStatus?: string,
    @Query('userId') userId?: string,
    @Query('name') name?: string,
    @Query('l') locale?: string,
    @Query('timezone') timezone?: string,
    @Query('platform') platform?: string,
  ) {
    const actor = req.user as JwtUser;
    const request: GetRecommendationPageForAdminRequest = {
      actorUserId: actor.userId,
      scope: normalizePageScope(scope || 'GLOBAL'),
      status: normalizePageStatus(pageStatus),
      userId: userId ?? '',
      name: name || 'listen-now',
      locale: locale || 'en-GB',
      timezone: timezone || '+07:00',
      platform: platform || 'web',
    };

    return this.recommendationsService.getRecommendationPageForAdmin(request);
  }

  @Put('home')
  replaceHomeRecommendations(
    @Req() req: Request,
    @Body() body: ReplaceHomeRecommendationsRequest,
  ) {
    const actor = req.user as JwtUser;
    return this.recommendationsService.replaceHomeRecommendations({
      ...body,
      scope: normalizePageScope(body.scope),
      sections: body.sections.map((section) => ({
        ...section,
        attributes: section.attributes
          ? {
              ...section.attributes,
              presentationMode: normalizePresentationMode(
                section.attributes.presentationMode,
              ),
            }
          : undefined,
      })),
      status:
        RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_DRAFT,
      actorUserId: actor.userId,
    });
  }

  @Post('home/publish')
  publishRecommendationPage(
    @Req() req: Request,
    @Body() body: PublishRecommendationPageRequest,
  ) {
    const actor = req.user as JwtUser;
    return this.recommendationsService.publishRecommendationPage({
      ...body,
      scope: normalizePageScope(body.scope),
      actorUserId: actor.userId,
    });
  }
}
