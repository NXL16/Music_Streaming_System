import { UserRole } from '../../generated/prisma/enums';

export class UserEntity {
  // Dữ liệu từ PostgreSQL
  id!: string;
  username!: string;
  email!: string;
  displayName!: string;
  role!: UserRole;
  isActive!: boolean;
  emailVerified!: boolean;
  twoFactorEnabled!: boolean;
  lastLoginAt?: Date | null;
  createdAt!: Date;
  updatedAt!: Date;

  // Dữ liệu từ MongoDB
  avatar?: string | null;
  bio?: string;
  permissions?: string[];
  stats?: {
    totalPlays: number;
    totalPlaytime: number;
    totalPlaylistsCreated: number;
    totalFollowers: number;
  };

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}
