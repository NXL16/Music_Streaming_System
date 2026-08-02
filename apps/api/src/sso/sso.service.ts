import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import type { JwtUser } from '@musical/shared-types';
import { AuthService } from '../auth/auth.service';

const ROOM_SSO_KEY_PREFIX = 'sso:room:code:';

@Injectable()
export class SsoService {
  constructor(
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async createRoomRedirect(user: JwtUser): Promise<{ redirectUrl: string }> {
    const callbackUrl = this.getRoomConfig('ROOM_SSO_CALLBACK_URL');
    const code = randomBytes(32).toString('base64url');
    const ttlSeconds = this.getCodeTtlSeconds();

    await this.redis.set(
      `${ROOM_SSO_KEY_PREFIX}${code}`,
      user.userId,
      'EX',
      ttlSeconds,
    );

    const redirectUrl = new URL(callbackUrl);
    redirectUrl.searchParams.set('code', code);
    return { redirectUrl: redirectUrl.toString() };
  }

  async exchangeRoomCode(code: string, clientSecret?: string) {
    this.assertRoomClientSecret(clientSecret);

    const userId = await this.redis.getdel(`${ROOM_SSO_KEY_PREFIX}${code}`);
    if (!userId) {
      throw new UnauthorizedException({
        code: 'ROOM_SSO_CODE_INVALID',
        message: 'Mã đăng nhập Room không hợp lệ hoặc đã hết hạn',
      });
    }

    const profile = await this.authService.getProfile({ userId });

    return {
      user: {
        id: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        role: profile.role,
      },
      permissions: ['room.use'],
    };
  }

  private assertRoomClientSecret(clientSecret?: string) {
    const expectedSecret = this.getRoomConfig('ROOM_SSO_CLIENT_SECRET');
    const received = Buffer.from(clientSecret ?? '');
    const expected = Buffer.from(expectedSecret);

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new UnauthorizedException({
        code: 'ROOM_SSO_CLIENT_UNAUTHORIZED',
        message: 'Room service không được phép đổi mã đăng nhập',
      });
    }
  }

  private getCodeTtlSeconds() {
    const rawValue = this.configService.get<string>(
      'ROOM_SSO_CODE_TTL_SECONDS',
      '60',
    );
    const ttlSeconds = Number(rawValue);
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 300) {
      throw new ServiceUnavailableException({
        code: 'ROOM_SSO_CONFIG_INVALID',
        message: 'ROOM_SSO_CODE_TTL_SECONDS phải từ 30 đến 300 giây',
      });
    }
    return ttlSeconds;
  }

  private getRoomConfig(key: string) {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException({
        code: 'ROOM_SSO_NOT_CONFIGURED',
        message: `Chưa cấu hình ${key}`,
      });
    }
    return value;
  }
}
