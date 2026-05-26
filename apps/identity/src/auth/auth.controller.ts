import { Controller, UseGuards } from '@nestjs/common';
import { GrpcMethod, Payload, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AuthService } from './auth.service';
import type {
  SignUpRequest,
  LoginRequest,
  RefreshTokenRequest,
  LogoutRequest,
  LogoutAllRequest,
  ListUserSessionsRequest,
  ListUserSessionsResponse,
  LogoutDeviceRequest,
  ChangePasswordRequest,
  AdminUserActionRequest,
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
  SetUserStatusRequest,
  AuthResponse,
  EmptyResponse,
  UserProfile,
} from '@musical/shared-proto';
import { mapUserProfile } from '../users/user-profile.mapper';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';

@Controller()
@UseGuards(InternalGrpcGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('IdentityService', 'SignUp')
  async signUp(@Payload() request: SignUpRequest): Promise<AuthResponse> {
    return this.authService.signUp(request);
  }

  @GrpcMethod('IdentityService', 'Login')
  async login(@Payload() request: LoginRequest): Promise<AuthResponse> {
    return this.authService.login(request);
  }

  @GrpcMethod('IdentityService', 'VerifyTwoFactorLogin')
  async verifyTwoFactorLogin(
    @Payload() request: VerifyTwoFactorLoginRequest,
  ): Promise<AuthResponse> {
    return this.authService.verifyTwoFactorLogin(request);
  }

  @GrpcMethod('IdentityService', 'RefreshToken')
  async refreshToken(
    @Payload() request: RefreshTokenRequest,
  ): Promise<AuthResponse> {
    if (!request.refreshToken) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Refresh token là bắt buộc',
      });
    }

    return this.authService.refreshToken(request.refreshToken);
  }

  @GrpcMethod('IdentityService', 'Logout')
  async logout(@Payload() request: LogoutRequest): Promise<EmptyResponse> {
    if (!request.userId || !request.deviceId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId & deviceId là bắt buộc',
      });
    }

    await this.authService.logout(
      request.userId,
      request.deviceId,
      request.accessJti,
      request.accessExp,
    );
    return {};
  }

  @GrpcMethod('IdentityService', 'LogoutAll')
  async logoutAll(
    @Payload() request: LogoutAllRequest,
  ): Promise<EmptyResponse> {
    if (!request.userId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId là bắt buộc',
      });
    }

    await this.authService.logoutAll(request.userId);
    return {};
  }

  @GrpcMethod('IdentityService', 'ListUserSessions')
  async listUserSessions(
    @Payload() request: ListUserSessionsRequest,
  ): Promise<ListUserSessionsResponse> {
    return this.authService.listUserSessions(request);
  }

  @GrpcMethod('IdentityService', 'LogoutDevice')
  async logoutDevice(
    @Payload() request: LogoutDeviceRequest,
  ): Promise<EmptyResponse> {
    await this.authService.logoutDevice(request);
    return {};
  }

  @GrpcMethod('IdentityService', 'ChangePassword')
  async changePassword(
    @Payload() request: ChangePasswordRequest,
  ): Promise<EmptyResponse> {
    await this.authService.changePassword(request);
    return {};
  }

  @GrpcMethod('IdentityService', 'SetUserStatus')
  async setUserStatus(
    @Payload() request: SetUserStatusRequest,
  ): Promise<UserProfile> {
    if (!request.userId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId là bắt buộc',
      });
    }

    const user = await this.authService.setUserStatus(
      request.userId,
      request.isActive,
    );

    return mapUserProfile(user);
  }

  @GrpcMethod('IdentityService', 'AdminRevokeUserSessions')
  async adminRevokeUserSessions(
    @Payload() request: AdminUserActionRequest,
  ): Promise<EmptyResponse> {
    if (!request.userId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId là bắt buộc',
      });
    }

    await this.authService.adminRevokeUserSessions(request.userId);
    return {};
  }

  @GrpcMethod('IdentityService', 'AdminResetUserTwoFactor')
  async adminResetUserTwoFactor(
    @Payload() request: AdminUserActionRequest,
  ): Promise<UserProfile> {
    if (!request.userId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId là bắt buộc',
      });
    }

    const user = await this.authService.adminResetUserTwoFactor(request.userId);
    return mapUserProfile(user);
  }

  @GrpcMethod('IdentityService', 'RequestPasswordReset')
  async requestPasswordReset(
    @Payload() request: RequestPasswordResetRequest,
  ): Promise<TokenIssueResponse> {
    return this.authService.requestPasswordReset(request);
  }

  @GrpcMethod('IdentityService', 'ResetPassword')
  async resetPassword(
    @Payload() request: ResetPasswordRequest,
  ): Promise<EmptyResponse> {
    await this.authService.resetPassword(request);
    return {};
  }

  @GrpcMethod('IdentityService', 'RequestEmailVerification')
  async requestEmailVerification(
    @Payload() request: RequestEmailVerificationRequest,
  ): Promise<TokenIssueResponse> {
    return this.authService.requestEmailVerification(request);
  }

  @GrpcMethod('IdentityService', 'VerifyEmail')
  async verifyEmail(@Payload() request: VerifyEmailRequest): Promise<UserProfile> {
    const user = await this.authService.verifyEmail(request.token);
    return mapUserProfile(user);
  }

  @GrpcMethod('IdentityService', 'BeginTwoFactorSetup')
  async beginTwoFactorSetup(
    @Payload() request: BeginTwoFactorSetupRequest,
  ): Promise<BeginTwoFactorSetupResponse> {
    return this.authService.beginTwoFactorSetup(request);
  }

  @GrpcMethod('IdentityService', 'ConfirmTwoFactorSetup')
  async confirmTwoFactorSetup(
    @Payload() request: ConfirmTwoFactorSetupRequest,
  ): Promise<ConfirmTwoFactorSetupResponse> {
    return this.authService.confirmTwoFactorSetup(request);
  }

  @GrpcMethod('IdentityService', 'DisableTwoFactor')
  async disableTwoFactor(
    @Payload() request: DisableTwoFactorRequest,
  ): Promise<UserProfile> {
    const user = await this.authService.disableTwoFactor(request);
    return mapUserProfile(user);
  }

  @GrpcMethod('IdentityService', 'RegenerateTwoFactorRecoveryCodes')
  async regenerateTwoFactorRecoveryCodes(
    @Payload() request: RegenerateTwoFactorRecoveryCodesRequest,
  ): Promise<TwoFactorRecoveryCodesResponse> {
    return this.authService.regenerateTwoFactorRecoveryCodes(request);
  }
}
