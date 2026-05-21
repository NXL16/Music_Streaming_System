import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AuthService } from './auth.service';
import type {
  SignUpRequest,
  LoginRequest,
  RefreshTokenRequest,
  LogoutRequest,
  LogoutAllRequest,
  AuthResponse,
  EmptyResponse,
} from '@musical/shared-proto';

@Controller()
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
}
