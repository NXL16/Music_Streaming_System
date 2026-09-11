import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtUser } from '@musical/shared-types';
import { AuthService } from '../auth/auth.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { ArtistOrAdminGuard } from '../common/guards/artist-or-admin.guard';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SongsService } from './songs.service';

const ALL_MEMBER_ROLES = [
  'OWNER',
  'MANAGER',
  'EDITOR',
  'PRODUCTION',
  'ANALYST',
] as const;
const ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN_USER_OPS',
  'ADMIN_SECURITY_OPS',
]);

type ArtistMemberRole = (typeof ALL_MEMBER_ROLES)[number];

@Controller('artist/workspaces')
@UseGuards(StrictJwtAuthGuard, ArtistOrAdminGuard)
export class ArtistWorkspacesController {
  constructor(
    private readonly songsService: SongsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listMine(@Req() req: Request) {
    const user = req.user as JwtUser;
    return this.songsService.listArtistWorkspaces({
      userId: user.userId,
      storefront: 'vn',
    });
  }

  @Get(':artistId/members')
  async listMembers(@Req() req: Request, @Param('artistId') artistId: string) {
    const user = req.user as JwtUser;
    await this.assertMemberOrAdmin(user, artistId);
    return this.membersWithProfiles(artistId);
  }

  @Post(':artistId/members')
  async addMember(
    @Req() req: Request,
    @Param('artistId') artistId: string,
    @Body() body: { userId?: string; role?: string },
  ) {
    const user = req.user as JwtUser;
    await this.assertOwnerOrAdmin(user, artistId);
    const memberUserId = this.requiredId(body.userId, 'userId');
    await this.grantArtistWorkspaceSeat(memberUserId, user.userId);
    return this.songsService.upsertArtistMember({
      artistId,
      userId: memberUserId,
      role: this.role(body.role),
      createdBy: user.userId,
    });
  }

  @Post(':artistId/members/invite')
  async inviteMember(
    @Req() req: Request,
    @Param('artistId') artistId: string,
    @Body() body: { email?: string; role?: string },
  ) {
    const user = req.user as JwtUser;
    await this.assertOwnerOrAdmin(user, artistId);
    const email = body.email?.trim().toLowerCase() || '';
    if (!this.isEmail(email)) {
      throw new BadRequestException({
        code: 'ARTIST_MEMBER_EMAIL_INVALID',
        message: 'Email thành viên không hợp lệ',
      });
    }

    const users = await this.authService.listUsers({
      page: 1,
      limit: 10,
      search: email,
      isActive: true,
    });
    const member = users.users.find(
      (candidate) => candidate.email.trim().toLowerCase() === email,
    );
    if (!member) {
      throw new BadRequestException({
        code: 'ARTIST_MEMBER_ACCOUNT_NOT_FOUND',
        message:
          'Không tìm thấy tài khoản đang hoạt động cho email này. Thành viên cần tạo tài khoản 404hz trước.',
      });
    }

    await this.grantArtistWorkspaceSeat(member.userId, user.userId);
    return this.songsService.upsertArtistMember({
      artistId,
      userId: member.userId,
      role: this.role(body.role),
      createdBy: user.userId,
    });
  }

  @Patch(':artistId/members/:memberUserId')
  async updateMember(
    @Req() req: Request,
    @Param('artistId') artistId: string,
    @Param('memberUserId') memberUserId: string,
    @Body() body: { role?: string },
  ) {
    const user = req.user as JwtUser;
    await this.assertOwnerOrAdmin(user, artistId);
    return this.songsService.upsertArtistMember({
      artistId,
      userId: memberUserId,
      role: this.role(body.role),
      createdBy: user.userId,
    });
  }

  @Delete(':artistId/members/:memberUserId')
  async removeMember(
    @Req() req: Request,
    @Param('artistId') artistId: string,
    @Param('memberUserId') memberUserId: string,
  ) {
    const user = req.user as JwtUser;
    await this.assertOwnerOrAdmin(user, artistId);
    return this.songsService.removeArtistMember({
      artistId,
      userId: memberUserId,
    });
  }

  private async assertMemberOrAdmin(user: JwtUser, artistId: string) {
    if (this.isAdmin(user)) return;
    const permission = await this.songsService.checkArtistPermission({
      artistId,
      userId: user.userId,
      allowedRoles: [...ALL_MEMBER_ROLES],
    });
    if (!permission.allowed) this.denied();
  }

  private async membersWithProfiles(artistId: string) {
    const result = await this.songsService.listArtistMembers({ artistId });
    const members = await Promise.all(
      result.members.map(async (member) => {
        try {
          const profile = await this.authService.getProfile({
            userId: member.userId,
          });
          return {
            ...member,
            displayName: profile.displayName || profile.username,
            email: profile.email,
          };
        } catch {
          return {
            ...member,
            displayName: '',
            email: '',
          };
        }
      }),
    );
    return { members };
  }

  private async assertOwnerOrAdmin(user: JwtUser, artistId: string) {
    if (this.isAdmin(user)) return;
    const permission = await this.songsService.checkArtistPermission({
      artistId,
      userId: user.userId,
      allowedRoles: ['OWNER', 'MANAGER'],
    });
    if (!permission.allowed) this.denied();
  }

  private async grantArtistWorkspaceSeat(
    userId: string,
    actorUserId: string,
  ) {
    await this.authService.grantArtistWorkspaceSeat({
      actorUserId,
      targetUserId: userId,
    });
  }

  private isAdmin(user: JwtUser) {
    return ADMIN_ROLES.has(user.role);
  }

  private role(value: string | undefined): ArtistMemberRole {
    const normalized = value?.trim().toUpperCase();
    if (
      !normalized ||
      !ALL_MEMBER_ROLES.includes(normalized as ArtistMemberRole)
    ) {
      throw new ForbiddenException({
        code: 'ARTIST_MEMBER_ROLE_INVALID',
        message: 'Vai trò thành viên Artist không hợp lệ',
      });
    }
    return normalized as ArtistMemberRole;
  }

  private requiredId(value: string | undefined, field: string) {
    if (!value?.trim() || value.length > 128) {
      throw new ForbiddenException({
        code: 'ARTIST_MEMBER_INPUT_INVALID',
        message: field + ' không hợp lệ',
      });
    }
    return value;
  }

  private isEmail(value: string) {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private denied(): never {
    throw new ForbiddenException({
      code: 'ARTIST_WORKSPACE_ACCESS_DENIED',
      message: 'Bạn không có quyền thao tác Artist workspace này',
    });
  }
}

@Controller('admin/artists')
@UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
@Permissions('catalog.manage')
export class ArtistWorkspaceAdminController {
  constructor(
    private readonly songsService: SongsService,
    private readonly authService: AuthService,
  ) {}

  @Get(':artistId/members')
  listMembers(@Param('artistId') artistId: string) {
    return this.songsService.listArtistMembers({ artistId });
  }

  @Post(':artistId/members')
  async assignMember(
    @Req() req: Request,
    @Param('artistId') artistId: string,
    @Body() body: { userId?: string; role?: string },
  ) {
    const userId = body.userId?.trim() || '';
    const role = body.role?.trim().toUpperCase() || '';
    if (!userId || !ALL_MEMBER_ROLES.includes(role as ArtistMemberRole)) {
      throw new ForbiddenException({
        code: 'ARTIST_MEMBER_INPUT_INVALID',
        message: 'Thông tin gán thành viên Artist không hợp lệ',
      });
    }
    const admin = req.user as JwtUser;
    await this.authService.grantArtistWorkspaceSeat({
      actorUserId: admin.userId,
      targetUserId: userId,
    });
    return this.songsService.upsertArtistMember({
      artistId,
      userId,
      role,
      createdBy: admin.userId,
    });
  }
}
