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
  constructor(
    private readonly songsService: SongsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('request-upload')
  @UseGuards(StrictJwtAuthGuard, ArtistOrAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async requestUpload(
    @Req() req: Request,
    @Body() requestDto: RequestUploadDto,
  ) {
    const user = req.user as JwtUser;
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
    },
  ) {
    const user = req.user as JwtUser;
    return this.songsService.addLibraryResource({
      userId: user.userId,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      title: body.title || '',
      subtitle: body.subtitle || '',
      artworkUrl: body.artworkUrl || '',
    });
  }

  @Get('library/resources')
  @UseGuards(StrictJwtAuthGuard)
  async listLibraryResources(@Req() req: Request) {
    const user = req.user as JwtUser;
    return this.songsService.listLibraryResources({ userId: user.userId });
  }

  @Delete('library/resources/:resourceType/:resourceId')
  @UseGuards(StrictJwtAuthGuard)
  async removeLibraryResource(@Req() req: Request, @Param('resourceType') resourceType: string, @Param('resourceId') resourceId: string) {
    const user = req.user as JwtUser;
    return this.songsService.removeLibraryResource({ userId: user.userId, resourceType, resourceId, title: '', subtitle: '', artworkUrl: '' });
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
  async favorite(@Req() req: Request, @Param('id') songId: string) {
    const user = req.user as JwtUser;
    return await this.songsService.addFavorite({ userId: user.userId, songId });
  }

  @Delete(':id/favorite')
  @UseGuards(StrictJwtAuthGuard)
  async unfavorite(@Req() req: Request, @Param('id') songId: string) {
    const user = req.user as JwtUser;
    return await this.songsService.removeFavorite({
      userId: user.userId,
      songId,
    });
  }

  @Delete(':id')
  @UseGuards(StrictJwtAuthGuard)
  async deleteSong(@Req() req: Request, @Param('id') songId: string) {
    const user = req.user as JwtUser;
    return await this.songsService.unlinkSong(songId, user.userId);
  }
}
