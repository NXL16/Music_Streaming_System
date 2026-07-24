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
  ListeningEventType,
  RecommendationInteractionType,
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
    throw new BadRequestException('presentationMode must be AUTO or FIXED');
  }

  switch (value.toUpperCase()) {
    case 'AUTO':
      return RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_AUTO;
    case 'FIXED':
      return RecommendationPresentationMode.RECOMMENDATION_PRESENTATION_MODE_FIXED;
    default:
      throw new BadRequestException('presentationMode must be AUTO or FIXED');
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

function normalizeEventType(value: unknown): ListeningEventType {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') {
    return ListeningEventType.LISTENING_EVENT_TYPE_PLAY_START;
  }

  switch (value.toUpperCase()) {
    case 'PLAY_START':
      return ListeningEventType.LISTENING_EVENT_TYPE_PLAY_START;
    case 'PLAY_COMPLETE':
      return ListeningEventType.LISTENING_EVENT_TYPE_PLAY_COMPLETE;
    case 'SKIP':
      return ListeningEventType.LISTENING_EVENT_TYPE_SKIP;
    default:
      return ListeningEventType.LISTENING_EVENT_TYPE_PLAY_START;
  }
}

function normalizeInteractionType(value: unknown): RecommendationInteractionType {
  if (typeof value === 'number') return value;
  switch (String(value).toUpperCase()) {
    case 'IMPRESSION': return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_IMPRESSION;
    case 'OPEN': return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_OPEN;
    case 'PLAY': return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_PLAY;
    case 'DISMISS': return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_DISMISS;
    default: return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_UNSPECIFIED;
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

  @Post('listening-events')
  recordListeningEvent(
    @Req() req: Request,
    @Body()
    body: {
      songId: string;
      eventType: string;
      durationSec?: number;
      totalSec?: number;
      songTitle?: string;
      artistName?: string;
      albumName?: string;
      albumId?: string;
      playlistId?: string;
      playlistName?: string;
      playlistArtworkUrl?: string;
      playlistArtworkBgColor?: string;
      stationId?: string;
      stationName?: string;
      stationArtworkUrl?: string;
      stationArtworkBgColor?: string;
    },
  ) {
    const user = req.user as JwtUser;
    return this.recommendationsService.recordListeningEvent({
      userId: user.userId,
      songId: body.songId,
      eventType: normalizeEventType(body.eventType),
      durationSec: body.durationSec ?? 0,
      totalSec: body.totalSec ?? 0,
      songTitle: body.songTitle ?? '',
      artistName: body.artistName ?? '',
      albumName: body.albumName ?? '',
      albumId: body.albumId ?? '',
      playlistId: body.playlistId ?? '',
      playlistName: body.playlistName ?? '',
      playlistArtworkUrl: body.playlistArtworkUrl ?? '',
      playlistArtworkBgColor: body.playlistArtworkBgColor ?? '',
      stationId: body.stationId ?? '',
      stationName: body.stationName ?? '',
      stationArtworkUrl: body.stationArtworkUrl ?? '',
      stationArtworkBgColor: body.stationArtworkBgColor ?? '',
    });
  }

  @Post('interactions')
  recordRecommendationInteraction(
    @Req() req: Request,
    @Body() body: {
      sectionId: string; resourceType: string; resourceId: string;
      position?: number; modelVersion?: number; eventType: string;
    },
  ) {
    const user = req.user as JwtUser;
    return this.recommendationsService.recordRecommendationInteraction({
      userId: user.userId,
      sectionId: body.sectionId,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      position: body.position ?? 0,
      modelVersion: body.modelVersion ?? 1,
      eventType: normalizeInteractionType(body.eventType),
    });
  }

  @Post('interactions/batch')
  async recordRecommendationInteractionBatch(
    @Req() req: Request,
    @Body()
    body: {
      interactions?: Array<{
        sectionId: string;
        resourceType: string;
        resourceId: string;
        position?: number;
        modelVersion?: number;
        eventType: string;
      }>;
    },
  ) {
    const user = req.user as JwtUser;
    const interactions = Array.isArray(body.interactions)
      ? body.interactions.slice(0, 48)
      : [];
    const results = await Promise.all(
      interactions.map((interaction) =>
        this.recommendationsService.recordRecommendationInteraction({
          userId: user.userId,
          sectionId: interaction.sectionId,
          resourceType: interaction.resourceType,
          resourceId: interaction.resourceId,
          position: interaction.position ?? 0,
          modelVersion: interaction.modelVersion ?? 1,
          eventType: normalizeInteractionType(interaction.eventType),
        }),
      ),
    );

    return {
      accepted: interactions.length,
      recorded: results.filter((result) => result.success).length,
    };
  }
}

@Controller('admin/recommendations')
@UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
@Permissions('recommendation.manage')
export class RecommendationAdminController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get('analytics')
  getListeningAnalytics(@Query('days') days?: string) {
    return this.recommendationsService.getListeningAnalytics({
      songIds: [],
      days: Math.min(90, Math.max(1, Number(days) || 28)),
    });
  }

  @Get('quality')
  getRecommendationQualityAnalytics(
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recommendationsService.getRecommendationQualityAnalytics({
      days: Math.min(90, Math.max(1, Number(days) || 28)),
      limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    });
  }

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
      status: RecommendationPageStatus.RECOMMENDATION_PAGE_STATUS_DRAFT,
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

  @Post('home/generate')
  generateRecommendations(
    @Req() req: Request,
    @Body()
    body: {
      scope?: string;
      userId?: string;
      name?: string;
      locale?: string;
      timezone?: string;
      platform?: string;
    } = {},
  ) {
    const actor = req.user as JwtUser;
    const b = body ?? {};
    return this.recommendationsService.generateRecommendations({
      userId: b.userId ?? '',
      scope: normalizePageScope(b.scope || 'GLOBAL'),
      actorUserId: actor.userId,
      name: b.name || 'listen-now',
      locale: b.locale || 'en-GB',
      timezone: b.timezone || '+07:00',
      platform: b.platform || 'web',
    });
  }

  @Put('station-artwork/:stationKey')
  bindSystemStationArtwork(
    @Req() req: Request,
    @Param('stationKey') stationKey: string,
    @Body() body: { assetId?: string },
  ) {
    const actor = req.user as JwtUser;
    if (!body?.assetId?.trim()) {
      throw new BadRequestException('assetId is required');
    }
    return this.recommendationsService.upsertSystemStationArtwork({
      stationKey,
      assetId: body.assetId.trim(),
      actorUserId: actor.userId,
    });
  }
}
