import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { SongsService } from './songs.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { R2Service } from '../common/r2/r2.service';
import {
  generatePlaylistCoverRenditions,
  PLAYLIST_ARTWORK_WIDTHS,
  PLAYLIST_HERO_ARTWORK_WIDTHS,
} from '@musical/playlist-cover-renderer';
import type { Request } from 'express';
import { JwtUser } from '@musical/shared-types';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

class CreatePlaylistDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}

class UpdatePlaylistDto {
  @IsString()
  @IsOptional()
  @MaxLength(32)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}

class AddTrackDto {
  @IsString()
  @IsNotEmpty()
  songId!: string;
}

class CreatePlaylistFromSourceDto extends CreatePlaylistDto {
  @IsObject()
  @IsNotEmpty()
  source!: {
    kind: 'song' | 'collection';
    songId?: string;
    songIds?: string[];
    resourceType?: 'albums' | 'playlists';
    resourceId?: string;
    sourceOrigin?: 'catalog' | 'favorite' | 'user-playlist';
  };
}

class AddPlaylistSourceDto {
  @IsObject()
  @IsNotEmpty()
  source!: CreatePlaylistFromSourceDto['source'];
}

const PLAYLIST_ARTWORK_PUBLIC_URL = 'https://r2.404hz.me';

@Controller('playlists')
@UseGuards(StrictJwtAuthGuard)
export class PlaylistsController {
  private readonly logger = new Logger(PlaylistsController.name);

  constructor(
    private readonly songsService: SongsService,
    private readonly recommendationsService: RecommendationsService,
    private readonly r2Service: R2Service,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() dto: CreatePlaylistDto) {
    const user = req.user as JwtUser;
    return await this.songsService.createUserPlaylist({
      userId: user.userId,
      name: dto.name,
      description: dto.description || '',
      isPublic: dto.isPublic ?? false,
    });
  }

  @Post('from-source')
  @HttpCode(HttpStatus.CREATED)
  async createFromSource(
    @Req() req: Request,
    @Body() dto: CreatePlaylistFromSourceDto,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.createPlaylistFromSource(user.userId, dto);
  }

  @Post(':id/generate-cover')
  async generateCover(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtUser;
    const playlist = await this.assertPlaylistOwner(user.userId, id);
    // Cover generation is a create-time operation. Returning the persisted
    // cover makes retries harmless and prevents an existing playlist's artwork
    // from being overwritten by a later request.
    if (playlist.artworkUrl) {
      return { artworkUrl: playlist.artworkUrl };
    }
    // Never use client-supplied artwork text: concurrent retries must render
    // identical bytes for the playlist's deterministic R2 object keys.
    const renditions = await generatePlaylistCoverRenditions(playlist.name, id);
    try {
      const uploads = [
        ...PLAYLIST_ARTWORK_WIDTHS.map((width) => {
          const rendition = renditions.cover.get(width);
          if (!rendition) throw new Error('PLAYLIST_COVER_RENDER_FAILED');
          return { key: this.coverObjectKey(id, width), rendition };
        }),
        ...PLAYLIST_HERO_ARTWORK_WIDTHS.map((width) => {
          const rendition = renditions.hero.get(width);
          if (!rendition) throw new Error('PLAYLIST_HERO_RENDER_FAILED');
          return { key: this.heroCoverObjectKey(id, width), rendition };
        }),
      ];
      const uploadResults = await Promise.allSettled(
        uploads.map(({ key, rendition }) =>
          this.r2Service.putObject(key, rendition, 'image/webp'),
        ),
      );
      const failedUpload = uploadResults.find(
        (result) => result.status === 'rejected',
      );
      if (failedUpload?.status === 'rejected') throw failedUpload.reason;
      const artworkUrl = this.r2Service.publicUrl(
        this.coverObjectKey(id, 632),
        PLAYLIST_ARTWORK_PUBLIC_URL,
      );
      await this.songsService.updateUserPlaylist({
        userId: user.userId,
        playlistId: id,
        name: '',
        description: '',
        isPublic: false,
        hasName: false,
        hasDescription: false,
        hasIsPublic: false,
        coverUrl: artworkUrl,
        hasCoverUrl: true,
      });
      return { artworkUrl };
    } catch (error) {
      await this.deletePlaylistArtwork(id);
      throw error;
    }
  }

