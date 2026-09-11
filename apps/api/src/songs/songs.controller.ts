import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
  Delete,
  HttpStatus,
  HttpCode,
  Req,
  UseGuards,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { SongsService } from './songs.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import type {
  UpdateSongProcessingResultRequest,
  ListSongsRequest,
  GetSongRequest,
} from '@musical/shared-proto';
import { RequestUploadDto } from './dto/request-upload.dto';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';
import type { Request } from 'express';
import { JwtUser } from '@musical/shared-types';
import { ConfigService } from '@nestjs/config';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { ArtistOrAdminGuard } from '../common/guards/artist-or-admin.guard';

@Controller('songs')
export class SongsController {
  private static readonly UPLOAD_MEMBER_ROLES = [
    'OWNER',
    'MANAGER',
    'PRODUCTION',
  ];
  private static readonly ADMIN_ROLES = new Set([
    'SUPER_ADMIN',
    'ADMIN_USER_OPS',
    'ADMIN_SECURITY_OPS',
  ]);

  constructor(
    private readonly songsService: SongsService,
    private readonly configService: ConfigService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Post('request-upload')
  @UseGuards(StrictJwtAuthGuard, ArtistOrAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async requestUpload(
    @Req() req: Request,
    @Body() requestDto: RequestUploadDto,
  ) {
    const user = req.user as JwtUser;
    if (!SongsController.ADMIN_ROLES.has(user.role)) {
      const permission = await this.songsService.checkArtistPermission({
        artistId: requestDto.artistId,
        userId: user.userId,
        allowedRoles: SongsController.UPLOAD_MEMBER_ROLES,
      });
      if (!permission.allowed) {
        throw new UnauthorizedException({
          code: 'ARTIST_WORKSPACE_ACCESS_DENIED',
          message: 'Bạn không có quyền upload cho Artist workspace này',
        });
      }
    }
    return await this.songsService.requestUpload(requestDto, user.userId);
  }

  @Post('internal/finalize-upload')
  async finalizeUploadInternal(
    @Headers('x-internal-token') token: string | undefined,
    @Body() finalizeDto: FinalizeUploadDto,
  ) {
    const expectedToken = this.configService.get<string>(
      'FINALIZER_INTERNAL_TOKEN',
    );
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('INVALID_INTERNAL_TOKEN');
    }

    return await this.songsService.finalizeUpload(finalizeDto);
  }

  @Get()
  async findAll(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('userId') userId?: string,
  ) {
    const request: ListSongsRequest = {
      limit: limit ? Number(limit) : 10,
      cursor: cursor || '',
      search: '',
      artist: '',
      onlyPublic: true,
      requesterUserId: userId || '',
    };
    return await this.songsService.listSongs(request);
  }

  @Get('me')
  @UseGuards(StrictJwtAuthGuard)
  async findMine(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('artist') artist?: string,
  ) {
    const user = req.user as JwtUser;
    const request: ListSongsRequest = {
      limit: limit ? Number(limit) : 10,
      cursor: cursor || '',
      search: search || '',
      artist: artist || '',
      onlyPublic: false,
      requesterUserId: user.userId,
    };
    return await this.songsService.listSongs(request);
  }

  @Get('favorites')
  @UseGuards(StrictJwtAuthGuard)
  async listFavorites(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = req.user as JwtUser;
    return await this.songsService.listFavoriteSongs({
      userId: user.userId,
      limit: limit ? Number(limit) : 20,
      cursor: cursor || '',
    });
  }

  @Post('library/resources')
  @UseGuards(StrictJwtAuthGuard)
  async addLibraryResource(
    @Req() req: Request,
    @Body()
    body: {
      resourceType: string;
      resourceId: string;
      title?: string;
      subtitle?: string;
      artworkUrl?: string;
      sourceAlbumId?: string;
      sourceOrigin?: 'catalog' | 'favorite' | 'user-playlist';
      songIds?: string[];
      trackSources?: Array<{ songId: string; sourceAlbumId: string }>;
    },
  ) {
    const user = req.user as JwtUser;
    const result = await this.songsService.addLibraryResource({
      userId: user.userId,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      title: body.title || '',
      subtitle: body.subtitle || '',
      artworkUrl: body.artworkUrl || '',
      sourceAlbumId: body.sourceAlbumId || '',
      sourceOrigin: body.sourceOrigin,
      songIds: body.songIds,
      trackSources: body.trackSources,
    });
    return result;
  }

  @Get('library/resources')
  @UseGuards(StrictJwtAuthGuard)
  async listLibraryResources(@Req() req: Request) {
    const user = req.user as JwtUser;
    return this.songsService.listLibraryResources({ userId: user.userId });
  }

  @Get('library/songs')
  @UseGuards(StrictJwtAuthGuard)
  async listLibrarySongs(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('direction') direction?: string,
    @Query('songIds') songIds?: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.listLibrarySongs(user.userId, {
      cursor,
      limit: Number(limit) || 40,
      sortBy: sortBy === 'title' ? 'title' : 'recently-added',
      direction: direction === 'ascending' ? 'ascending' : 'descending',
      songIds: songIds?.split(',').filter(Boolean),
    });
  }

  @Get('library/media-cards')
  @UseGuards(StrictJwtAuthGuard)
  async listLibraryMediaCards(
    @Req() req: Request,
    @Query('storefront') storefront?: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.listLibraryMediaCards(
      user.userId,
      storefront?.trim() || 'vn',
    );
  }

  @Get('albums/:albumId/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async getAlbumFavorite(
    @Req() req: Request,
    @Param('albumId') albumId: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.getAlbumFavorite({ userId: user.userId, albumId });
  }

  @Get('albums/favorites')
  @UseGuards(StrictJwtAuthGuard)
  async listAlbumFavoriteIds(@Req() req: Request) {
    const user = req.user as JwtUser;
    return this.songsService.listAlbumFavoriteIds({ userId: user.userId });
  }

  @Post('albums/:albumId/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async favoriteAlbum(@Req() req: Request, @Param('albumId') albumId: string) {
    const user = req.user as JwtUser;
    return this.songsService.addAlbumFavorite({ userId: user.userId, albumId });
  }

  @Delete('albums/:albumId/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async unfavoriteAlbum(
    @Req() req: Request,
    @Param('albumId') albumId: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.removeAlbumFavorite({
      userId: user.userId,
      albumId,
    });
  }

  @Get('playlists/:playlistId/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async getPlaylistFavorite(
    @Req() req: Request,
    @Param('playlistId') playlistId: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.getPlaylistFavorite({
      userId: user.userId,
      playlistId,
    });
  }

  @Get('playlists/favorites')
  @UseGuards(StrictJwtAuthGuard)
  async listPlaylistFavoriteIds(@Req() req: Request) {
    const user = req.user as JwtUser;
    return this.songsService.listPlaylistFavoriteIds({ userId: user.userId });
  }

  @Post('playlists/:playlistId/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async favoritePlaylist(
    @Req() req: Request,
    @Param('playlistId') playlistId: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.addPlaylistFavorite({
      userId: user.userId,
      playlistId,
    });
  }

  @Delete('playlists/:playlistId/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async unfavoritePlaylist(
    @Req() req: Request,
    @Param('playlistId') playlistId: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.removePlaylistFavorite({
      userId: user.userId,
      playlistId,
    });
  }

  @Get(':songId/lyrics')
  async getLyrics(@Param('songId') songId: string) {
    // Lyrics are published independently of the Song row. Resolve the song
    // through the public visibility policy first so a private owner's lyrics
    // cannot be enumerated through this otherwise public endpoint.
    await this.songsService.getSong({ songId, requesterUserId: '' });
    return this.songsService.getSongLyrics({ songId, includeDraft: false });
  }

  @Delete('library/resources/:resourceType/:resourceId')
  @UseGuards(StrictJwtAuthGuard)
  async removeLibraryResource(
    @Req() req: Request,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @Body()
    body: {
      sourceOrigin?: 'catalog' | 'favorite' | 'user-playlist';
      songIds?: string[];
      trackSources?: Array<{ songId: string; sourceAlbumId: string }>;
    },
  ) {
    const user = req.user as JwtUser;
    const result = await this.songsService.removeLibraryResource({
      userId: user.userId,
      resourceType,
      resourceId,
      title: '',
      subtitle: '',
      artworkUrl: '',
      sourceAlbumId: '',
      sourceOrigin: body?.sourceOrigin,
      songIds: body?.songIds,
      trackSources: body?.trackSources,
    });
    if (result.deletedUserPlaylist) {
      await this.recommendationsService.cleanupPlaylistHistory({
        userId: user.userId,
        playlistId: resourceId,
      });
    }
    return result;
  }

  @Post('library/resources/:resourceType/:resourceId/pin')
  @UseGuards(StrictJwtAuthGuard)
  async pinLibraryResource(
    @Req() req: Request,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.pinLibraryResource({
      userId: user.userId,
      resourceType,
      resourceId,
      title: '',
      subtitle: '',
      artworkUrl: '',
      sourceAlbumId: '',
    });
  }

  @Delete('library/resources/:resourceType/:resourceId/pin')
  @UseGuards(StrictJwtAuthGuard)
  async unpinLibraryResource(
    @Req() req: Request,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.unpinLibraryResource({
      userId: user.userId,
      resourceType,
      resourceId,
      title: '',
      subtitle: '',
      artworkUrl: '',
      sourceAlbumId: '',
    });
  }

  @Get(':id')
  async findOnePublic(@Param('id') id: string) {
    const request: GetSongRequest = {
      songId: id,
      requesterUserId: '',
    };
    return await this.songsService.getSong(request);
  }

  @Get('private/:id')
  @UseGuards(StrictJwtAuthGuard)
  async findOnePrivate(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtUser;
    const request: GetSongRequest = {
      songId: id,
      requesterUserId: user.userId,
    };
    return await this.songsService.getSong(request);
  }

  @Patch('internal/processing-result')
  async updateStatus(
    @Headers('x-internal-token') token: string | undefined,
    @Body() updateDto: UpdateSongProcessingResultRequest,
  ) {
    const expectedToken = this.configService.get<string>(
      'FINALIZER_INTERNAL_TOKEN',
    );
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('INVALID_INTERNAL_TOKEN');
    }

    return await this.songsService.updateSongProcessingResult(updateDto);
  }

  @Post(':id/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async favorite(
    @Req() req: Request,
    @Param('id') songId: string,
    @Body() body: { sourceAlbumId?: string },
  ) {
    const user = req.user as JwtUser;
    const result = await this.songsService.addFavorite({
      userId: user.userId,
      songId,
      sourceAlbumId: body.sourceAlbumId || '',
    });
    return result;
  }

  @Delete(':id/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async unfavorite(@Req() req: Request, @Param('id') songId: string) {
    const user = req.user as JwtUser;
    const result = await this.songsService.removeFavorite({
      userId: user.userId,
      songId,
      sourceAlbumId: '',
    });
    return result;
  }

  @Delete(':id')
  @UseGuards(StrictJwtAuthGuard)
  async deleteSong(@Req() req: Request, @Param('id') songId: string) {
    const user = req.user as JwtUser;
    return await this.songsService.unlinkSong(songId, user.userId);
  }
}
