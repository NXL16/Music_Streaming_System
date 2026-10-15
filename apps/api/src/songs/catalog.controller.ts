import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SongsService } from './songs.service';
import type { Request } from 'express';
import type { JwtUser } from '@musical/shared-types';
import {
  CatalogDraftStatus,
  SaveCatalogAlbumDraftRequest,
  SaveCatalogArtistDraftRequest,
  SaveCatalogPlaylistDraftRequest,
  SaveCatalogSongDraftRequest,
  SaveCatalogSongVideoDraftRequest,
  PreferenceEventType,
} from '@musical/shared-proto';
import { randomUUID } from 'crypto';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ArtistOrAdminGuard } from '../common/guards/artist-or-admin.guard';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { PREFERENCE_SIGNAL_WEIGHT } from '@musical/shared-constants';

@Controller('catalog/:storefront')
export class CatalogController {
  constructor(
    private readonly songsService: SongsService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Post('search/click')
  @UseGuards(StrictJwtAuthGuard)
  async recordSearchClick(
    @Req() req: Request,
    @Body() body: { resourceType?: string; resourceId?: string },
  ) {
    const resourceType = body.resourceType?.trim();
    const resourceId = body.resourceId?.trim();
    if (!resourceType || !resourceId) {
      throw new BadRequestException('SEARCH_RESOURCE_REQUIRED');
    }
    if (!['songs', 'albums', 'artists', 'playlists'].includes(resourceType)) {
      throw new BadRequestException('SEARCH_RESOURCE_TYPE_INVALID');
    }

    const user = req.user as JwtUser;
    return this.recommendationsService.recordPreferenceEvent({
      userId: user.userId,
      eventId: randomUUID(),
      eventType: PreferenceEventType.PREFERENCE_EVENT_TYPE_SEARCH_CLICKED,
      resourceType,
      resourceId,
      weight: PREFERENCE_SIGNAL_WEIGHT.SEARCH_CLICKED,
    });
  }

  @Get('albums/:albumId/related')
  @UseGuards(StrictJwtAuthGuard)
  async getAlbumRelated(
    @Req() req: Request,
    @Param('storefront') storefront: string,
    @Param('albumId') albumId: string,
    @Query('section') section?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('sourceSongId') sourceSongId?: string,
  ) {
    const user = req.user as JwtUser;
    const recommendedAlbumIds = (
      await this.recommendationsService.getAlbumRelatedRecommendations({
        userId: user.userId,
        albumId,
        limit: 60,
      })
    ).albumIds;
    return this.songsService.getCatalogAlbumRelated({
      storefront,
      albumId,
      section: section?.trim() ?? '',
      full: false,
      cursor: cursor?.trim() ?? '',
      limit: Number.parseInt(limit ?? '', 10) || 0,
      recommendedAlbumIds,
      sourceSongId: sourceSongId?.trim() ?? '',
    });
  }

  @Get('albums/:albumId')
  @UseGuards(StrictJwtAuthGuard)
  async getAlbum(
    @Req() req: Request,
    @Param('storefront') storefront: string,
    @Param('albumId') albumId: string,
  ) {
    const user = req.user as JwtUser;
    const recommendedAlbumIds = (
      await this.recommendationsService.getAlbumRelatedRecommendations({
        userId: user.userId,
        albumId,
        limit: 60,
      })
    ).albumIds;
    return this.songsService.getCatalogAlbum({
      storefront,
      albumId,
      recommendedAlbumIds,
    });
  }

  @Get('release-tracks/:releaseTrackId')
  getReleaseTrack(
    @Param('storefront') storefront: string,
    @Param('releaseTrackId') releaseTrackId: string,
  ) {
    return this.songsService.getCatalogReleaseTrack({
      storefront,
      releaseTrackId,
    });
  }

  @Get('playlists/:playlistId')
  getPlaylist(
    @Param('storefront') storefront: string,
    @Param('playlistId') playlistId: string,
  ) {
    return this.songsService.getCatalogPlaylist({ storefront, playlistId });
  }

  @Get('playlists/:playlistId/tracks')
  getPlaylistTracks(
    @Param('storefront') storefront: string,
    @Param('playlistId') playlistId: string,
  ) {
    return this.songsService.getCatalogPlaylistTracks({
      storefront,
      playlistId,
    });
  }

  @Get('artists/:artistId')
  getArtist(
    @Param('storefront') storefront: string,
    @Param('artistId') artistId: string,
  ) {
    return this.songsService.getCatalogResources({
      storefront,
      resources: [{ type: 'artists', id: artistId }],
    });
  }

  @Post('resources')
  getResources(
    @Param('storefront') storefront: string,
    @Body() body: { resources?: Array<{ type?: string; id?: string }> },
  ) {
    return this.songsService.getCatalogResources({
      storefront,
      resources: (body.resources ?? [])
        .filter(
          (resource): resource is { type: string; id: string } =>
            typeof resource.type === 'string' &&
            typeof resource.id === 'string',
        )
        .map((resource) => ({ type: resource.type, id: resource.id })),
    });
  }

  @Get('artists/:artistId/albums')
  getArtistAlbums(
    @Param('storefront') storefront: string,
    @Param('artistId') artistId: string,
    @Query('limit') limit?: string,
    @Query('releaseType') releaseType?: string | string[],
    @Query('section') section?: string,
  ) {
    const parsedLimit = Number(limit);
    const releaseTypes = (
      Array.isArray(releaseType) ? releaseType : (releaseType?.split(',') ?? [])
    )
      .map((value) => value.trim())
      .filter(Boolean);

    return this.songsService.getCatalogArtistAlbums({
      storefront,
      artistId,
      limit: Number.isInteger(parsedLimit) ? parsedLimit : 0,
      releaseTypes,
      section: section?.trim() ?? '',
    });
  }

  @Get('search')
  @UseGuards(StrictJwtAuthGuard)
  search(
    @Param('storefront') storefront: string,
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('types') types?: string,
  ) {
    const parsedLimit = Number(limit);

    return this.songsService.searchCatalog({
      storefront,
      query: query?.trim() ?? '',
      limit: Number.isInteger(parsedLimit) ? parsedLimit : 0,
      types: types
        ? types
            .split(',')
            .map((type) => type.trim())
            .filter(Boolean)
        : [],
    });
  }

  @Get('artists/:artistId/songs')
  getArtistSongs(
    @Param('storefront') storefront: string,
    @Param('artistId') artistId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = Number(limit);

    return this.songsService.getCatalogArtistSongs({
      storefront,
      artistId,
      limit: Number.isInteger(parsedLimit) ? parsedLimit : 0,
      cursor: cursor?.trim() ?? '',
    });
  }

  @Get('artists/:artistId/similar')
  getSimilarArtists(
    @Param('storefront') storefront: string,
    @Param('artistId') artistId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Number(limit);
    return this.songsService.getCatalogSimilarArtists({
      storefront,
      artistId,
      limit: Number.isInteger(parsedLimit) ? parsedLimit : 0,
    });
  }

  @Get('songs/:songId/videos')
  getSongVideos(
    @Param('storefront') storefront: string,
    @Param('songId') songId: string,
  ) {
    return this.songsService.getCatalogSongVideos({ storefront, songId });
  }

  @Get('albums/:albumId/music-videos')
  getAlbumSongVideos(
    @Param('storefront') storefront: string,
    @Param('albumId') albumId: string,
  ) {
    return this.songsService.getCatalogAlbumSongVideos({ storefront, albumId });
  }

  @Get('artists/:artistId/music-videos')
  getArtistSongVideos(
    @Param('storefront') storefront: string,
    @Param('artistId') artistId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = Number(limit);
    return this.songsService.getCatalogArtistSongVideos({
      storefront,
      artistId,
      limit: Number.isInteger(parsedLimit) ? parsedLimit : 0,
      cursor: cursor?.trim() ?? '',
    });
  }

  @Get('music-videos/:songVideoId/recommendations')
  getRelatedSongVideos(
    @Param('storefront') storefront: string,
    @Param('songVideoId') songVideoId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Number(limit);
    return this.songsService.getCatalogRelatedSongVideos({
      storefront,
      songVideoId,
      limit: Number.isInteger(parsedLimit) ? parsedLimit : 0,
    });
  }

  @Get('music-videos/:songVideoId')
  getSongVideo(
    @Param('storefront') storefront: string,
    @Param('songVideoId') songVideoId: string,
  ) {
    return this.songsService.getCatalogSongVideo({ storefront, songVideoId });
  }
}

@Controller('studio/catalog')
@UseGuards(StrictJwtAuthGuard, ArtistOrAdminGuard)
export class ArtistStudioCatalogController {
  constructor(
    private readonly songsService: SongsService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  private static readonly RELEASE_ROLES = ['OWNER', 'MANAGER', 'PRODUCTION'];
  private static readonly PROFILE_ROLES = ['OWNER', 'MANAGER', 'EDITOR'];
  private static readonly ANALYTICS_ROLES = [
    'OWNER',
    'MANAGER',
    'EDITOR',
    'PRODUCTION',
  ];
  private static readonly ADMIN_ROLES = new Set([
    'SUPER_ADMIN',
    'ADMIN_USER_OPS',
    'ADMIN_SECURITY_OPS',
  ]);

  @Post('songs/draft')
  async saveSongDraft(
    @Req() req: Request,
    @Body() body: SaveCatalogSongDraftRequest,
  ) {
    await this.assertCanAccessArtists(
      req,
      body.artistIds,
      ArtistStudioCatalogController.RELEASE_ROLES,
    );
    return this.songsService.saveCatalogSongDraft({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('albums/draft')
  async saveAlbumDraft(
    @Req() req: Request,
    @Body() body: SaveCatalogAlbumDraftRequest,
  ) {
    await this.assertCanAccessArtists(
      req,
      body.artistIds,
      ArtistStudioCatalogController.RELEASE_ROLES,
    );
    return this.songsService.saveCatalogAlbumDraft({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('playlists/draft')
  async savePlaylistDraft(
    @Req() req: Request,
    @Body() body: SaveCatalogPlaylistDraftRequest & { artistId?: string },
  ) {
    await this.assertCanAccessArtists(
      req,
      [body.artistId || ''],
      ArtistStudioCatalogController.RELEASE_ROLES,
    );
    const { artistId: _artistId, ...draft } = body;
    void _artistId;
    return this.songsService.saveCatalogPlaylistDraft({
      ...draft,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('songs/:songId/videos/draft')
  async saveSongVideoDraft(
    @Req() req: Request,
    @Param('songId') songId: string,
    @Body() body: Omit<SaveCatalogSongVideoDraftRequest, 'songId'>,
  ) {
    await this.assertCanEditSongArtists(
      req,
      songId,
      ArtistStudioCatalogController.RELEASE_ROLES,
      false,
    );
    return this.songsService.saveCatalogSongVideoDraft({
      ...body,
      songId,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('artists/:artistId/draft')
  async saveArtistProfileDraft(
    @Req() req: Request,
    @Param('artistId') artistId: string,
    @Body() body: Omit<SaveCatalogArtistDraftRequest, 'resourceId'>,
  ) {
    await this.assertCanAccessArtists(
      req,
      [artistId],
      ArtistStudioCatalogController.PROFILE_ROLES,
    );
    return this.songsService.saveCatalogArtistDraft({
      ...body,
      resourceId: artistId,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Get('songs/:songId/lyrics')
  async getSongLyrics(@Req() req: Request, @Param('songId') songId: string) {
    const user = req.user as JwtUser;
    // getSong intentionally permits a signed-in caller to view a public song.
    // That does not establish ownership, which this Artist Studio route
    // requires before exposing a draft.
    const songResponse = await this.songsService.getSong({
      songId,
      requesterUserId: user.userId,
    });

    if (!songResponse.song || songResponse.song.uploaderId !== user.userId) {
      await this.assertCanEditSongArtists(req, songId);
    }

    if (!songResponse.song) {
      throw new ForbiddenException({
        code: 'SONG_LYRICS_DRAFT_ACCESS_DENIED',
        message: 'Bạn không có quyền xem bản nháp lời bài hát này',
      });
    }

    return this.songsService.getSongLyrics({ songId, includeDraft: true });
  }

  @Post('songs/:songId/lyrics')
  async saveSongLyrics(
    @Req() req: Request,
    @Param('songId') songId: string,
    @Body()
    body: {
      language?: string;
      sourceTtml?: string;
      publish?: boolean;
    },
  ) {
    const user = req.user as JwtUser;
    const song = await this.songsService.getSong({
      songId,
      requesterUserId: user.userId,
    });
    if (!song.song || song.song.uploaderId !== user.userId) {
      await this.assertCanEditSongArtists(req, songId);
    }
    return this.songsService.upsertSongLyrics({
      songId,
      language: body.language?.trim() || 'vi',
      sourceTtml: body.sourceTtml || '',
      publish: Boolean(body.publish),
      actorUserId: user.userId,
      canManageAllSongs: ArtistStudioCatalogController.ADMIN_ROLES.has(
        user.role,
      ),
    });
  }

  @Get('songs/:songId/static-lyrics')
  async getSongStaticLyrics(
    @Req() req: Request,
    @Param('songId') songId: string,
  ) {
    const user = req.user as JwtUser;
    const song = await this.songsService.getSong({
      songId,
      requesterUserId: user.userId,
    });
    if (!song.song || song.song.uploaderId !== user.userId) {
      await this.assertCanEditSongArtists(req, songId);
    }
    return this.songsService.getSongStaticLyrics({ songId });
  }

  @Post('songs/:songId/static-lyrics')
  async saveSongStaticLyrics(
    @Req() req: Request,
    @Param('songId') songId: string,
    @Body()
    body: { lines?: Array<{ text?: string; vocalistType?: string }> },
  ) {
    const user = req.user as JwtUser;
    const song = await this.songsService.getSong({
      songId,
      requesterUserId: user.userId,
    });
    if (!song.song || song.song.uploaderId !== user.userId) {
      await this.assertCanEditSongArtists(req, songId);
    }
    return this.songsService.upsertSongStaticLyrics({
      songId,
      lines: (body.lines || []).map((line) => ({
        text: line.text || '',
        vocalistType: line.vocalistType || 'PRIMARY',
      })),
      actorUserId: user.userId,
      canManageAllSongs: ArtistStudioCatalogController.ADMIN_ROLES.has(
        user.role,
      ),
    });
  }

  @Post('drafts/:draftId/submit')
  async submitDraft(@Req() req: Request, @Param('draftId') draftId: string) {
    const user = req.user as JwtUser;
    const draft = await this.songsService.getCatalogDraft({ draftId });
    if (draft.draft?.createdBy !== user.userId) {
      throw new ForbiddenException({
        code: 'CATALOG_DRAFT_SUBMITTER_REQUIRED',
        message: 'Chỉ người tạo bản nháp mới có thể gửi duyệt',
      });
    }
    return this.songsService.submitCatalogDraft({
      draftId,
      actorUserId: user.userId,
    });
  }

  @Get('drafts/mine')
  async listMyDrafts(
    @Req() req: Request,
    @Query('resourceType') resourceType?: string,
    @Query('status') draftStatus?: string,
  ) {
    const user = req.user as JwtUser;
    // CatalogAuthoring exposes a generic internal list used by admin. Filter
    // it inside this Studio boundary before returning anything to the artist.
    const result = await this.songsService.listCatalogDrafts({
      storefront: 'vn',
      resourceType: resourceType || '',
      resourceId: '',
      status: this.draftStatus(draftStatus),
      cursor: '',
      limit: 100,
    });
    return {
      drafts: result.drafts.filter((draft) => draft.createdBy === user.userId),
      hasMore: false,
      nextCursor: '',
    };
  }

  @Get('artists/:artistId/releases')
  async listArtistWorkspaceReleases(
    @Req() req: Request,
    @Param('artistId') artistId: string,
  ) {
    await this.assertCanAccessArtists(
      req,
      [artistId],
      ArtistStudioCatalogController.ANALYTICS_ROLES,
    );
    const [catalog, draftPage] = await Promise.all([
      this.songsService.getCatalogArtistSongs({
        storefront: 'vn',
        artistId,
        limit: 100,
        cursor: '',
      }),
      this.songsService.listCatalogDrafts({
        storefront: 'vn',
        resourceType: '',
        resourceId: '',
        status: CatalogDraftStatus.CATALOG_DRAFT_STATUS_UNSPECIFIED,
        cursor: '',
        limit: 100,
      }),
    ]);
    const draftDetails = await Promise.all(
      draftPage.drafts.map((draft) => this.songsService.getCatalogDraft({ draftId: draft.id })),
    );
    const drafts = draftDetails
      .filter(
        (detail) =>
          ['songs', 'albums'].includes(detail.draft?.resourceType || '') &&
          this.draftBelongsToArtist(detail, artistId),
      )
      .map((detail) => ({ ...detail.draft, name: String(detail.payload?.name || '') }));
    const songs = catalog.data
      .filter((resource) => resource.type === 'songs')
      .map((resource) => {
        const attributes = catalog.resources?.songs?.[resource.id]?.attributes;
        return {
          id: resource.id,
          title: attributes?.name || resource.id,
          artist: attributes?.artistName || '',
          album: attributes?.albumName || '',
          status: 'PUBLISHED',
          createdAt: attributes?.releaseDate || '',
        };
      });
    return { songs, drafts };
  }

  @Get('artists/:artistId/drafts/:draftId')
  async getArtistWorkspaceDraft(
    @Req() req: Request,
    @Param('artistId') artistId: string,
    @Param('draftId') draftId: string,
  ) {
    await this.assertCanAccessArtists(
      req,
      [artistId],
      ArtistStudioCatalogController.ANALYTICS_ROLES,
    );
    const detail = await this.songsService.getCatalogDraft({ draftId });
    if (!this.draftBelongsToArtist(detail, artistId)) {
      throw new ForbiddenException({ code: 'ARTIST_WORKSPACE_ACCESS_DENIED' });
    }
    return detail;
  }

  @Get('artists/:artistId/analytics')
  async getArtistListeningAnalytics(
    @Req() req: Request,
    @Param('artistId') artistId: string,
    @Query('days') days?: string,
  ) {
    await this.assertCanAccessArtists(
      req,
      [artistId],
      ArtistStudioCatalogController.ANALYTICS_ROLES,
    );

    // Only published catalog songs can have listening events. Resolving their
    // ids here keeps analytics isolated to the selected Artist workspace.
    const catalog = await this.songsService.getCatalogArtistSongs({
      storefront: 'vn',
      artistId,
      limit: 100,
      cursor: '',
    });
    const songIds = catalog.data
      .filter((resource) => resource.type === 'songs')
      .map((resource) => resource.id)
      .filter(Boolean);

    return this.recommendationsService.getListeningAnalytics({
      songIds,
      days: Math.min(90, Math.max(1, Number(days) || 28)),
    });
  }

  private async assertCanEditSongArtists(
    req: Request,
    songId: string,
    allowedRoles = ArtistStudioCatalogController.PROFILE_ROLES,
    requireAllArtistPermissions = true,
  ) {
    const catalog = await this.songsService.getCatalogResources({
      storefront: 'vn',
      resources: [{ type: 'songs', id: songId }],
    });
    const artistIds =
      catalog.resources?.songs?.[songId]?.relationships?.artists?.data
        .map((artist) => artist.id)
        .filter(Boolean) ?? [];
    await this.assertCanAccessArtists(
      req,
      artistIds,
      allowedRoles,
      requireAllArtistPermissions,
    );
  }

  private draftStatus(value?: string): CatalogDraftStatus {
    switch (value?.toUpperCase()) {
      case 'DRAFT':
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_DRAFT;
      case 'PUBLISHED':
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_PUBLISHED;
      case 'SUBMITTED':
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_SUBMITTED;
      case 'CHANGES_REQUESTED':
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_CHANGES_REQUESTED;
      default:
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_UNSPECIFIED;
    }
  }

  private draftBelongsToArtist(
    detail: Awaited<ReturnType<SongsService['getCatalogDraft']>>,
    artistId: string,
  ) {
    if (detail.draft?.resourceType === 'artists') {
      return detail.draft.resourceId === artistId;
    }
    const payload = detail.payload ?? {};
    const artistIds = Array.isArray(payload.artistIds) ? payload.artistIds : [];
    const credits = Array.isArray(payload.credits) ? payload.credits : [];
    return artistIds.includes(artistId) || credits.some(
      (credit) => typeof credit === 'object' && credit !== null && (credit as { artistId?: unknown }).artistId === artistId,
    );
  }

  private async assertCanAccessArtists(
    req: Request,
    artistIds: string[],
    allowedRoles: string[],
    requireAllArtistPermissions = true,
  ) {
    const user = req.user as JwtUser;
    if (ArtistStudioCatalogController.ADMIN_ROLES.has(user.role)) return;
    const uniqueArtistIds = [
      ...new Set(artistIds.map((id) => id.trim())),
    ].filter(Boolean);
    if (!uniqueArtistIds.length) {
      throw new ForbiddenException({
        code: 'ARTIST_WORKSPACE_REQUIRED',
        message: 'Hãy chọn Artist workspace để thực hiện thao tác này',
      });
    }
    const permissions = await Promise.all(
      uniqueArtistIds.map((artistId) =>
        this.songsService.checkArtistPermission({
          artistId,
          userId: user.userId,
          allowedRoles,
        }),
      ),
    );
    const hasRequiredPermission = requireAllArtistPermissions
      ? permissions.every((permission) => permission.allowed)
      : permissions.some((permission) => permission.allowed);
    if (!hasRequiredPermission) {
      throw new ForbiddenException({
        code: 'ARTIST_WORKSPACE_ACCESS_DENIED',
        message: 'Bạn không có quyền chỉnh sửa Artist workspace này',
      });
    }
  }
}

@Controller('admin/catalog')
@UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
@Permissions('catalog.manage')
export class CatalogAdminController {
  constructor(private readonly songsService: SongsService) {}

  @Post('artists/draft')
  saveArtistDraft(
    @Req() req: Request,
    @Body() body: SaveCatalogArtistDraftRequest,
  ) {
    return this.songsService.saveCatalogArtistDraft({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('songs/draft')
  saveSongDraft(
    @Req() req: Request,
    @Body() body: SaveCatalogSongDraftRequest,
  ) {
    return this.songsService.saveCatalogSongDraft({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Get('songs/:songId/lyrics')
  getSongLyrics(@Param('songId') songId: string) {
    return this.songsService.getSongLyrics({ songId, includeDraft: true });
  }

  @Post('songs/:songId/lyrics')
  saveSongLyrics(
    @Req() req: Request,
    @Param('songId') songId: string,
    @Body()
    body: {
      language?: string;
      sourceTtml?: string;
      publish?: boolean;
    },
  ) {
    return this.songsService.upsertSongLyrics({
      songId,
      language: body.language?.trim() || 'vi',
      sourceTtml: body.sourceTtml || '',
      publish: Boolean(body.publish),
      actorUserId: (req.user as JwtUser).userId,
      canManageAllSongs: true,
    });
  }

  @Get('songs/:songId/static-lyrics')
  getSongStaticLyrics(@Param('songId') songId: string) {
    return this.songsService.getSongStaticLyrics({ songId });
  }

  @Post('songs/:songId/static-lyrics')
  saveSongStaticLyrics(
    @Req() req: Request,
    @Param('songId') songId: string,
    @Body()
    body: { lines?: Array<{ text?: string; vocalistType?: string }> },
  ) {
    return this.songsService.upsertSongStaticLyrics({
      songId,
      lines: (body.lines || []).map((line) => ({
        text: line.text || '',
        vocalistType: line.vocalistType || 'PRIMARY',
      })),
      actorUserId: (req.user as JwtUser).userId,
      canManageAllSongs: true,
    });
  }

  @Post('albums/draft')
  saveAlbumDraft(
    @Req() req: Request,
    @Body() body: SaveCatalogAlbumDraftRequest,
  ) {
    return this.songsService.saveCatalogAlbumDraft({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('playlists/draft')
  savePlaylistDraft(
    @Req() req: Request,
    @Body() body: SaveCatalogPlaylistDraftRequest,
  ) {
    return this.songsService.saveCatalogPlaylistDraft({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('song-videos/draft')
  saveSongVideoDraft(
    @Req() req: Request,
    @Body() body: SaveCatalogSongVideoDraftRequest,
  ) {
    return this.songsService.saveCatalogSongVideoDraft({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Delete('song-videos/:songVideoId')
  deleteSongVideo(
    @Req() req: Request,
    @Param('songVideoId') songVideoId: string,
  ) {
    return this.songsService.deleteCatalogSongVideo({
      songVideoId,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Get('drafts')
  listDrafts(
    @Query('storefront') storefront?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('status') draftStatus?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.songsService.listCatalogDrafts({
      storefront: storefront || '',
      resourceType: resourceType || '',
      resourceId: resourceId || '',
      status: this.draftStatus(draftStatus),
      cursor: cursor || '',
      limit: Number(limit) || 20,
    });
  }

  @Get('drafts/:draftId')
  getDraft(@Param('draftId') draftId: string) {
    return this.songsService.getCatalogDraft({ draftId });
  }

  @Post('drafts/:draftId/submit')
  submitDraft(@Req() req: Request, @Param('draftId') draftId: string) {
    return this.songsService.submitCatalogDraft({
      draftId,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('drafts/:draftId/publish')
  publishDraft(@Req() req: Request, @Param('draftId') draftId: string) {
    return this.songsService.publishCatalogDraft({
      draftId,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Post('drafts/:draftId/request-changes')
  requestChanges(
    @Req() req: Request,
    @Param('draftId') draftId: string,
    @Body() body: { reviewNote?: string },
  ) {
    return this.songsService.reviewCatalogDraft({
      draftId,
      actorUserId: (req.user as JwtUser).userId,
      requestChanges: true,
      reviewNote: body.reviewNote?.trim() || '',
    });
  }

  @Delete('drafts/:draftId')
  deleteDraft(@Param('draftId') draftId: string) {
    return this.songsService.deleteCatalogDraft({ draftId });
  }

  private draftStatus(value?: string): CatalogDraftStatus {
    switch (value?.toUpperCase()) {
      case 'DRAFT':
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_DRAFT;
      case 'PUBLISHED':
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_PUBLISHED;
      case 'SUBMITTED':
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_SUBMITTED;
      case 'CHANGES_REQUESTED':
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_CHANGES_REQUESTED;
      default:
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_UNSPECIFIED;
    }
  }
}
