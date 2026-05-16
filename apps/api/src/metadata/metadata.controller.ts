import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompactMetadataResponse, MetadataService } from './metadata.service';

@Controller('metadata')
@UseGuards(JwtAuthGuard)
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get(':songId')
  async getStreamData(
    @Param('songId') songId: string,
  ): Promise<CompactMetadataResponse> {
    return this.metadataService.getCompactStreamData(songId);
  }
}