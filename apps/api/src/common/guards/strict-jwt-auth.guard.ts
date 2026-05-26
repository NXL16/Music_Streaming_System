import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  AuthState,
  JwtUser,
  authAccessBlacklistKey,
  authDevicesKey,
  authStateKey,
} from '@musical/shared-types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Inject } from '@nestjs/common';

@Injectable()
export class StrictJwtAuthGuard extends JwtAuthGuard implements CanActivate {
  constructor(@Inject('REDIS_INSTANCE') private readonly redis: Redis) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = await super.canActivate(context);
    if (!ok) return false;

    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = request.user;

    if (!user?.jti) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Token không hợp lệ',
      });
    }

    const [blacklisted, rawState, deviceActive] = await Promise.all([
      this.redis.get(authAccessBlacklistKey(user.jti)),
      this.redis.get(authStateKey(user.userId)),
      this.redis.sismember(authDevicesKey(user.userId), user.deviceId),
    ]);

    if (blacklisted) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_REVOKED',
        message: 'Phiên đăng nhập đã bị thu hồi',
      });
    }

    if (!deviceActive) {
      throw new UnauthorizedException({
        code: 'AUTH_DEVICE_REVOKED',
        message: 'Phiên đăng nhập của thiết bị đã bị thu hồi',
      });
    }

    if (!rawState) return true;

    const state = JSON.parse(rawState) as AuthState;

    if (!state.isActive) {
      throw new ForbiddenException({
        code: 'AUTH_USER_LOCKED',
        message: 'Tài khoản đã bị khóa',
      });
    }

    if (state.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_VERSION_INVALID',
        message: 'Phiên đăng nhập đã hết hiệu lực',
      });
    }

    return true;
  }
}
