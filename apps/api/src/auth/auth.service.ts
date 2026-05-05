import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type {
  AuthResponse,
  SignUpRequest,
  LoginRequest,
  RefreshTokenRequest,
  LogoutRequest,
  LogoutAllRequest,
  EmptyResponse,
  IdentityServiceClient,
} from '@musical/shared-proto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AuthService implements OnModuleInit {
  private identityService!: IdentityServiceClient;

  constructor(
    @Inject('IDENTITY_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.identityService =
      this.client.getService<IdentityServiceClient>('IdentityService');
  }

  async signUp(request: SignUpRequest): Promise<AuthResponse> {
    return await firstValueFrom(this.identityService.signUp(request));
  }

  async login(request: LoginRequest): Promise<AuthResponse> {
    return await firstValueFrom(this.identityService.login(request));
  }

  async refreshToken(request: RefreshTokenRequest): Promise<AuthResponse> {
    return await firstValueFrom(this.identityService.refreshToken(request));
  }

  async logout(request: LogoutRequest): Promise<EmptyResponse> {
    return await firstValueFrom(this.identityService.logout(request));
  }

  async logoutAll(request: LogoutAllRequest): Promise<EmptyResponse> {
    return await firstValueFrom(this.identityService.logoutAll(request));
  }
}
