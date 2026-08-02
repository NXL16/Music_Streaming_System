import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  ROOM_MEDIA_CLIENT_SECRET_HEADER,
  ROOM_MEDIA_CONFIG,
} from './room-integration.constants';

@Injectable()
export class RoomClientAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config
      .get<string>(ROOM_MEDIA_CONFIG.clientSecret)
      ?.trim();
    if (!expected || expected.length < 32) {
      throw new ServiceUnavailableException({
        code: 'ROOM_MEDIA_NOT_CONFIGURED',
        message: 'Room media integration chưa được cấu hình',
      });
    }

    const request = context.switchToHttp().getRequest<Request>();
    const received = Buffer.from(
      String(request.headers[ROOM_MEDIA_CLIENT_SECRET_HEADER] ?? ''),
    );
    const expectedBuffer = Buffer.from(expected);

    if (
      received.length !== expectedBuffer.length ||
      !timingSafeEqual(received, expectedBuffer)
    ) {
      throw new UnauthorizedException({
        code: 'ROOM_MEDIA_CLIENT_UNAUTHORIZED',
        message: 'Room service không được phép dùng kho nhạc',
      });
    }

    return true;
  }
}
