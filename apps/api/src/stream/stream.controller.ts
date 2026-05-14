import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StreamService } from './stream.service';

@Controller('stream')
@UseGuards(JwtAuthGuard)
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Get(':songId')
  getStreamUrl(@Param('songId') songId: string) {
    return this.streamService.getStreamUrl(songId);
  }
}
