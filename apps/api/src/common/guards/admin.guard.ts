import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { AuthState, UserRole, authStateKey } from '@musical/shared-types';
import type { AuthenticatedRequest } from './strict-jwt-auth.guard';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject('REDIS_INSTANCE') private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    const allowedAdminRoles = new Set<UserRole>([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN_USER_OPS,
      UserRole.ADMIN_SECURITY_OPS,
    ]);

    if (!user || !allowedAdminRoles.has(user.role)) {
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    }

    let state = request.authState;
    if (!state) {
      const rawState = await this.redis.get(authStateKey(user.userId));
      if (!rawState) {
        throw new UnauthorizedException({
          code: 'AUTH_STATE_MISSING',
          message: 'Không thể xác thực trạng thái tài khoản',
        });
      }
      state = JSON.parse(rawState) as AuthState;
    }

    if (!state.emailVerified) {
      throw new ForbiddenException({
        code: 'AUTH_ADMIN_EMAIL_NOT_VERIFIED',
        message: 'Tài khoản quản trị phải xác thực email',
      });
    }

    if (!state.twoFactorEnabled) {
      throw new ForbiddenException({
        code: 'AUTH_ADMIN_2FA_REQUIRED',
        message: 'Tài khoản quản trị phải bật xác thực 2 bước',
      });
    }

    return true;
  }
}
