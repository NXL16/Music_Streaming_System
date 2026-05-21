import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  UserMetadata,
  UserMetadataDocument,
} from './schemas/user-metadata.schema';
import { UserEntity } from './entities/user.entity';
import { User as PrismaUser } from '../generated/prisma/client';
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

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,

    @InjectModel(UserMetadata.name)
    private readonly metadataModel: Model<UserMetadataDocument>,
  ) {}

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
  async changePassword(id: string, newPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        password: newPassword,
        lastPasswordChangeAt: new Date(),
        tokenVersion: {
          increment: 1,
        },
      },
    });
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
