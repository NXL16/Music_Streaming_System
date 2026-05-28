import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtUser } from '@musical/shared-types';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLE_PERMISSIONS } from '../auth/permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Bạn chưa đăng nhập',
      });
    }

    const granted = ROLE_PERMISSIONS[user.role] ?? [];
    const ok = required.every((permission) => granted.includes(permission));

    if (!ok) {
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    }

    return true;
  }
}
