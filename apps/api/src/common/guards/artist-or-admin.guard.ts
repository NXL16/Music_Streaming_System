import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@musical/shared-types';
import type { AuthenticatedRequest } from './strict-jwt-auth.guard';

@Injectable()
export class ArtistOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;
    const allowedRoles = new Set<UserRole>([
      UserRole.ARTIST,
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN_USER_OPS,
      UserRole.ADMIN_SECURITY_OPS,
    ]);

    if (!role || !allowedRoles.has(role)) {
      throw new ForbiddenException({
        code: 'SONG_UPLOAD_FORBIDDEN',
        message: 'Chỉ nghệ sĩ hoặc quản trị viên được phép tải nhạc lên',
      });
    }

    return true;
  }
}
