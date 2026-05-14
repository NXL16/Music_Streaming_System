import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { KmsService } from './kms.service';
import { KeyResponse } from '@musical/shared-proto';

type KmsHttpResponse = {
  songId: string;
  encryptionKey: string;
  iv: string;
  createdAt: string;
};

@Controller('kms')
export class KmsController {
  constructor(private readonly kmsService: KmsService) {}

  @Post('generate/:songId')
  async generate(
    @Param('songId') songId: string,
    @Query('userId') userId: string,
  ): Promise<KmsHttpResponse> {
    const result = await this.kmsService.generateKey(songId, userId);
    return this.toHttpResponse(result);
  }

  @Get('key/:songId')
  async getKey(@Param('songId') songId: string): Promise<KmsHttpResponse> {
    const result = await this.kmsService.getKey(songId);
    return this.toHttpResponse(result);
  }

  private toHttpResponse(result: KeyResponse): KmsHttpResponse {
    return {
      songId: result.songId,
      encryptionKey: Buffer.from(result.encryptionKey).toString('base64'),
      iv: Buffer.from(result.iv).toString('base64'),
      createdAt: String(result.createdAt),
    };
  }
}
