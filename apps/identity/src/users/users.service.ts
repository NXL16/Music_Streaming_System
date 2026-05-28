import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  UserMetadata,
  UserMetadataDocument,
} from './schemas/user-metadata.schema';
import { UserEntity } from './entities/user.entity';
import { Prisma, User as PrismaUser } from '../generated/prisma/client';
import { OAuthProvider, UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../common/database/prisma.service';

type MetadataLean = {
  userId?: string;
  avatar?: string | null;
  bio?: string;
  permissions?: string[];
  stats?: {
    totalPlays: number;
    totalPlaytime: number;
    totalPlaylistsCreated: number;
    totalFollowers: number;
  };
};

type CreateUserInput = {
  username: string;
  email: string;
  password: string;
  displayName: string;
};

type UpdateUserInput = {
  displayName?: string;
  avatar?: string;
  bio?: string;
};

type AuthUserRecord = PrismaUser;

type ListUsersInput = {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  isActive?: boolean;
};

type ListUsersResult = {
  users: UserEntity[];
  total: number;
};

type RecoveryCodeInput = {
  codeHash: string;
};

type CreateSecurityAuditLogInput = {
  actorUserId?: string;
  targetUserId?: string;
  action: string;
  status: 'SUCCESS' | 'FAILURE';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,

    @InjectModel(UserMetadata.name)
    private readonly metadataModel: Model<UserMetadataDocument>,
  ) {}

  async createSecurityAuditLog(
    input: CreateSecurityAuditLogInput,
  ): Promise<void> {
    await this.prisma.securityAuditLog.create({
      data: {
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        action: input.action,
        status: input.status,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata,
      },
    });
  }

  // ================================
  // CREATE USER
  // ================================
  async create(data: CreateUserInput): Promise<UserEntity> {
    const user = await this.prisma.user.create({ data });

    try {
      const metadata = await this.metadataModel
        .create({ userId: user.id })
        .then((doc) => doc.toObject());

      return this.mapToEntity(user, metadata);
    } catch (error) {
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => {
        // best-effort rollback
      });

      throw new Error('Không thể tạo metadata người dùng', { cause: error });
    }
  }

  // ================================
  // FIND BY ID
  // ================================
  async findById(
    id: string,
    includeMetadata = false,
  ): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;

    let metadata: MetadataLean | null = null;

    if (includeMetadata) {
      metadata = await this.metadataModel.findOne({ userId: id }).lean();
    }

    return this.mapToEntity(user, metadata);
  }

  // ================================
  // FIND BY USERNAME
  // ================================
  async findByUsername(
    username: string,
    includeMetadata = false,
  ): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { username } });

    if (!user) return null;

    let metadata: MetadataLean | null = null;
    if (includeMetadata) {
      metadata = await this.metadataModel.findOne({ userId: user.id }).lean();
    }

    return this.mapToEntity(user, metadata);
  }

  // ================================
  // AUTH LOOKUP (WITH PASSWORD)
  // ================================
  async findAuthUserByUsername(
    username: string,
  ): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async findAuthUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  // ================================
  // AUTH LOOKUP (WITH PASSWORD)
  // ================================

  async findUserByGoogleSub(providerSub: string): Promise<UserEntity | null> {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerSub: {
          provider: OAuthProvider.GOOGLE,
          providerSub,
        },
      },
      select: { userId: true },
    });

    if (!account) return null;
    return this.findById(account.userId, false);
  }

  async linkGoogleAccount(
    userId: string,
    providerSub: string,
    emailAtProvider: string,
  ): Promise<void> {
    try {
      await this.prisma.oAuthAccount.create({
        data: {
          provider: OAuthProvider.GOOGLE,
          providerSub,
          userId,
          emailAtProvider,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }

      throw error;
    }
  }

  async markEmailVerified(userId: string): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    return this.mapToEntity(user, null);
  }

  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
        },
      }),
    ]);
  }

  async consumePasswordResetToken(
    tokenHash: string,
  ): Promise<AuthUserRecord | null> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!token || token.usedAt || token.expiresAt <= now) {
        return null;
      }

      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        return null;
      }

      return token.user;
    });
  }

  async createEmailVerificationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt,
        },
      }),
    ]);
  }

  async consumeEmailVerificationToken(
    tokenHash: string,
  ): Promise<UserEntity | null> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!token || token.usedAt || token.expiresAt <= now) {
        return null;
      }

      const consumed = await tx.emailVerificationToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        return null;
      }

      const user = await tx.user.update({
        where: { id: token.userId },
        data: { emailVerified: true },
      });

      return this.mapToEntity(user, null);
    });
  }

  async listUsers(input: ListUsersInput): Promise<ListUsersResult> {
    const where: Prisma.UserWhereInput = {};

    if (input.search) {
      where.OR = [
        { username: { contains: input.search, mode: 'insensitive' } },
        { email: { contains: input.search, mode: 'insensitive' } },
        { displayName: { contains: input.search, mode: 'insensitive' } },
      ];
    }

    if (
      input.role &&
      Object.values(UserRole).includes(input.role as UserRole)
    ) {
      where.role = input.role as UserRole;
    }

    if (typeof input.isActive === 'boolean') {
      where.isActive = input.isActive;
    }

    const skip = (input.page - 1) * input.limit;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: input.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map((user) => this.mapToEntity(user, null)),
      total,
    };
  }

  async updateRole(id: string, role: UserRole): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        role,
        tokenVersion: { increment: 1 },
      },
    });

    return this.mapToEntity(user, null);
  }

  // ================================
  // UPDATE USER (split DB)
  // ================================
  async update(id: string, data: UpdateUserInput): Promise<UserEntity> {
    // Update Postgres
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        displayName: data.displayName,
      },
    });

    // Update Mongo
    const metadata = await this.metadataModel
      .findOneAndUpdate(
        { userId: id },
        {
          $set: {
            avatar: data.avatar,
            bio: data.bio,
          },
        },
        { new: true, upsert: true }, // đảm bảo luôn có metadata
      )
      .lean();

    return this.mapToEntity(user, metadata);
  }

  // ================================
  // UPDATE LAST LOGIN
  // ================================
  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async incrementTokenVersion(id: string): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        tokenVersion: {
          increment: 1,
        },
      },
    });

    return this.mapToEntity(user, null);
  }

  // ================================
  // CHANGE PASSWORD
  // ================================
  async setActive(id: string, isActive: boolean): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        isActive,
        tokenVersion: {
          increment: 1,
        },
      },
    });

    return this.mapToEntity(user, null);
  }

  async changePassword(id: string, newPassword: string): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        password: newPassword,
        lastPasswordChangeAt: new Date(),
        tokenVersion: {
          increment: 1,
        },
      },
    });

    return this.mapToEntity(user, null);
  }

  async setTwoFactorPendingSecret(
    id: string,
    encryptedSecret: string,
  ): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: false,
      },
    });

    return this.mapToEntity(user, null);
  }

  async enableTwoFactor(id: string): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        twoFactorEnabled: true,
      },
    });

    return this.mapToEntity(user, null);
  }

  async replaceTwoFactorRecoveryCodes(
    userId: string,
    codes: RecoveryCodeInput[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.twoFactorRecoveryCode.deleteMany({
        where: { userId },
      }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: codes.map((code) => ({
          userId,
          codeHash: code.codeHash,
        })),
      }),
    ]);
  }

  async consumeTwoFactorRecoveryCode(
    userId: string,
    codeHash: string,
  ): Promise<boolean> {
    const result = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: {
        userId,
        codeHash,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    return result.count === 1;
  }

  async clearTwoFactorRecoveryCodes(userId: string): Promise<void> {
    await this.prisma.twoFactorRecoveryCode.deleteMany({
      where: { userId },
    });
  }

  async disableTwoFactor(id: string): Promise<UserEntity> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        tokenVersion: {
          increment: 1,
        },
      },
    });

    return this.mapToEntity(user, null);
  }

  // ================================
  // INTERNAL MAPPER (QUAN TRỌNG)
  // ================================
  private mapToEntity(
    user: PrismaUser,
    metadata: MetadataLean | null,
  ): UserEntity {
    return {
      // Postgres (typed)
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      tokenVersion: user.tokenVersion,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,

      // Mongo (safe access)
      avatar: metadata?.avatar ?? null,
      bio: metadata?.bio ?? '',
      permissions: metadata?.permissions ?? [],
      stats: metadata?.stats ?? {
        totalPlays: 0,
        totalPlaytime: 0,
        totalPlaylistsCreated: 0,
        totalFollowers: 0,
      },
    };
  }
}
