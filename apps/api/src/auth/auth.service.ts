import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserDocument } from '../users/schemas/user.schema';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import { JwtPayload } from '@musical/shared-types';
import { SignOptions } from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
  ) {}

  async signUp(signupDto: SignupDto) {
    const { username, email, password, displayName, deviceId } = signupDto;

    try {
      const hashedPassword = await bcrypt.hash(password, 12);

      const newUser = await this.usersService.create({
        username,
        email,
        password: hashedPassword,
        displayName,
      });

      const finalDeviceId = deviceId || randomUUID();

      const tokens = this.generateTokens(newUser, finalDeviceId);

      await this.saveRefreshToken(
        newUser._id.toString(),
        tokens.refreshToken,
        finalDeviceId,
      );

      return tokens;
    } catch (error: unknown) {
      if (this.isMongoConflictError(error)) {
        const field = Object.keys(error.keyPattern)[0];
        throw new ConflictException({
          success: false,
          code: `AUTH_${field.toUpperCase()}_EXISTS`,
          message: `${field === 'username' ? 'Username' : 'Email'} đã tồn tại`,
        });
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto & { deviceId?: string }) {
    const { username, password, deviceId } = loginDto;
    const user = await this.usersService.findByUsername(username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Username hoặc password không đúng',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'AUTH_ACCOUNT_DISABLED',
        message: 'Tài khoản đã bị khóa',
      });
    }

    const finalDeviceId = deviceId || randomUUID();
    const tokens = this.generateTokens(user, finalDeviceId);

    user.lastLoginAt = new Date();

    await Promise.all([
      this.saveRefreshToken(
        user._id.toString(),
        tokens.refreshToken,
        finalDeviceId,
      ),
      user.save(),
    ]);

    return tokens;
  }

  async logout(userId: string, deviceId: string) {
    const key = `auth:refresh:${userId}:${deviceId}`;
    const deviceSetKey = `auth:devices:${userId}`;

    await Promise.all([
      this.redis.del(key),
      this.redis.srem(deviceSetKey, deviceId),
    ]);
  }

  async logoutAll(userId: string) {
    const deviceSetKey = `auth:devices:${userId}`;
    const deviceIds = await this.redis.smembers(deviceSetKey);

    if (!deviceIds.length) {
      await this.redis.del(deviceSetKey);
      return;
    }

    const pipeline = this.redis.pipeline();

    for (const deviceId of deviceIds) {
      pipeline.del(`auth:refresh:${userId}:${deviceId}`);
    }

    pipeline.del(deviceSetKey);

    await pipeline.exec();
  }

  async refreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      if (!payload.sub || !payload.deviceId) {
        throw new UnauthorizedException({
          code: 'AUTH_TOKEN_INVALID',
          message: 'Token không hợp lệ',
        });
      }

      const key = `auth:refresh:${payload.sub}:${payload.deviceId}`;

      const [storedToken, user] = await Promise.all([
        this.redis.get(key),
        this.usersService.findById(payload.sub),
      ]);

      const hashedToken = createHash('sha256').update(token).digest('hex');

      if (!storedToken || hashedToken !== storedToken) {
        if (storedToken) {
          await Promise.all([
            this.redis.del(key),
            this.redis.srem(`auth:devices:${payload.sub}`, payload.deviceId),
          ]);
        }

        throw new UnauthorizedException({
          code: storedToken ? 'AUTH_TOKEN_REUSED' : 'AUTH_TOKEN_INVALID',
          message: storedToken
            ? 'Phát hiện truy cập bất thường, vui lòng đăng nhập lại'
            : 'Phiên đăng nhập không hợp lệ',
        });
      }

      if (!user) throw new UnauthorizedException();

      if (!user.isActive) {
        throw new UnauthorizedException({
          code: 'AUTH_ACCOUNT_DISABLED',
          message: 'Tài khoản đã bị khóa',
        });
      }

      const tokens = this.generateTokens(user, payload.deviceId);

      await Promise.all([
        this.redis.del(key),
        this.saveRefreshToken(
          user._id.toString(),
          tokens.refreshToken,
          payload.deviceId,
        ),
      ]);

      return tokens;
    } catch (e: unknown) {
      if (e instanceof UnauthorizedException) throw e;

      const isExpired = e instanceof TokenExpiredError;

      throw new UnauthorizedException({
        code: isExpired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
        message: isExpired ? 'Token hết hạn' : 'Token không hợp lệ',
      });
    }
  }

  private async saveRefreshToken(
    userId: string,
    token: string,
    deviceId: string,
  ) {
    const rfExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );
    const ttl = this.extractSeconds(rfExpiresIn as string);
    const hashedToken = createHash('sha256').update(token).digest('hex');

    const key = `auth:refresh:${userId}:${deviceId}`;
    const deviceSetKey = `auth:devices:${userId}`;

    await this.redis
      .pipeline()
      .set(key, hashedToken, 'EX', ttl)
      .sadd(deviceSetKey, deviceId)
      .expire(deviceSetKey, ttl)
      .exec();
  }

  private generateTokens(user: UserDocument, deviceId: string) {
    const payload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
      deviceId,
    };

    const accessTokenExpires = this.configService.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
    )!;

    const refreshTokenExpires = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
    )!;

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTokenExpires as SignOptions['expiresIn'],
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTokenExpires as SignOptions['expiresIn'],
    });

    return {
      accessToken,
      refreshToken,
      deviceId,
      expiresIn: this.extractSeconds(accessTokenExpires),
      user: {
        sub: user._id.toString(),
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  private isMongoConflictError(
    error: unknown,
  ): error is { keyPattern: Record<string, any>; code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as Record<string, any>).code === 11000
    );
  }

  private extractSeconds(expiresIn: string): number {
    const multiplier: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));

    if (isNaN(value)) {
      throw new Error(`Invalid expiresIn format: ${expiresIn}`);
    }

    return multiplier[unit] ? value * multiplier[unit] : parseInt(expiresIn);
  }
}
