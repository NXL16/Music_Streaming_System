import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type {
  AuthResponse,
  SignUpRequest,
  LoginRequest,
  LoginWithGoogleRequest,
  RefreshTokenRequest,
  LogoutRequest,
  LogoutAllRequest,
  ListUserSessionsRequest,
  ListUserSessionsResponse,
  LogoutDeviceRequest,
  GetProfileRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
  AdminUserActionRequest,
  ListUsersRequest,
  ListUsersResponse,
  SetUserStatusRequest,
  SetUserRoleRequest,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
  RequestEmailVerificationRequest,
  VerifyEmailRequest,
  TokenIssueResponse,
  BeginTwoFactorSetupRequest,
  BeginTwoFactorSetupResponse,
  ConfirmTwoFactorSetupRequest,
  ConfirmTwoFactorSetupResponse,
  DisableTwoFactorRequest,
  RegenerateTwoFactorRecoveryCodesRequest,
  TwoFactorRecoveryCodesResponse,
  VerifyTwoFactorLoginRequest,
  UserProfile,
  EmptyResponse,
  IdentityServiceClient,
  RequestAssetUploadResponse,
  AssetResponse,
} from '@musical/shared-proto';
import {
  AssetKind,
  AssetPurpose,
  AssetStatus,
} from '@musical/shared-proto';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';
import { ConfigService } from '@nestjs/config';
import { Metadata } from '@grpc/grpc-js';
import { AssetsService } from '../assets/assets.service';

@Injectable()
export class AuthService implements OnModuleInit {
  private identityService!: IdentityServiceClient;

