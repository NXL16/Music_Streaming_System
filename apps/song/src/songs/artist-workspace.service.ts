import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  ArtistMembership,
  CheckArtistPermissionRequest,
  CheckArtistPermissionResponse,
  ListArtistMembersRequest,
  ListArtistMembersResponse,
  ListArtistWorkspacesRequest,
  ListArtistWorkspacesResponse,
  RemoveArtistMemberRequest,
  RemoveArtistMemberResponse,
  UpsertArtistMemberRequest,
} from '@musical/shared-proto';
import { ArtistMemberRole } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

// Canonical gRPC status values. Keeping these local prevents this domain service
// from taking a runtime dependency on the transport package.
const GRPC_STATUS = {
  INVALID_ARGUMENT: 3,
  NOT_FOUND: 5,
} as const;

const MEMBER_ROLES = new Set<ArtistMemberRole>([
  ArtistMemberRole.OWNER,
  ArtistMemberRole.MANAGER,
  ArtistMemberRole.EDITOR,
  ArtistMemberRole.PRODUCTION,
]);

@Injectable()
export class ArtistWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaces(
    request: ListArtistWorkspacesRequest,
  ): Promise<ListArtistWorkspacesResponse> {
    this.requireId(request.userId, 'user_id');
    const memberships = await this.prisma.artistMembership.findMany({
      where: {
        userId: request.userId,
        artist: request.storefront
          ? { storefront: request.storefront }
          : undefined,
      },
      include: { artist: true },
      orderBy: [{ updatedAt: 'desc' }, { artistId: 'asc' }],
    });

    return {
      workspaces: memberships.map((membership) => ({
        artistId: membership.artist.id,
        storefront: membership.artist.storefront,
        name: membership.artist.name,
        url: membership.artist.url,
        artworkAssetId: membership.artist.artworkAssetId,
        memberRole: membership.role,
      })),
    };
  }

  async listMembers(
    request: ListArtistMembersRequest,
  ): Promise<ListArtistMembersResponse> {
    this.requireId(request.artistId, 'artist_id');
    const memberships = await this.prisma.artistMembership.findMany({
      where: { artistId: request.artistId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      members: memberships.map((membership) => this.member(membership)),
    };
  }

  async upsertMember(
    request: UpsertArtistMemberRequest,
  ): Promise<ArtistMembership> {
    this.requireId(request.artistId, 'artist_id');
    this.requireId(request.userId, 'user_id');
    this.requireId(request.createdBy, 'created_by');
    const role = this.role(request.role);

    const artist = await this.prisma.artist.findUnique({
      where: { id: request.artistId },
      select: { id: true },
    });
    if (!artist) this.notFound('ARTIST_WORKSPACE_NOT_FOUND');

    const current = await this.prisma.artistMembership.findUnique({
      where: {
        artistId_userId: {
          artistId: request.artistId,
          userId: request.userId,
        },
      },
    });
    if (
      current?.role === ArtistMemberRole.OWNER &&
      role !== ArtistMemberRole.OWNER
    ) {
      await this.assertAnotherOwner(request.artistId, request.userId);
    }

    const membership = await this.prisma.artistMembership.upsert({
      where: {
        artistId_userId: {
          artistId: request.artistId,
          userId: request.userId,
        },
      },
      create: {
        artistId: request.artistId,
        userId: request.userId,
        role,
        createdBy: request.createdBy,
      },
      update: { role },
    });
    return this.member(membership);
  }

  async removeMember(
    request: RemoveArtistMemberRequest,
  ): Promise<RemoveArtistMemberResponse> {
    this.requireId(request.artistId, 'artist_id');
    this.requireId(request.userId, 'user_id');
    const current = await this.prisma.artistMembership.findUnique({
      where: {
        artistId_userId: {
          artistId: request.artistId,
          userId: request.userId,
        },
      },
    });
    if (current?.role === ArtistMemberRole.OWNER) {
      await this.assertAnotherOwner(request.artistId, request.userId);
    }
    const deleted = await this.prisma.artistMembership.deleteMany({
      where: { artistId: request.artistId, userId: request.userId },
    });
    return { success: deleted.count > 0 };
  }

  async checkPermission(
    request: CheckArtistPermissionRequest,
  ): Promise<CheckArtistPermissionResponse> {
    this.requireId(request.artistId, 'artist_id');
    this.requireId(request.userId, 'user_id');
    const allowedRoles = request.allowedRoles
      .map((role) => this.roleOrNull(role))
      .filter((role): role is ArtistMemberRole => role !== null);
    if (!allowedRoles.length) this.invalidArgument('allowed_roles is required');

    const membership = await this.prisma.artistMembership.findUnique({
      where: {
        artistId_userId: {
          artistId: request.artistId,
          userId: request.userId,
        },
      },
    });
    return {
      allowed: Boolean(membership && allowedRoles.includes(membership.role)),
      membership: membership ? this.member(membership) : undefined,
    };
  }

  private member(membership: {
    artistId: string;
    userId: string;
    role: ArtistMemberRole;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): ArtistMembership {
    return {
      artistId: membership.artistId,
      userId: membership.userId,
      role: membership.role,
      createdBy: membership.createdBy,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }

  private role(value: string): ArtistMemberRole {
    const role = this.roleOrNull(value);
    if (!role) this.invalidArgument('ARTIST_MEMBER_ROLE_INVALID');
    return role;
  }

  private async assertAnotherOwner(
    artistId: string,
    excludedUserId: string,
  ): Promise<void> {
    const ownerCount = await this.prisma.artistMembership.count({
      where: {
        artistId,
        role: ArtistMemberRole.OWNER,
        userId: { not: excludedUserId },
      },
    });
    if (ownerCount === 0) {
      this.invalidArgument('ARTIST_WORKSPACE_REQUIRES_OWNER');
    }
  }

  private roleOrNull(value: string): ArtistMemberRole | null {
    const role = value.trim().toUpperCase() as ArtistMemberRole;
    return MEMBER_ROLES.has(role) ? role : null;
  }

  private requireId(value: string, field: string): void {
    if (!value?.trim() || value.length > 128) {
      this.invalidArgument(field + ' is required');
    }
  }

  private invalidArgument(message: string): never {
    throw new RpcException({ code: GRPC_STATUS.INVALID_ARGUMENT, message });
  }

  private notFound(message: string): never {
    throw new RpcException({ code: GRPC_STATUS.NOT_FOUND, message });
  }
}
