import { Inject, Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import {
  JwtPayload,
  authAccessBlacklistKey,
  authDevicesKey,
  authRefreshKey,
  authStateKey,
} from '@musical/shared-types';
import {
  AuthResponse,
  LoginRequest,
  SignUpRequest,
} from '@musical/shared-proto';
import { SignOptions } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import ms from 'ms';
import { Prisma } from '../generated/prisma/client';
import {
  normalizeAndValidateLoginRequest,
  normalizeAndValidateSignUpRequest,
} from './auth.validation';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
  ) {}

  async signUp(request: SignUpRequest): Promise<AuthResponse> {
    const normalizedRequest = normalizeAndValidateSignUpRequest(request);
    const { username, email, password, displayName, deviceId } =
      normalizedRequest;

    try {
      const hashedPassword = await argon2.hash(password);

      const newUser = await this.usersService.create({
        username,
        email,
        password: hashedPassword,
        displayName,
      });

      const finalDeviceId = deviceId || randomUUID();
      const tokens = this.generateTokens(newUser, finalDeviceId);

      await Promise.all([
        this.saveRefreshToken(newUser.id, tokens.refreshToken, finalDeviceId),
        this.saveAuthState(newUser),
      ]);

      return tokens;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const errorMessage = error.message || '';

        let field = 'Thông tin';

        if (/username/i.test(errorMessage)) {
          field = 'Username';
        } else if (/email/i.test(errorMessage)) {
          field = 'Email';
        }

        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: `${field} đã tồn tại`,
        });
      }

      if (
        error instanceof Error &&
        error.message === 'Không thể tạo metadata người dùng'
      ) {
        throw new RpcException({
          code: status.INTERNAL,
          message: 'Lỗi đồng bộ dữ liệu người dùng',
        });
      }

      if (error instanceof RpcException) throw error;
      throw new RpcException({
        code: status.INTERNAL,
        message: 'Lỗi hệ thống nội bộ',
      });
    }
  }

  async login(request: LoginRequest): Promise<AuthResponse> {
    const normalizedRequest = normalizeAndValidateLoginRequest(request);
    const { username, password, deviceId } = normalizedRequest;

    const user = await this.usersService.findAuthUserByUsername(username);

    if (!user || !(await argon2.verify(user.password, password))) {
      throw new RpcException({
        code: status.UNAUTHENTICATED, // Mã 16: Lỗi xác thực
        message: 'Thông tin đăng nhập không chính xác',
      });
    }

    if (!user.isActive) {
      throw new RpcException({
        code: status.PERMISSION_DENIED, // Mã 7: Từ chối quyền truy cập
        message: 'Tài khoản đã bị khóa',
      });
    }

    const finalDeviceId = deviceId || randomUUID();
    const tokens = this.generateTokens(user, finalDeviceId);

    await Promise.all([
      this.saveRefreshToken(user.id, tokens.refreshToken, finalDeviceId),
      this.saveAuthState(user),
      this.usersService.updateLastLogin(user.id),
    ]);

    return tokens;
  }

  async logout(
    userId: string,
    deviceId: string,
    accessJti?: string,
    accessExp?: number,
  ) {
    const key = authRefreshKey(userId, deviceId);
    const deviceSetKey = authDevicesKey(userId);

    const commands = this.redis
      .pipeline()
      .del(key)
      .srem(deviceSetKey, deviceId);

    if (accessJti && accessExp) {
      const ttl = Math.max(accessExp - Math.floor(Date.now() / 1000), 1);
      commands.set(authAccessBlacklistKey(accessJti), '1', 'EX', ttl);
    }

    await commands.exec();
  }

  async logoutAll(userId: string) {
    const deviceSetKey = authDevicesKey(userId);
    const deviceIds = await this.redis.smembers(deviceSetKey);

    if (!deviceIds.length) {
      await this.redis.del(deviceSetKey);
      return;
    }

    const pipeline = this.redis.pipeline();

    for (const deviceId of deviceIds) {
      pipeline.del(authRefreshKey(userId, deviceId));
    }

    pipeline.del(deviceSetKey);

    await pipeline.exec();

    const user = await this.usersService.incrementTokenVersion(userId);
    await this.saveAuthState(user);
  }

  async refreshToken(token: string): Promise<AuthResponse> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const hashedToken = createHash('sha256').update(token).digest('hex');
      const key = authRefreshKey(payload.sub, payload.deviceId);
      const deviceSetKey = authDevicesKey(payload.sub);

      const luaScript = `
        local stored = redis.call("GET", KEYS[1])
        if not stored then return -1 end
        if stored == ARGV[1] then
          redis.call("DEL", KEYS[1])
          return 1
        else
          redis.call("DEL", KEYS[1])
          redis.call("SREM", KEYS[2], ARGV[2])
          return 0
        end
      `;

      const result = await this.redis.eval(
        luaScript,
        2,
        key,
        deviceSetKey,
        hashedToken,
        payload.deviceId,
      );

      if (result !== 1) {
        throw new RpcException({
          code: status.UNAUTHENTICATED,
          message:
            result === 0
              ? 'Phát hiện truy cập bất thường, vui lòng đăng nhập lại'
              : 'Phiên đăng nhập không tồn tại',
        });
      }

      const user = await this.usersService.findById(payload.sub, false);
      if (!user || !user.isActive) {
        throw new RpcException({
          code: status.PERMISSION_DENIED,
          message: 'Người dùng không tồn tại hoặc bị khóa',
        });
      }

      if (payload.tokenVersion !== user.tokenVersion) {
        throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Phiên đăng nhập đã bị thu hồi',
        });
      }

      const tokens = this.generateTokens(user, payload.deviceId);

      await Promise.all([
        this.saveRefreshToken(user.id, tokens.refreshToken, payload.deviceId),
        this.saveAuthState(user),
      ]);

      return tokens;
    } catch (e: unknown) {
      if (e instanceof RpcException) throw e;
      const isExpired = e instanceof TokenExpiredError;
      throw new RpcException({
        code: isExpired ? status.DEADLINE_EXCEEDED : status.UNAUTHENTICATED,
        message: isExpired
          ? 'Phiên đăng nhập đã hết hạn'
          : 'Token không hợp lệ',
      });
    }
  }

  private async saveAuthState(user: UserEntity): Promise<void> {
    await this.redis.set(
      authStateKey(user.id),
      JSON.stringify({
        isActive: user.isActive,
        role: user.role,
        tokenVersion: user.tokenVersion,
      }),
    );
  }

  private async saveRefreshToken(
    userId: string,
    token: string,
    deviceId: string,
  ) {
    const rfExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    const ttlMs = ms(rfExpiresIn as import('ms').StringValue);
    const ttl = Math.floor(ttlMs / 1000);

    if (!Number.isFinite(ttl) || ttl <= 0) {
      throw new Error(
        'JWT_REFRESH_EXPIRES_IN phải là thời lượng hợp lệ và lớn hơn 0',
      );
    }

    const hashedToken = createHash('sha256').update(token).digest('hex');
    const key = authRefreshKey(userId, deviceId);
    const deviceSetKey = authDevicesKey(userId);

    await this.redis
      .pipeline()
      .set(key, hashedToken, 'EX', ttl)
      .sadd(deviceSetKey, deviceId)
      .expire(deviceSetKey, ttl)
      .exec();
  }

  private generateTokens(user: UserEntity, deviceId: string): AuthResponse {
    const accessJti = randomUUID();

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      deviceId,
      tokenVersion: user.tokenVersion,
    };

    const accessTokenExpires = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    );

    const refreshTokenExpires = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTokenExpires as SignOptions['expiresIn'],
      jwtid: accessJti,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTokenExpires as SignOptions['expiresIn'],
    });

    return {
      accessToken,
      refreshToken,
      deviceId,
      expiresIn: this.extractSeconds(accessTokenExpires),
      user: {
        userId: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: String(user.role),
        createdAt: user.createdAt.getTime(),
      },
    };
  }

  private extractSeconds(expiresIn: string): number {
    const duration = ms(expiresIn as import('ms').StringValue);

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('expiresIn phải là thời lượng hợp lệ và lớn hơn 0');
    }

    return Math.floor(duration / 1000);
  }
}
