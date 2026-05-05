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
} from '@nestjs/common';
import { SongsService } from './songs.service';
import type {
  UpdateSongProcessingResultRequest,
  ListSongsRequest,
  GetSongRequest,
} from '@musical/shared-proto';
import { RequestUploadDto } from './dto/request-upload.dto';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';

@Controller('songs')
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Post('request-upload')
  @HttpCode(HttpStatus.CREATED)
  async requestUpload(@Body() requestDto: RequestUploadDto) {
    return await this.songsService.requestUpload(requestDto);
  }

  @Post('finalize-upload')
  async finalizeUpload(@Body() finalizeDto: FinalizeUploadDto) {
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
