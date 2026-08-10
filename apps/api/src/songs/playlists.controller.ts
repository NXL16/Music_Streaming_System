import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SongsService } from './songs.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
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
  @MaxLength(255)
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
  @MaxLength(255)
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

@Controller('playlists')
@UseGuards(StrictJwtAuthGuard)
export class PlaylistsController {
  constructor(
    private readonly songsService: SongsService,
    private readonly recommendationsService: RecommendationsService,
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

  @Get(':id')
  async getOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtUser;
    return await this.songsService.getPlaylist({
      playlistId: id,
      requesterUserId: user.userId,
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
    return result;
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
