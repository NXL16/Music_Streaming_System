import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StreamService } from './stream.service';

@Controller('stream')
@UseGuards(JwtAuthGuard)
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Get(':songId')
  async getStreamUrl(@Param('songId', ParseUUIDPipe) songId: string) {
    return this.streamService.getStreamUrl(songId);
  }
}
