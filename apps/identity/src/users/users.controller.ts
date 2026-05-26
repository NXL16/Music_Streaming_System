import { Controller, UseGuards } from '@nestjs/common';
import { GrpcMethod, Payload, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type {
  GetProfileRequest,
  ListUsersRequest,
  ListUsersResponse,
  UpdateProfileRequest,
  UserProfile,
} from '@musical/shared-proto';
import { UsersService } from './users.service';
import {
  normalizeAndValidateUpdateProfileRequest,
  normalizeListUsersRequest,
} from '../auth/auth.validation';
import { mapUserProfile } from './user-profile.mapper';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';

@Controller()
@UseGuards(InternalGrpcGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @GrpcMethod('IdentityService', 'GetProfile')
  async getProfile(@Payload() request: GetProfileRequest): Promise<UserProfile> {
    if (!request.userId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId là bắt buộc',
      });
    }

    const user = await this.usersService.findById(request.userId, true);

    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Người dùng không tồn tại',
      });
    }

    return mapUserProfile(user);
  }

  @GrpcMethod('IdentityService', 'UpdateProfile')
  async updateProfile(
    @Payload() request: UpdateProfileRequest,
  ): Promise<UserProfile> {
    const normalizedRequest = normalizeAndValidateUpdateProfileRequest(request);

    const user = await this.usersService.update(normalizedRequest.userId, {
      displayName: normalizedRequest.displayName,
      avatar: normalizedRequest.avatar,
      bio: normalizedRequest.bio,
    });

    return mapUserProfile(user);
  }

  @GrpcMethod('IdentityService', 'ListUsers')
  async listUsers(
    @Payload() request: ListUsersRequest,
  ): Promise<ListUsersResponse> {
    const normalizedRequest = normalizeListUsersRequest(request);
    const result = await this.usersService.listUsers({
      page: normalizedRequest.page,
      limit: normalizedRequest.limit,
      search: normalizedRequest.search,
      role: normalizedRequest.role,
      isActive: normalizedRequest.isActive,
    });

    return {
      users: result.users.map(mapUserProfile),
      total: result.total,
      page: normalizedRequest.page,
      limit: normalizedRequest.limit,
    };
  }
}
