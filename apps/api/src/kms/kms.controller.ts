import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { KmsService } from './kms.service';

@Controller('kms')
export class KmsController {
  constructor(private readonly kmsService: KmsService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('test-generate/:songId')
  async testGenerateKey(@Param('songId') songId: string) {
    // Gọi gRPC sang KMS với một userId giả định
    const response = await this.kmsService.generateKey(songId, 'user-test-123');

    // Chuyển Uint8Array sang chuỗi Hex để dễ đọc trên JSON / Trình duyệt
    return {
      message: 'Gọi gRPC sang KMS thành công!',
      key_id: response.key_id,
      key_hex: Buffer.from(response.key).toString('hex'), // Khóa AES (16 bytes)
      iv_hex: Buffer.from(response.iv).toString('hex'), // IV (16 bytes)
    };
  }
}
