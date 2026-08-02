import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtUser } from '@musical/shared-types';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { ExchangeRoomCodeDto } from './dto/exchange-room-code.dto';
import { SsoService } from './sso.service';

@Controller('sso/room')
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  @Post('start')
  @UseGuards(StrictJwtAuthGuard)
  async startRoomSso(@Req() req: Request) {
    const data = await this.ssoService.createRoomRedirect(req.user as JwtUser);
    return {
      success: true,
      code: 'ROOM_SSO_STARTED',
      message: 'Đã tạo mã đăng nhập Room',
      data,
    };
  }

  @Post('exchange')
  async exchangeRoomCode(
    @Body() dto: ExchangeRoomCodeDto,
    @Headers('x-room-client-secret') clientSecret: string | undefined,
  ) {
    const data = await this.ssoService.exchangeRoomCode(dto.code, clientSecret);
    return {
      success: true,
      code: 'ROOM_SSO_EXCHANGED',
      message: 'Đã xác thực người dùng cho Room',
      data,
    };
  }
}
