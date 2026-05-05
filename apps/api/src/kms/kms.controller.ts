import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { KmsService } from './kms.service';
import { KeyResponse } from '@musical/shared-proto';

@Controller('kms')
export class KmsController {
  constructor(private readonly kmsService: KmsService) {}

  @Post('generate/:songId')
  async generate(
    @Param('songId') songId: string,
    @Query('userId') userId: string,
  ): Promise<KeyResponse> {
    return await this.kmsService.generateKey(songId, userId);
  }

  @Get('key/:songId')
  async getKey(@Param('songId') songId: string): Promise<KeyResponse> {
    return await this.kmsService.getKey(songId);
  }
}
