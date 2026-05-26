import type { UserRole } from '@musical/shared-types';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  USER: [],
  ARTIST: [],
  ADMIN: [
    'user.read',
    'user.status.update',
    'user.sessions.revoke',
    'user.2fa.reset',
  ],
};
