import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  SongStationResponse,
  ArtistStationResponse,
} from '@musical/shared-proto';
import { randomUUID } from 'crypto';
import {
  RecommendationPageScope,
  RecommendationPageStatus,
  RecommendationPresentationMode,
  ListeningEventType,
  RecommendationInteractionType,
  PreferenceEventType,
} from '@musical/shared-proto';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { RecommendationsService } from './recommendations.service';
import { SongStationArtworkService } from './song-station-artwork.service';
import { ArtistStationArtworkService } from './artist-station-artwork.service';
import { PREFERENCE_SIGNAL_WEIGHT } from '@musical/shared-constants';

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

function publicSongStationResponse(
  station: SongStationResponse,
): Omit<SongStationResponse, 'seedArtworkUrl' | 'seedSongId'> {
  return Object.fromEntries(
    Object.entries(station).filter(
      ([key, value]) =>
        value !== undefined && key !== 'seedArtworkUrl' && key !== 'seedSongId',
    ),
  ) as Omit<SongStationResponse, 'seedArtworkUrl' | 'seedSongId'>;
}

function publicArtistStationResponse(
  station: ArtistStationResponse,
): Omit<ArtistStationResponse, 'featuredArtistArtworkUrls' | 'seedArtistId'> {
  return Object.fromEntries(
    Object.entries(station).filter(
      ([key, value]) =>
        value !== undefined &&
        key !== 'featuredArtistArtworkUrls' &&
        key !== 'seedArtistId',
    ),
  ) as Omit<
    ArtistStationResponse,
    'featuredArtistArtworkUrls' | 'seedArtistId'
  >;
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
    case 'PLAY_STOPPED':
      return ListeningEventType.LISTENING_EVENT_TYPE_PLAY_STOPPED;
    default:
      return ListeningEventType.LISTENING_EVENT_TYPE_PLAY_START;
  }
}

function normalizeInteractionType(
  value: unknown,
): RecommendationInteractionType {
  if (typeof value === 'number') return value;
  switch (String(value).toUpperCase()) {
    case 'IMPRESSION':
      return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_IMPRESSION;
    case 'OPEN':
      return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_OPEN;
    case 'PLAY':
      return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_PLAY;
    case 'DISMISS':
      return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_DISMISS;
    default:
      return RecommendationInteractionType.RECOMMENDATION_INTERACTION_TYPE_UNSPECIFIED;
  }
}

