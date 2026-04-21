import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtUser } from '@musical/shared-types';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KmsService } from './kms.service';

@Controller('kms')
export class KmsController {
  constructor(
    private readonly kmsService: KmsService,
    private readonly configService: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard, AdminGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('test-generate/:songId')
  async testGenerateKey(@Param('songId') songId: string, @Req() req: Request) {
    const nodeEnv = this.configService.get<string>('NODE_ENV')?.toLowerCase();
    if (nodeEnv === 'production') {
      throw new NotFoundException({
        code: 'KMS_TEST_ENDPOINT_DISABLED',
        message: 'Endpoint test KMS đã bị vô hiệu hóa ở production',
      });
    }

    const user = req.user as JwtUser;
    const response = await this.kmsService.generateKey(songId, user.userId);

    // Chuyển Uint8Array sang chuỗi Hex để dễ đọc trên JSON / Trình duyệt
    return {
      message: 'Gọi gRPC sang KMS thành công!',
      key_id: response.key_id,
      key_hex: Buffer.from(response.key).toString('hex'), // Khóa AES (16 bytes)
      iv_hex: Buffer.from(response.iv).toString('hex'), // IV (16 bytes)
    };
  }
}
