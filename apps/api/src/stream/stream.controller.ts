import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { JwtUser } from '@musical/shared-types';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { PlaybackAccessService } from '../playback-access/playback-access.service';
import { StreamService } from './stream.service';

@Controller('stream')
@UseGuards(StrictJwtAuthGuard)
export class StreamController {
  constructor(
    private readonly streamService: StreamService,
    private readonly playbackAccess: PlaybackAccessService,
  ) {}

  @Get(':songId/playback')
  async getPlaybackManifest(
    @Param('songId', ParseUUIDPipe) songId: string,
    @Req() request: { user: JwtUser },
  ) {
    try {
      await this.playbackAccess.assertCanPlay(songId, request.user);
      return await this.streamService.getPlaybackManifest(songId);
    } catch (error) {
      // A missing song has neither its mixed stream metadata nor both stems.
      if (isGrpcNotFound(error)) {
        throw new NotFoundException('Playback data is not available');
      }
      throw error;
    }
  }

  @Get(':songId')
  async getStreamUrl(
    @Param('songId', ParseUUIDPipe) songId: string,
    @Query('variant') variant = '',
    @Req() request: { user: JwtUser },
  ) {
    try {
      await this.playbackAccess.assertCanPlay(songId, request.user);
      return await this.streamService.getStreamUrl(songId, variant);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'INVALID_STREAM_VARIANT'
      ) {
        throw new BadRequestException('INVALID_STREAM_VARIANT');
      }
      throw error;
    }
  }
}

function isGrpcNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === status.NOT_FOUND
  );
}