  @Post('source-memberships')
  async sourceMemberships(
    @Req() req: Request,
    @Body() dto: AddPlaylistSourceDto,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.getPlaylistSourceMembershipForUser(
      user.userId,
      dto.source,
    );
  }

  @Get(':id/tracks')
  async listTracks(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.listPlaylistTracks({
      playlistId: id,
      requesterUserId: user.userId,
      cursor: cursor || '',
      limit: limit ? Number(limit) : 40,
    });
  }

  @Get(':id')
  async getOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('includeTracks') includeTracks?: string,
  ) {
    const user = req.user as JwtUser;
    return await this.songsService.getPlaylist({
      playlistId: id,
      requesterUserId: user.userId,
      includeSongs: includeTracks !== 'false',
    });
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePlaylistDto,
  ) {
    const user = req.user as JwtUser;
    return await this.songsService.updateUserPlaylist({
      userId: user.userId,
      playlistId: id,
      name: dto.name || '',
      description: dto.description || '',
      isPublic: dto.isPublic ?? false,
      hasName: dto.name !== undefined,
      hasDescription: dto.description !== undefined,
      hasIsPublic: dto.isPublic !== undefined,
      coverUrl: '',
      hasCoverUrl: false,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtUser;
    const result = await this.songsService.deleteUserPlaylist({
      userId: user.userId,
      playlistId: id,
    });
    await this.recommendationsService.cleanupPlaylistHistory({
      userId: user.userId,
      playlistId: id,
    });
    // A deleted playlist has no remaining reference to its deterministic
    // artwork keys. Storage cleanup is best-effort because the DB deletion is
    // already committed and must not be reported as failed to the user.
    await this.deletePlaylistArtwork(id);
    return result;
  }

  private coverObjectKey(playlistId: string, width: number) {
    return `processed/${encodeURIComponent(playlistId)}/artwork/${width}w.webp`;
  }

  private heroCoverObjectKey(playlistId: string, width: number) {
    return `processed/${encodeURIComponent(playlistId)}/artwork/hero/${width}w.webp`;
  }

  private async deletePlaylistArtwork(playlistId: string) {
    await Promise.all(
      [
        ...PLAYLIST_ARTWORK_WIDTHS.map((width) =>
          this.coverObjectKey(playlistId, width),
        ),
        ...PLAYLIST_HERO_ARTWORK_WIDTHS.map((width) =>
          this.heroCoverObjectKey(playlistId, width),
        ),
      ].map((key) =>
        this.r2Service.deleteObject(key).catch((error: unknown) => {
          this.logger.warn(
            `Could not remove playlist artwork ${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }),
      ),
    );
  }

  private async assertPlaylistOwner(userId: string, playlistId: string) {
    const result = await this.songsService.getPlaylist({
      playlistId,
      requesterUserId: userId,
      includeSongs: false,
    });
    if (result.playlist?.ownerId !== userId) {
      throw new ForbiddenException('PLAYLIST_ACCESS_DENIED');
    }
    return result.playlist;
  }

  @Get('user/:userId')
  async listUserPlaylists(
    @Req() req: Request,
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const user = req.user as JwtUser;
    return await this.songsService.listUserPlaylists({
      userId,
      requesterUserId: user.userId,
      limit: limit ? Number(limit) : 10,
      cursor: cursor || '',
    });
  }

  @Post(':id/tracks')
  @HttpCode(HttpStatus.OK)
  async addTrack(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AddTrackDto,
  ) {
    const user = req.user as JwtUser;
    return await this.songsService.addTrackToPlaylist({
      userId: user.userId,
      playlistId: id,
      songId: dto.songId,
    });
  }

  @Post(':id/from-source')
  @HttpCode(HttpStatus.OK)
  async addSource(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: AddPlaylistSourceDto,
  ) {
    const user = req.user as JwtUser;
    return this.songsService.addPlaylistSource(user.userId, id, dto.source);
  }

  @Delete(':id/tracks/:songId')
  @HttpCode(HttpStatus.OK)
  async removeTrack(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('songId') songId: string,
  ) {
    const user = req.user as JwtUser;
    return await this.songsService.removeTrackFromPlaylist({
      userId: user.userId,
      playlistId: id,
      songId,
    });
  }
}
