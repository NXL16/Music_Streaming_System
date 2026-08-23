import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtUser } from '@musical/shared-types';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { PlaybackAccessService } from '../playback-access/playback-access.service';
import { CompactMetadataResponse, MetadataService } from './metadata.service';

@Controller('metadata')
@UseGuards(StrictJwtAuthGuard)
export class MetadataController {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly playbackAccess: PlaybackAccessService,
  ) {}

  @Get(':songId')
  async getStreamData(
    @Param('songId', ParseUUIDPipe) songId: string,
    @Query('variant') variant = '',
    @Req() request: { user: JwtUser },
  ): Promise<CompactMetadataResponse> {
    await this.playbackAccess.assertCanPlay(songId, request.user);
    return this.metadataService.getCompactStreamData(songId, variant);
  }
}