  constructor(
    @Inject('IDENTITY_PACKAGE') private readonly client: ClientGrpc,
    private readonly configService: ConfigService,
    private readonly assetsService: AssetsService,
  ) {}

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set(
      'x-internal-token',
      this.configService.getOrThrow<string>('INTERNAL_GRPC_TOKEN'),
    );
    return metadata;
  }

  onModuleInit() {
    this.identityService =
      this.client.getService<IdentityServiceClient>('IdentityService');
  }

  async signUp(request: SignUpRequest): Promise<AuthResponse> {
    return await grpcFirstValueFrom(
      this.identityService.signUp(request, this.metadata()),
    );
  }

  async login(request: LoginRequest): Promise<AuthResponse> {
    return await grpcFirstValueFrom(
      this.identityService.login(request, this.metadata()),
    );
  }

  async loginWithGoogle(
    request: LoginWithGoogleRequest,
  ): Promise<AuthResponse> {
    return await grpcFirstValueFrom(
      this.identityService.loginWithGoogle(request, this.metadata()),
    );
  }

  async verifyTwoFactorLogin(
    request: VerifyTwoFactorLoginRequest,
  ): Promise<AuthResponse> {
    return await grpcFirstValueFrom(
      this.identityService.verifyTwoFactorLogin(request, this.metadata()),
    );
  }

  async refreshToken(request: RefreshTokenRequest): Promise<AuthResponse> {
    return await grpcFirstValueFrom(
      this.identityService.refreshToken(request, this.metadata()),
    );
  }

  async logout(request: LogoutRequest): Promise<EmptyResponse> {
    return await grpcFirstValueFrom(
      this.identityService.logout(request, this.metadata()),
    );
  }

  async logoutAll(request: LogoutAllRequest): Promise<EmptyResponse> {
    return await grpcFirstValueFrom(
      this.identityService.logoutAll(request, this.metadata()),
    );
  }

  async listUserSessions(
    request: ListUserSessionsRequest,
  ): Promise<ListUserSessionsResponse> {
    return await grpcFirstValueFrom(
      this.identityService.listUserSessions(request, this.metadata()),
    );
  }

  async logoutDevice(request: LogoutDeviceRequest): Promise<EmptyResponse> {
    return await grpcFirstValueFrom(
      this.identityService.logoutDevice(request, this.metadata()),
    );
  }

  async getProfile(request: GetProfileRequest): Promise<UserProfile> {
    return await grpcFirstValueFrom(
      this.identityService.getProfile(request, this.metadata()),
    );
  }

  async updateProfile(request: UpdateProfileRequest): Promise<UserProfile> {
    return await grpcFirstValueFrom(
      this.identityService.updateProfile(request, this.metadata()),
    );
  }

  async requestAvatarUpload(
    userId: string,
    input: {
      filename: string;
      contentType: string;
      checksum: string;
      sizeBytes: number;
    },
  ): Promise<RequestAssetUploadResponse> {
    return this.assetsService.requestUpload({
      actorUserId: userId,
      kind: AssetKind.ASSET_KIND_IMAGE,
      purpose: AssetPurpose.ASSET_PURPOSE_PROFILE_AVATAR,
      ...input,
    });
  }

  async finalizeAvatarUpload(
    userId: string,
    assetId: string,
  ): Promise<{ asset: AssetResponse['asset']; user?: UserProfile }> {
    const response = await this.assetsService.finalizeUpload({
      assetId,
      actorUserId: userId,
    });
    const asset = response.asset;
    if (!asset) {
      throw new Error('ASSET_FINALIZE_RESPONSE_INVALID');
    }
    if (asset.status !== AssetStatus.ASSET_STATUS_READY) {
      return { asset };
    }

    await this.assetsService.reconcileUsages({
      ownerService: 'identity',
      ownerType: 'user',
      ownerId: userId,
      usages: [
        {
          slot: 'avatar',
          assetId: asset.id,
          expectedKind: AssetKind.ASSET_KIND_IMAGE,
          expectedPurpose: AssetPurpose.ASSET_PURPOSE_PROFILE_AVATAR,
        },
      ],
    });
    const current = await this.getProfile({ userId });
    const user = await this.updateProfile({
      userId,
      displayName: current.displayName,
      bio: current.bio || undefined,
      avatarAssetId: asset.id,
      avatarUrl: asset.publicUrl,
    });
    return { asset, user };
  }

  async changePassword(request: ChangePasswordRequest): Promise<EmptyResponse> {
    return await grpcFirstValueFrom(
      this.identityService.changePassword(request, this.metadata()),
    );
  }

  async listUsers(request: ListUsersRequest): Promise<ListUsersResponse> {
    return await grpcFirstValueFrom(
      this.identityService.listUsers(request, this.metadata()),
    );
  }

  async setUserStatus(request: SetUserStatusRequest): Promise<UserProfile> {
    return await grpcFirstValueFrom(
      this.identityService.setUserStatus(request, this.metadata()),
    );
  }

  async adminRevokeUserSessions(
    request: AdminUserActionRequest,
  ): Promise<EmptyResponse> {
    return await grpcFirstValueFrom(
      this.identityService.adminRevokeUserSessions(request, this.metadata()),
    );
  }

  async adminResetUserTwoFactor(
    request: AdminUserActionRequest,
  ): Promise<UserProfile> {
    return await grpcFirstValueFrom(
      this.identityService.adminResetUserTwoFactor(request, this.metadata()),
    );
  }

  async setUserRole(request: SetUserRoleRequest): Promise<UserProfile> {
    return await grpcFirstValueFrom(
      this.identityService.setUserRole(request, this.metadata()),
    );
  }

  async requestPasswordReset(
    request: RequestPasswordResetRequest,
  ): Promise<TokenIssueResponse> {
    return await grpcFirstValueFrom(
      this.identityService.requestPasswordReset(request, this.metadata()),
    );
  }

  async resetPassword(request: ResetPasswordRequest): Promise<EmptyResponse> {
    return await grpcFirstValueFrom(
      this.identityService.resetPassword(request, this.metadata()),
    );
  }

  async requestEmailVerification(
    request: RequestEmailVerificationRequest,
  ): Promise<TokenIssueResponse> {
    return await grpcFirstValueFrom(
      this.identityService.requestEmailVerification(request, this.metadata()),
    );
  }

  async verifyEmail(request: VerifyEmailRequest): Promise<UserProfile> {
    return await grpcFirstValueFrom(
      this.identityService.verifyEmail(request, this.metadata()),
    );
  }

  async beginTwoFactorSetup(
    request: BeginTwoFactorSetupRequest,
  ): Promise<BeginTwoFactorSetupResponse> {
    return await grpcFirstValueFrom(
      this.identityService.beginTwoFactorSetup(request, this.metadata()),
    );
  }

  async confirmTwoFactorSetup(
    request: ConfirmTwoFactorSetupRequest,
  ): Promise<ConfirmTwoFactorSetupResponse> {
    return await grpcFirstValueFrom(
      this.identityService.confirmTwoFactorSetup(request, this.metadata()),
    );
  }

  async disableTwoFactor(
    request: DisableTwoFactorRequest,
  ): Promise<UserProfile> {
    return await grpcFirstValueFrom(
      this.identityService.disableTwoFactor(request, this.metadata()),
    );
  }

  async regenerateTwoFactorRecoveryCodes(
    request: RegenerateTwoFactorRecoveryCodesRequest,
  ): Promise<TwoFactorRecoveryCodesResponse> {
    return await grpcFirstValueFrom(
      this.identityService.regenerateTwoFactorRecoveryCodes(
        request,
        this.metadata(),
      ),
    );
  }
}
