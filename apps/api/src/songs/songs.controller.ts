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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { Request } from 'express';
import { JwtUser } from '@musical/shared-types';
import { ConfigService } from '@nestjs/config';

@Controller('songs')
export class SongsController {
  constructor(
    private readonly songsService: SongsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('request-upload')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async requestUpload(@Req() req: Request, @Body() requestDto: RequestUploadDto) {
    const user = req.user as JwtUser;
    return await this.songsService.requestUpload(requestDto, user.userId);
  }

  @Post('finalize-upload')
  @UseGuards(JwtAuthGuard)
  async finalizeUpload(@Req() req: Request, @Body() finalizeDto: FinalizeUploadDto) {
    const user = req.user as JwtUser;
    return await this.songsService.finalizeUpload(finalizeDto, user.userId);
  }

  @Post('internal/finalize-upload')
  async finalizeUploadInternal(
    @Headers('x-internal-token') token: string | undefined,
    @Body() finalizeDto: FinalizeUploadDto,
  ) {
    const expectedToken = this.configService.get<string>('FINALIZER_INTERNAL_TOKEN');
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

  @Get(':id')
  async findOne(@Param('id') id: string, @Query('userId') userId?: string) {
    const request: GetSongRequest = {
      songId: id,
      requesterUserId: userId || '',
    };
    return await this.songsService.getSong(request);
  }

  @Patch('processing-result')
  async updateStatus(@Body() updateDto: UpdateSongProcessingResultRequest) {
    return await this.songsService.updateSongProcessingResult(updateDto);
  }

  @Post(':id/favorite')
  async favorite(@Param('id') songId: string, @Body('userId') userId: string) {
    return await this.songsService.addFavorite({ userId, songId });
  }

  @Delete(':id/favorite')
  async unfavorite(
    @Param('id') songId: string,
    @Body('userId') userId: string,
  ) {
    return await this.songsService.removeFavorite({ userId, songId });
  }
}
