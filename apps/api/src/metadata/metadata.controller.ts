import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MetadataService } from './metadata.service';

@Controller('metadata')
@UseGuards(JwtAuthGuard)
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get(':songId')
  getStreamData(@Param('songId') songId: string) {
    return this.metadataService.getStreamData({ songId });
  }
}