@Controller('me/recommendations')
@UseGuards(StrictJwtAuthGuard)
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
    private readonly songStationArtworkService: SongStationArtworkService,
    private readonly artistStationArtworkService: ArtistStationArtworkService,
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

  @Get('suggest-less')
  async listSuggestLess(@Req() req: Request) {
    const user = req.user as JwtUser;
    return this.recommendationsService.listContentPreferences(user.userId);
  }

  @Get('song-stations/:stationId')
  async getSongStation(
    @Req() req: Request,
    @Param('stationId') stationId: string,
  ) {
    const user = req.user as JwtUser;
    const station = await this.recommendationsService.getSongStation({
      userId: user.userId,
      stationId,
    });
    return publicSongStationResponse(station);
  }

  @Get('artist-stations/:stationId')
  async getArtistStation(
    @Req() req: Request,
    @Param('stationId') stationId: string,
  ) {
    const user = req.user as JwtUser;
    return publicArtistStationResponse(
      await this.recommendationsService.getArtistStation({
        userId: user.userId,
        stationId,
      }),
    );
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
      playlistCuratorName?: string;
      playlistArtworkUrl?: string;
      playlistArtworkBgColor?: string;
      stationId?: string;
      stationName?: string;
      stationArtworkUrl?: string;
      stationArtworkBgColor?: string;
      eventId?: string;
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
      playlistCuratorName: body.playlistCuratorName ?? '',
      playlistArtworkUrl: body.playlistArtworkUrl ?? '',
      playlistArtworkBgColor: body.playlistArtworkBgColor ?? '',
      stationId: body.stationId ?? '',
      stationName: body.stationName ?? '',
      stationArtworkUrl: body.stationArtworkUrl ?? '',
      stationArtworkBgColor: body.stationArtworkBgColor ?? '',
      eventId: typeof body.eventId === 'string' ? body.eventId : '',
    });
  }

  @Post('song-stations')
  async createSongStation(
    @Req() req: Request,
    @Body() body: { songId?: string; sourceAlbumId?: string },
  ) {
    const songId = body.songId?.trim();
    if (!songId) {
      throw new BadRequestException('SONG_STATION_SEED_REQUIRED');
    }
    const user = req.user as JwtUser;
    const station = await this.recommendationsService.createSongStation({
      userId: user.userId,
      songId,
      sourceAlbumId: body.sourceAlbumId?.trim() ?? '',
      stationArtworkAssetId: '',
      stationArtworkBgColor: '',
    });
    return publicSongStationResponse(station);
  }

  @Post('artist-stations')
  async createArtistStation(
    @Req() req: Request,
    @Body() body: { artistId?: string; artistOnly?: boolean },
  ) {
    const artistId = body.artistId?.trim();
    if (!artistId)
      throw new BadRequestException('ARTIST_STATION_SEED_REQUIRED');
    const user = req.user as JwtUser;
    return publicArtistStationResponse(
      await this.recommendationsService.createArtistStation({
        userId: user.userId,
        artistId,
        stationArtworkAssetId: '',
        stationArtworkBgColor: '',
        artistOnly: body.artistOnly === true,
      }),
    );
  }

  @Post('artist-stations/:stationId/artwork')
  async renderArtistStationArtwork(
    @Req() req: Request,
    @Param('stationId') stationId: string,
    @Body() body: { primaryArtworkUrl?: unknown },
  ) {
    const user = req.user as JwtUser;
    const draft = await this.recommendationsService.getArtistStation({
      userId: user.userId,
      stationId,
    });
    if (draft.artworkReady) {
      // Older canonical Station rows can already own a ready asset while
      // their Home snapshot predates `stationArtworkReady`. Rebind the asset
      // through Recommendation once so Home can expose the ready state.
      return publicArtistStationResponse(
        await this.recommendationsService.createArtistStation({
          userId: user.userId,
          artistId: draft.seedArtistId,
          stationArtworkAssetId: '',
          stationArtworkBgColor: '',
          artistOnly: draft.artistOnly,
        }),
      );
    }
    if (!draft.seedArtistId)
      throw new BadRequestException('ARTIST_STATION_SEED_REQUIRED');
    const primaryArtworkUrl =
      this.trustedArtworkUrl(body.primaryArtworkUrl) ??
      draft.featuredArtistArtworkUrls[0];
    const artwork = await this.artistStationArtworkService.create({
      actorUserId: user.userId,
      stationId: draft.stationId,
      artworkUrls: draft.artistOnly
        ? [primaryArtworkUrl]
        : [primaryArtworkUrl, ...draft.featuredArtistArtworkUrls.slice(1)],
      layout: draft.artistOnly ? 'portrait' : 'composite',
    });
    return publicArtistStationResponse(
      await this.recommendationsService.createArtistStation({
        userId: user.userId,
        artistId: draft.seedArtistId,
        stationArtworkAssetId: artwork.assetId,
        stationArtworkBgColor: artwork.backgroundColor,
        artistOnly: draft.artistOnly,
      }),
    );
  }

  private trustedArtworkUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'r2.404hz.me'
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  @Post('song-stations/:stationId/artwork')
  async renderSongStationArtwork(
    @Req() req: Request,
    @Param('stationId') stationId: string,
  ) {
    const user = req.user as JwtUser;
    const draft = await this.recommendationsService.getSongStation({
      userId: user.userId,
      stationId,
    });
    // Rendering is an expensive asset job. This endpoint is safe to retry and
    // must never regenerate a Station cover that is already ready.
    if (draft.artworkReady) {
      return publicSongStationResponse(draft);
    }
    if (!draft.seedSongId || !draft.seedArtworkUrl) {
      throw new BadRequestException('SONG_STATION_ARTWORK_SOURCE_UNAVAILABLE');
    }
    const artwork = await this.songStationArtworkService.create({
      actorUserId: user.userId,
      stationId: draft.stationId,
      sourceArtworkUrl: draft.seedArtworkUrl,
    });
    const station = await this.recommendationsService.createSongStation({
      userId: user.userId,
      songId: draft.seedSongId,
      sourceAlbumId: draft.seedAlbumId,
      stationArtworkAssetId: artwork.assetId,
      stationArtworkBgColor: artwork.backgroundColor,
    });
    return publicSongStationResponse(station);
  }

  @Post('song-stations/:stationId/tracks')
  async getSongStationTracks(
    @Req() req: Request,
    @Param('stationId') stationId: string,
    @Body() body: { excludedSongIds?: unknown; limit?: unknown },
  ) {
    const excludedSongIds = Array.isArray(body.excludedSongIds)
      ? body.excludedSongIds
          .filter((songId): songId is string => typeof songId === 'string')
          .map((songId) => songId.trim())
          .filter(Boolean)
          .slice(0, 1_000)
      : [];
    const requestedLimit =
      typeof body.limit === 'number' && Number.isInteger(body.limit)
        ? body.limit
        : 20;
    const user = req.user as JwtUser;
    return this.recommendationsService.getSongStationTracks({
      userId: user.userId,
      stationId,
      excludedSongIds,
      limit: Math.min(30, Math.max(1, requestedLimit)),
    });
  }

  @Post('artist-stations/:stationId/tracks')
  async getArtistStationTracks(
    @Req() req: Request,
    @Param('stationId') stationId: string,
    @Body() body: { excludedSongIds?: unknown; limit?: unknown },
  ) {
    const excludedSongIds = Array.isArray(body.excludedSongIds)
      ? body.excludedSongIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 1_000)
      : [];
    const limit =
      typeof body.limit === 'number' && Number.isInteger(body.limit)
        ? Math.min(30, Math.max(1, body.limit))
        : 20;
    const user = req.user as JwtUser;
    return this.recommendationsService.getArtistStationTracks({
      userId: user.userId,
      stationId,
      excludedSongIds,
      limit,
    });
  }

  @Post('interactions')
  recordRecommendationInteraction(
    @Req() req: Request,
    @Body()
    body: {
      sectionId: string;
      resourceType: string;
      resourceId: string;
      position?: number;
      modelVersion?: number;
      eventType: string;
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

  @Post('suggest-less')
  async setSuggestLess(
    @Req() req: Request,
    @Body()
    body: { resourceType?: string; resourceId?: string; active?: boolean },
  ) {
    const resourceType = body.resourceType?.trim();
    const resourceId = body.resourceId?.trim();
    if (!resourceType || !resourceId) {
      throw new BadRequestException('SUGGEST_LESS_RESOURCE_REQUIRED');
    }
    if (!['songs', 'albums', 'artists', 'playlists'].includes(resourceType)) {
      throw new BadRequestException('SUGGEST_LESS_RESOURCE_TYPE_INVALID');
    }

    const user = req.user as JwtUser;
    return this.recommendationsService.recordPreferenceEvent({
      userId: user.userId,
      eventId: randomUUID(),
      eventType: PreferenceEventType.PREFERENCE_EVENT_TYPE_CONTENT_HIDDEN,
      resourceType,
      resourceId,
      weight:
        body.active === false
          ? PREFERENCE_SIGNAL_WEIGHT.CONTENT_RESTORED
          : PREFERENCE_SIGNAL_WEIGHT.CONTENT_HIDDEN,
    });
  }

  @Post('queue-intent')
  async recordQueueIntent(
    @Req() req: Request,
    @Body() body: { resourceType?: string; resourceId?: string },
  ) {
    const resourceType = body.resourceType?.trim();
    const resourceId = body.resourceId?.trim();
    if (!resourceType || !resourceId) {
      throw new BadRequestException('QUEUE_INTENT_RESOURCE_REQUIRED');
    }
    if (!['songs', 'albums', 'playlists', 'stations'].includes(resourceType)) {
      throw new BadRequestException('QUEUE_INTENT_RESOURCE_TYPE_INVALID');
    }

    const user = req.user as JwtUser;
    return this.recommendationsService.recordPreferenceEvent({
      userId: user.userId,
      eventId: randomUUID(),
      eventType: PreferenceEventType.PREFERENCE_EVENT_TYPE_QUEUE_ADDED,
      resourceType,
      resourceId,
      // Explicit queueing indicates intent, but is deliberately weaker than
      // adding a track to a playlist or marking it as Favourite.
      weight: PREFERENCE_SIGNAL_WEIGHT.QUEUE_ADDED,
    });
  }

  @Get('artists/:artistId/follow')
  async getArtistFollow(
    @Req() req: Request,
    @Param('artistId') artistId: string,
  ) {
    const user = req.user as JwtUser;
    return this.recommendationsService.isArtistFollowed(user.userId, artistId);
  }

  @Post('artists/:artistId/follow')
  async followArtist(@Req() req: Request, @Param('artistId') artistId: string) {
    const user = req.user as JwtUser;
    return this.recommendationsService.setArtistFollow(
      user.userId,
      artistId,
      true,
    );
  }

  @Delete('artists/:artistId/follow')
  async unfollowArtist(
    @Req() req: Request,
    @Param('artistId') artistId: string,
  ) {
    const user = req.user as JwtUser;
    return this.recommendationsService.setArtistFollow(
      user.userId,
      artistId,
      false,
    );
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
