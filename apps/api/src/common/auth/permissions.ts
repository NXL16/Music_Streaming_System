import type { UserRole } from '@musical/shared-types';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  USER: [],
  ARTIST: [],
  SUPER_ADMIN: [
    'user.read',
    'user.status.update',
    'user.sessions.revoke',
    'user.2fa.reset',
    'user.role.update',
    'recommendation.manage',
    'catalog.manage',
    'asset.manage',
  ],
  ADMIN_USER_OPS: ['user.read', 'user.status.update'],
  ADMIN_SECURITY_OPS: ['user.sessions.revoke', 'user.2fa.reset'],
};
