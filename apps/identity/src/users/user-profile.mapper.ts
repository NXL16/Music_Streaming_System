import type { UserProfile } from '@musical/shared-proto';
import { UserEntity } from './entities/user.entity';

export function mapUserProfile(user: UserEntity): UserProfile {
  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: String(user.role),
    createdAt: user.createdAt.getTime(),
    avatar: user.avatar ?? undefined,
    bio: user.bio ?? '',
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt?.getTime(),
    updatedAt: user.updatedAt.getTime(),
  };
}
