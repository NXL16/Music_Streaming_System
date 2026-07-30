import {
  Body,
  Controller,
  Delete,
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
} from '@musical/shared-proto';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ArtistOrAdminGuard } from '../common/guards/artist-or-admin.guard';
import { RecommendationsService } from '../recommendations/recommendations.service';

@Controller('catalog/:storefront')
export class CatalogController {
  constructor(
    private readonly songsService: SongsService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Get('albums/:albumId/related')
  @UseGuards(StrictJwtAuthGuard)
  async getAlbumRelated(
    @Req() req: Request,
    @Param('storefront') storefront: string,
    @Param('albumId') albumId: string,
    @Query('section') section?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
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
    });
  }

  @Get('albums/:albumId')
  getAlbum(
    @Param('storefront') storefront: string,
    @Param('albumId') albumId: string,
  ) {
    return this.songsService.getCatalogAlbum({ storefront, albumId });
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
  ) {
    return this.songsService.getCatalogArtistAlbums({ storefront, artistId });
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
}

@Controller('studio/catalog')
@UseGuards(StrictJwtAuthGuard, ArtistOrAdminGuard)
export class ArtistStudioCatalogController {
  constructor(private readonly songsService: SongsService) {}

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

  @Post('songs/:songId/lyrics')
  saveSongLyrics(
    @Req() req: Request,
    @Param('songId') songId: string,
    @Body()
    body: {
      language?: string;
      sourceLrc?: string;
      publish?: boolean;
      syncMode?: 'LINE' | 'WORD';
      lines?: Array<{
        startTimeMs: number;
        endTimeMs: number;
        text: string;
        words?: Array<{
          startTimeMs: number;
          endTimeMs: number;
          text: string;
        }>;
      }>;
    },
  ) {
    return this.songsService.upsertSongLyrics({
      songId,
      language: body.language?.trim() || 'vi',
      sourceLrc: body.sourceLrc || '',
      publish: Boolean(body.publish),
      syncMode: body.syncMode === 'WORD' ? 'WORD' : 'LINE',
      actorUserId: (req.user as JwtUser).userId,
      canManageAllSongs: false,
      lines: (body.lines || []).map((line, position) => ({
        ...line,
        position,
        words: (line.words || []).map((word, wordPosition) => ({
          ...word,
          position: wordPosition,
        })),
      })),
    });
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

  @Post('songs/:songId/lyrics')
  saveSongLyrics(
    @Req() req: Request,
    @Param('songId') songId: string,
    @Body()
    body: {
      language?: string;
      sourceLrc: string;
      publish?: boolean;
      syncMode?: 'LINE' | 'WORD';
    },
  ) {
    return this.songsService.upsertSongLyrics({
      songId,
      language: body.language?.trim() || 'vi',
      sourceLrc: body.sourceLrc,
      publish: Boolean(body.publish),
      syncMode: body.syncMode === 'WORD' ? 'WORD' : 'LINE',
      actorUserId: (req.user as JwtUser).userId,
      canManageAllSongs: true,
      lines: [],
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

  @Get('drafts')
  listDrafts(
    @Query('storefront') storefront?: string,
    @Query('resourceType') resourceType?: string,
    @Query('status') draftStatus?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.songsService.listCatalogDrafts({
      storefront: storefront || '',
      resourceType: resourceType || '',
      status: this.draftStatus(draftStatus),
      cursor: cursor || '',
      limit: Number(limit) || 20,
    });
  }

  @Get('drafts/:draftId')
  getDraft(@Param('draftId') draftId: string) {
    return this.songsService.getCatalogDraft({ draftId });
  }

  @Post('drafts/:draftId/publish')
  publishDraft(@Req() req: Request, @Param('draftId') draftId: string) {
    return this.songsService.publishCatalogDraft({
      draftId,
      actorUserId: (req.user as JwtUser).userId,
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
      default:
        return CatalogDraftStatus.CATALOG_DRAFT_STATUS_UNSPECIFIED;
    }
  }
}
