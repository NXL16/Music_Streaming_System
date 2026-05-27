import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import {
  AuthState,
  JwtPayload,
  SessionState,
  authAccessBlacklistKey,
  authDevicesKey,
  authRefreshKey,
  authStateKey,
} from '@musical/shared-types';
import {
  AuthResponse,
  BeginTwoFactorSetupRequest,
  BeginTwoFactorSetupResponse,
  ChangePasswordRequest,
  ConfirmTwoFactorSetupRequest,
  ConfirmTwoFactorSetupResponse,
  DisableTwoFactorRequest,
  ListUserSessionsRequest,
  ListUserSessionsResponse,
  LoginRequest,
  LogoutDeviceRequest,
  RegenerateTwoFactorRecoveryCodesRequest,
  RequestEmailVerificationRequest,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
  SignUpRequest,
  TokenIssueResponse,
  TwoFactorRecoveryCodesResponse,
  VerifyTwoFactorLoginRequest,
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
  normalizeAndValidateChangePasswordRequest,
  normalizeAndValidateSignUpRequest,
} from './auth.validation';
import { mapUserProfile } from '../users/user-profile.mapper';
import {
  buildOtpAuthUrl,
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  generateTotpSecret,
  hashToken,
  verifyTotpCodeWithCounter,
} from './auth-token.util';
import { MailService } from '../common/mail/mail.service';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

type TwoFactorChallenge = {
  userId: string;
  deviceId: string;
};

type TwoFactorCheckInput = {
  userId: string;
  encryptedSecret: string;
  code?: string;
  recoveryCode?: string;
};

type RateLimitPolicy = {
  maxAttempts: number;
  windowSeconds: number;
  message: string;
};

const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 300;
const TWO_FACTOR_RECOVERY_CODE_COUNT = 10;
const PASSWORD_RESET_TTL_MINUTES = 15;
const EMAIL_VERIFICATION_TTL_HOURS = 24;

const EMAIL_REQUEST_POLICY: RateLimitPolicy = {
  maxAttempts: 3,
  windowSeconds: 15 * 60,
  message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
};

const TWO_FACTOR_VERIFY_POLICY: RateLimitPolicy = {
  maxAttempts: 5,
  windowSeconds: 5 * 60,
  message: 'Bạn nhập sai mã 2FA quá nhiều lần, vui lòng thử lại sau ít phút',
};

const TWO_FACTOR_SETUP_POLICY: RateLimitPolicy = {
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  message: 'Bạn thao tác 2FA quá nhiều lần, vui lòng thử lại sau ít phút',
};

const LOGIN_POLICY: RateLimitPolicy = {
  maxAttempts: 5,
  windowSeconds: 10 * 60,
  message: 'Bạn đăng nhập sai quá nhiều lần, vui lòng thử lại sau ít phút',
};

const twoFactorChallengeKey = (challengeId: string): string =>
  `auth:2fa:challenge:${challengeId}`;

const authRateLimitKey = (scope: string, identifier: string): string =>
  `auth:rl:${scope}:${hashToken(identifier)}`;

const authSessionKey = (userId: string, deviceId: string): string =>
  `auth:session:${userId}:${deviceId}`;

const twoFactorConfirmLockKey = (userId: string): string =>
  `auth:2fa:confirm:lock:${userId}`;

const twoFactorOtpLastCounterKey = (userId: string): string =>
  `auth:2fa:otp:last:${userId}`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly mailService: MailService,
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

    await this.assertRateLimit('login', username, LOGIN_POLICY);

    const user = await this.usersService.findAuthUserByUsername(username);

    if (!user || !(await argon2.verify(user.password, password))) {
      await this.writeAuditLog({
        action: 'AUTH_LOGIN',
        status: 'FAILURE',
        metadata: { username },
      });
      throw new RpcException({
        code: status.UNAUTHENTICATED, // Mã 16: Lỗi xác thực
        message: 'Thông tin đăng nhập không chính xác',
      });
    }

    await this.redis.del(authRateLimitKey('login', username));

    if (!user.isActive) {
      await this.writeAuditLog({
        actorUserId: user.id,
        targetUserId: user.id,
        action: 'AUTH_LOGIN',
        status: 'FAILURE',
        metadata: { reason: 'ACCOUNT_INACTIVE' },
      });
      throw new RpcException({
        code: status.PERMISSION_DENIED, // Mã 7: Từ chối quyền truy cập
        message: 'Tài khoản đã bị khóa',
      });
    }

    const finalDeviceId = deviceId || randomUUID();

    if (user.twoFactorEnabled) {
      const authUser = await this.usersService.findById(user.id, false);
      if (!authUser) {
        throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Thông tin đăng nhập không chính xác',
        });
      }

      return this.createTwoFactorChallenge(authUser, finalDeviceId);
    }

    const tokens = this.generateTokens(user, finalDeviceId);

    await Promise.all([
      this.saveRefreshToken(user.id, tokens.refreshToken, finalDeviceId),
      this.saveAuthState(user),
      this.usersService.updateLastLogin(user.id),
    ]);
    await this.writeAuditLog({
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'AUTH_LOGIN',
      status: 'SUCCESS',
      metadata: { deviceId: finalDeviceId },
    });

    return tokens;
  }

  async loginWithGoogleInternal(input: {
    idToken: string;
    deviceId?: string;
  }): Promise<AuthResponse> {
    if (!input.idToken) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'idToken là bắt buộc',
      });
    }

    const clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');

    let payload: TokenPayload | undefined;

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: input.idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Google token không hợp lệ',
      });
    }

    if (!payload) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Google token không hợp lệ',
      });
    }

    const providerSub = payload.sub;
    const emailRaw = payload.email;
    const emailVerified = payload.email_verified;
    const nameRaw = payload.name;

    if (
      typeof providerSub !== 'string' ||
      providerSub.trim() === '' ||
      typeof emailRaw !== 'string' ||
      emailRaw.trim() === '' ||
      emailVerified !== true
    ) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Google token không hợp lệ',
      });
    }

    const email = emailRaw.trim().toLowerCase();
    const displayName =
      typeof nameRaw === 'string' && nameRaw.trim() !== ''
        ? nameRaw.trim()
        : email.split('@')[0];

    let user = await this.usersService.findUserByGoogleSub(providerSub);

    if (!user) {
      const existing = await this.usersService.findAuthUserByEmail(email);

      if (existing) {
        await this.usersService.linkGoogleAccount(
          existing.id,
          providerSub,
          email,
        );
        user = await this.usersService.findById(existing.id, false);

        if (user && !user.emailVerified) {
          user = await this.usersService.markEmailVerified(user.id);
        }
      } else {
        const randomPassword = randomUUID();
        const hashedPassword = await argon2.hash(randomPassword);

        const base =
          email
            .split('@')[0]
            .replace(/[^a-zA-Z0-9_]/g, '')
            .toLowerCase() || 'user';
        const username = `${base}_${randomUUID().slice(0, 8)}`;

        user = await this.usersService.create({
          username,
          email,
          password: hashedPassword,
          displayName,
        });

        await this.usersService.linkGoogleAccount(user.id, providerSub, email);
        if (!user.emailVerified) {
          user = await this.usersService.markEmailVerified(user.id);
        }
      }
    }

    if (!user || !user.isActive) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Tài khoản đã bị khóa',
      });
    }

    const finalDeviceId = input.deviceId || randomUUID();
    const tokens = this.generateTokens(user, finalDeviceId);

    await Promise.all([
      this.saveRefreshToken(user.id, tokens.refreshToken, finalDeviceId),
      this.saveAuthState(user),
      this.usersService.updateLastLogin(user.id),
    ]);

    await this.writeAuditLog({
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'AUTH_LOGIN_GOOGLE',
      status: 'SUCCESS',
      metadata: { email },
    });

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
      .del(authSessionKey(userId, deviceId))
      .srem(deviceSetKey, deviceId);

    if (accessJti && accessExp) {
      const ttl = Math.max(accessExp - Math.floor(Date.now() / 1000), 1);
      commands.set(authAccessBlacklistKey(accessJti), '1', 'EX', ttl);
    }

    await commands.exec();
    await this.writeAuditLog({
      actorUserId: userId,
      targetUserId: userId,
      action: 'AUTH_LOGOUT_DEVICE',
      status: 'SUCCESS',
      metadata: { deviceId },
    });
  }

  async logoutAll(userId: string) {
    await this.revokeAllSessions(userId);

    await this.writeAuditLog({
      actorUserId: userId,
      targetUserId: userId,
      action: 'AUTH_LOGOUT_ALL',
      status: 'SUCCESS',
    });
  }

  private async revokeAllSessions(userId: string): Promise<UserEntity> {
    await this.deleteRefreshTokens(userId);

    const user = await this.usersService.incrementTokenVersion(userId);
    await this.saveAuthState(user);

    return user;
  }

  async listUserSessions(
    request: ListUserSessionsRequest,
  ): Promise<ListUserSessionsResponse> {
    if (!request.userId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId là bắt buộc',
      });
    }

    const user = await this.usersService.findAuthUserById(request.userId);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Người dùng không tồn tại',
      });
    }

    const deviceIds = await this.redis.smembers(authDevicesKey(request.userId));
    deviceIds.sort();

    const sessionKeys = deviceIds.map((deviceId) =>
      authSessionKey(request.userId, deviceId),
    );
    const sessionValues = sessionKeys.length
      ? await this.redis.mget(...sessionKeys)
      : [];

    return {
      sessions: deviceIds.map((deviceId, index) => {
        const raw = sessionValues[index];
        let ipAddress: string | undefined;
        let userAgent: string | undefined;
        let lastSeenAt = 0;

        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<SessionState>;
            ipAddress = parsed.ipAddress;
            userAgent = parsed.userAgent;
            lastSeenAt = parsed.lastSeenAt ?? 0;
          } catch {
            // ignore malformed session payload
          }
        }

        return {
          deviceId,
          isCurrent: request.currentDeviceId === deviceId,
          ipAddress,
          userAgent,
          lastSeenAt,
        };
      }),
    };
  }

  async logoutDevice(request: LogoutDeviceRequest): Promise<void> {
    if (!request.userId || !request.deviceId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId và deviceId là bắt buộc',
      });
    }

    const result = await this.redis.eval(
      `
      if redis.call("SISMEMBER", KEYS[1], ARGV[1]) == 0 then
        return 0
      end

      redis.call("DEL", KEYS[2])
      redis.call("DEL", KEYS[3])
      redis.call("SREM", KEYS[1], ARGV[1])
      return 1
    `,
      3,
      authDevicesKey(request.userId),
      authRefreshKey(request.userId, request.deviceId),
      authSessionKey(request.userId, request.deviceId),
      request.deviceId,
    );

    if (result !== 1) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Phiên đăng nhập không tồn tại hoặc đã được đăng xuất',
      });
    }

    await this.writeAuditLog({
      actorUserId: request.userId,
      targetUserId: request.userId,
      action: 'AUTH_LOGOUT_DEVICE',
      status: 'SUCCESS',
      metadata: { deviceId: request.deviceId },
    });
  }

  async verifyTwoFactorLogin(
    request: VerifyTwoFactorLoginRequest,
  ): Promise<AuthResponse> {
    const rawCode = request.code?.trim();
    const rawRecoveryCode = request.recoveryCode?.trim();
    const resolvedCode =
      rawCode && /^\d{6}$/.test(rawCode) ? rawCode : undefined;
    const resolvedRecoveryCode =
      rawRecoveryCode ??
      (rawCode && !/^\d{6}$/.test(rawCode) ? rawCode : undefined);
    const isRecoveryFlow = Boolean(resolvedRecoveryCode);

    if (!request.challengeId || (!resolvedCode && !resolvedRecoveryCode)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Mã xác thực 2FA là bắt buộc',
      });
    }

    await this.assertRateLimit(
      '2fa-login',
      request.challengeId,
      TWO_FACTOR_VERIFY_POLICY,
    );

    const rawChallenge = await this.redis.get(
      twoFactorChallengeKey(request.challengeId),
    );

    if (!rawChallenge) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Phiên xác thực 2FA không tồn tại hoặc đã hết hạn',
      });
    }

    const challenge = JSON.parse(rawChallenge) as TwoFactorChallenge;
    const user = await this.usersService.findAuthUserById(challenge.userId);

    if (!user || !user.isActive || !user.twoFactorSecret) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Phiên xác thực 2FA không hợp lệ',
      });
    }

    const isValidVerification = await this.verifyTwoFactorCodeOrRecovery({
      userId: user.id,
      encryptedSecret: user.twoFactorSecret,
      code: resolvedCode,
      recoveryCode: resolvedRecoveryCode,
    });

    if (!isValidVerification) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: isRecoveryFlow
          ? 'Mã khôi phục không hợp lệ hoặc đã được sử dụng'
          : 'Mã xác thực 2 bước không đúng hoặc đã hết hạn',
      });
    }

    await this.redis.del(
      twoFactorChallengeKey(request.challengeId),
      authRateLimitKey('2fa-login', request.challengeId),
    );

    const tokens = this.generateTokens(user, challenge.deviceId);
    await Promise.all([
      this.saveRefreshToken(user.id, tokens.refreshToken, challenge.deviceId),
      this.saveAuthState(user),
      this.usersService.updateLastLogin(user.id),
    ]);

    return tokens;
  }

  async changePassword(request: ChangePasswordRequest): Promise<void> {
    const normalizedRequest =
      normalizeAndValidateChangePasswordRequest(request);

    const user = await this.usersService.findAuthUserById(
      normalizedRequest.userId,
    );

    if (!user || !user.isActive) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Người dùng không tồn tại hoặc bị khóa',
      });
    }

    if (
      !(await argon2.verify(user.password, normalizedRequest.currentPassword))
    ) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Mật khẩu hiện tại không chính xác',
      });
    }

    const hashedPassword = await argon2.hash(normalizedRequest.newPassword);
    const updatedUser = await this.usersService.changePassword(
      user.id,
      hashedPassword,
    );

    await Promise.all([
      this.deleteRefreshTokens(user.id),
      this.saveAuthState(updatedUser),
    ]);
    await this.writeAuditLog({
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'AUTH_CHANGE_PASSWORD',
      status: 'SUCCESS',
    });
  }

  async requestPasswordReset(
    request: RequestPasswordResetRequest,
  ): Promise<TokenIssueResponse> {
    const email = request.email?.trim().toLowerCase();

    if (!email) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Email là bắt buộc',
      });
    }

    await this.assertRateLimit('password-reset', email, EMAIL_REQUEST_POLICY);

    const user = await this.usersService.findAuthUserByEmail(email);
    const token = generateOpaqueToken();

    if (user?.isActive) {
      await this.usersService.createPasswordResetToken(
        user.id,
        hashToken(token),
        addMinutes(PASSWORD_RESET_TTL_MINUTES),
      );

      await this.mailService.sendPasswordResetEmail(user.email, token);
    }

    return {
      message: 'Nếu email tồn tại, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu',
    };
  }

  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    if (!request.token) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Token đặt lại mật khẩu là bắt buộc',
      });
    }

    validateResetPassword(request.newPassword);

    const user = await this.usersService.consumePasswordResetToken(
      hashToken(request.token),
    );

    if (!user || !user.isActive) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      });
    }

    const hashedPassword = await argon2.hash(request.newPassword);
    const updatedUser = await this.usersService.changePassword(
      user.id,
      hashedPassword,
    );

    await Promise.all([
      this.deleteRefreshTokens(user.id),
      this.saveAuthState(updatedUser),
    ]);

    await this.writeAuditLog({
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'AUTH_RESET_PASSWORD',
      status: 'SUCCESS',
    });
  }

  async requestEmailVerification(
    request: RequestEmailVerificationRequest,
  ): Promise<TokenIssueResponse> {
    if (!request.userId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'userId là bắt buộc',
      });
    }

    await this.assertRateLimit(
      'email-verification',
      request.userId,
      EMAIL_REQUEST_POLICY,
    );

    const user = await this.usersService.findAuthUserById(request.userId);

    if (!user || !user.isActive) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Người dùng không tồn tại hoặc bị khóa',
      });
    }

    if (user.emailVerified) {
      return {
        message: 'Email đã được xác thực',
      };
    }

    const token = generateOpaqueToken();
    await this.usersService.createEmailVerificationToken(
      user.id,
      hashToken(token),
      addHours(EMAIL_VERIFICATION_TTL_HOURS),
    );

    await this.mailService.sendEmailVerificationEmail(user.email, token);

    return {
      message: 'Hệ thống sẽ gửi hướng dẫn xác thực email',
    };
  }

  async verifyEmail(token: string): Promise<UserEntity> {
    if (!token) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Token xác thực email là bắt buộc',
      });
    }

    const user = await this.usersService.consumeEmailVerificationToken(
      hashToken(token),
    );

    if (!user) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Token xác thực email không hợp lệ hoặc đã hết hạn',
      });
    }

    await this.saveAuthState(user);
    await this.writeAuditLog({
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'AUTH_VERIFY_EMAIL',
      status: 'SUCCESS',
    });

    return user;
  }

  async beginTwoFactorSetup(
    request: BeginTwoFactorSetupRequest,
  ): Promise<BeginTwoFactorSetupResponse> {
    await this.assertRateLimit(
      '2fa-setup',
      request.userId,
      TWO_FACTOR_SETUP_POLICY,
    );

    const user = await this.usersService.findAuthUserById(request.userId);

    if (!user || !user.isActive) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Người dùng không tồn tại hoặc bị khóa',
      });
    }

    if (user.twoFactorEnabled) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: '2FA đã được bật cho tài khoản này',
      });
    }

    const secret = generateTotpSecret();
    const encryptedSecret = this.encryptTwoFactorSecret(secret);
    await this.usersService.setTwoFactorPendingSecret(user.id, encryptedSecret);

    return {
      secret,
      otpauthUrl: buildOtpAuthUrl(
        this.configService.get<string>('TWO_FACTOR_ISSUER') ||
          'Music Streaming System',
        user.email,
        secret,
      ),
    };
  }

  async confirmTwoFactorSetup(
    request: ConfirmTwoFactorSetupRequest,
  ): Promise<ConfirmTwoFactorSetupResponse> {
    const lockKey = twoFactorConfirmLockKey(request.userId);
    const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');
    if (!lockAcquired) {
      throw new RpcException({
        code: status.ABORTED,
        message: 'Yêu cầu đang được xử lý, vui lòng thử lại',
      });
    }

    try {
      const user = await this.usersService.findAuthUserById(request.userId);

      if (!user || !user.isActive || !user.twoFactorSecret) {
        throw new RpcException({
          code: status.PERMISSION_DENIED,
          message: 'Người dùng chưa bắt đầu thiết lập 2FA',
        });
      }

      if (user.twoFactorEnabled) {
        throw new RpcException({
          code: status.FAILED_PRECONDITION,
          message: '2FA đã được bật cho tài khoản này',
        });
      }

      await this.assertRateLimit(
        '2fa-confirm',
        request.userId,
        TWO_FACTOR_VERIFY_POLICY,
      );

      const secret = this.decryptTwoFactorSecret(user.twoFactorSecret);

      const counter = verifyTotpCodeWithCounter(secret, request.code);
      if (counter === null) {
        throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Mã xác thực 2FA không chính xác',
        });
      }
      await this.assertNotReusedTotpCounter(user.id, counter);

      const recoveryCodes = this.generateRecoveryCodes();
      const updatedUser = await this.usersService.enableTwoFactor(user.id);

      await Promise.all([
        this.usersService.replaceTwoFactorRecoveryCodes(
          user.id,
          recoveryCodes.map((code) => ({
            codeHash: this.hashRecoveryCode(code),
          })),
        ),
        this.redis.del(authRateLimitKey('2fa-confirm', request.userId)),
        this.saveAuthState(updatedUser),
      ]);
      await this.writeAuditLog({
        actorUserId: user.id,
        targetUserId: user.id,
        action: 'AUTH_ENABLE_2FA',
        status: 'SUCCESS',
      });

      return {
        user: mapUserProfile(updatedUser),
        recoveryCodes,
      };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async disableTwoFactor(
    request: DisableTwoFactorRequest,
  ): Promise<UserEntity> {
    const user = await this.usersService.findAuthUserById(request.userId);

    if (!user || !user.isActive) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Người dùng không tồn tại hoặc bị khóa',
      });
    }

    if (!(await argon2.verify(user.password, request.password))) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Mật khẩu không chính xác',
      });
    }

    await this.assertRateLimit(
      '2fa-disable',
      request.userId,
      TWO_FACTOR_VERIFY_POLICY,
    );

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!request.code && !request.recoveryCode) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'Mã xác thực 2FA hoặc recovery code là bắt buộc',
        });
      }

      const isValidVerification = await this.verifyTwoFactorCodeOrRecovery({
        userId: user.id,
        encryptedSecret: user.twoFactorSecret,
        code: request.code,
        recoveryCode: request.recoveryCode,
      });

      if (!isValidVerification) {
        throw new RpcException({
          code: status.UNAUTHENTICATED,
          message: 'Mã xác thực 2FA không chính xác',
        });
      }
    }

    const updatedUser = await this.usersService.disableTwoFactor(user.id);
    await Promise.all([
      this.usersService.clearTwoFactorRecoveryCodes(user.id),
      this.deleteRefreshTokens(user.id),
      this.redis.del(authRateLimitKey('2fa-disable', request.userId)),
      this.saveAuthState(updatedUser),
    ]);
    await this.writeAuditLog({
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'AUTH_DISABLE_2FA',
      status: 'SUCCESS',
    });

    return updatedUser;
  }

  async regenerateTwoFactorRecoveryCodes(
    request: RegenerateTwoFactorRecoveryCodesRequest,
  ): Promise<TwoFactorRecoveryCodesResponse> {
    const user = await this.usersService.findAuthUserById(request.userId);

    if (
      !user ||
      !user.isActive ||
      !user.twoFactorEnabled ||
      !user.twoFactorSecret
    ) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'Người dùng chưa bật 2FA hoặc bị khóa',
      });
    }

    if (!(await argon2.verify(user.password, request.password))) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Mật khẩu không chính xác',
      });
    }

    await this.assertRateLimit(
      '2fa-recovery-regenerate',
      request.userId,
      TWO_FACTOR_VERIFY_POLICY,
    );

    const rawCode = request.code?.trim();
    const rawRecoveryCode = request.recoveryCode?.trim();
    const resolvedCode =
      rawCode && /^\d{6}$/.test(rawCode) ? rawCode : undefined;
    const resolvedRecoveryCode =
      rawRecoveryCode ??
      (rawCode && !/^\d{6}$/.test(rawCode) ? rawCode : undefined);
    const isRecoveryFlow = Boolean(resolvedRecoveryCode);

    if (!resolvedCode && !resolvedRecoveryCode) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Mã xác thực 2FA hoặc recovery code là bắt buộc',
      });
    }

    const isValidVerification = await this.verifyTwoFactorCodeOrRecovery({
      userId: user.id,
      encryptedSecret: user.twoFactorSecret,
      code: resolvedCode,
      recoveryCode: resolvedRecoveryCode,
    });

    if (!isValidVerification) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: isRecoveryFlow
          ? 'Mã khôi phục không hợp lệ hoặc đã được sử dụng'
          : 'Mã xác thực 2 bước không đúng hoặc đã hết hạn',
      });
    }

    const recoveryCodes = this.generateRecoveryCodes();

    await Promise.all([
      this.usersService.replaceTwoFactorRecoveryCodes(
        user.id,
        recoveryCodes.map((code) => ({
          codeHash: this.hashRecoveryCode(code),
        })),
      ),
      this.redis.del(
        authRateLimitKey('2fa-recovery-regenerate', request.userId),
      ),
    ]);

    await this.writeAuditLog({
      actorUserId: user.id,
      targetUserId: user.id,
      action: 'AUTH_REGENERATE_2FA_RECOVERY_CODES',
      status: 'SUCCESS',
    });

    return { recoveryCodes };
  }

  async setUserStatus(userId: string, isActive: boolean): Promise<UserEntity> {
    const user = await this.usersService.setActive(userId, isActive);

    if (!isActive) {
      await this.deleteRefreshTokens(userId);
    }

    await this.saveAuthState(user);

    await this.writeAuditLog({
      actorUserId: userId,
      targetUserId: userId,
      action: 'AUTH_SET_USER_STATUS',
      status: 'SUCCESS',
      metadata: { isActive },
    });

    return user;
  }

  async adminRevokeUserSessions(
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const user = await this.usersService.findAuthUserById(targetUserId);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Người dùng không tồn tại',
      });
    }

    await this.revokeAllSessions(targetUserId);
    await this.writeAuditLog({
      actorUserId,
      targetUserId,
      action: 'ADMIN_REVOKE_USER_SESSIONS',
      status: 'SUCCESS',
    });
  }

  async adminResetUserTwoFactor(
    actorUserId: string,
    targetUserId: string,
  ): Promise<UserEntity> {
    const user = await this.usersService.findAuthUserById(targetUserId);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Người dùng không tồn tại',
      });
    }

    const updatedUser = await this.usersService.disableTwoFactor(targetUserId);
    await Promise.all([
      this.usersService.clearTwoFactorRecoveryCodes(targetUserId),
      this.deleteRefreshTokens(targetUserId),
      this.saveAuthState(updatedUser),
    ]);

    await this.writeAuditLog({
      actorUserId,
      targetUserId,
      action: 'ADMIN_RESET_USER_2FA',
      status: 'SUCCESS',
    });

    return updatedUser;
  }

  private async assertRateLimit(
    scope: string,
    identifier: string,
    policy: RateLimitPolicy,
  ): Promise<void> {
    const key = authRateLimitKey(scope, identifier);
    const attempts = await this.redis.incr(key);

    if (attempts === 1) {
      await this.redis.expire(key, policy.windowSeconds);
    }

    if (attempts > policy.maxAttempts) {
      const ttl = await this.redis.ttl(key);
      if (ttl > 0) {
        const waitMinutes = Math.ceil(ttl / 60);
        const baseMessage = policy.message.replace(
          /,?\s*vui lòng thử lại sau.*$/i,
          '',
        );
        throw new RpcException({
          code: status.RESOURCE_EXHAUSTED,
          message: `${baseMessage}. Thử lại sau ${waitMinutes} phút`,
        });
      }

      throw new RpcException({
        code: status.RESOURCE_EXHAUSTED,
        message: policy.message,
      });
    }
  }

  private async deleteRefreshTokens(userId: string): Promise<void> {
    const deviceSetKey = authDevicesKey(userId);
    const deviceIds = await this.redis.smembers(deviceSetKey);

    const pipeline = this.redis.pipeline();

    for (const deviceId of deviceIds) {
      pipeline.del(authRefreshKey(userId, deviceId));
      pipeline.del(authSessionKey(userId, deviceId));
    }

    pipeline.del(deviceSetKey);

    await pipeline.exec();
  }

  async refreshToken(token: string): Promise<AuthResponse> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
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
      } satisfies AuthState),
    );
  }

  private async saveRefreshToken(
    userId: string,
    token: string,
    deviceId: string,
    sessionMeta?: { ipAddress?: string; userAgent?: string },
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

    const sessionPayload = JSON.stringify({
      deviceId,
      ipAddress: sessionMeta?.ipAddress,
      userAgent: sessionMeta?.userAgent,
      lastSeenAt: Date.now(),
    } satisfies SessionState);

    await this.redis
      .pipeline()
      .set(key, hashedToken, 'EX', ttl)
      .set(authSessionKey(userId, deviceId), sessionPayload, 'EX', ttl)
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
      user: mapUserProfile(user),
      twoFactorRequired: false,
    };
  }

  private async createTwoFactorChallenge(
    user: UserEntity,
    deviceId: string,
  ): Promise<AuthResponse> {
    const challengeId = randomUUID();
    await this.redis.set(
      twoFactorChallengeKey(challengeId),
      JSON.stringify({
        userId: user.id,
        deviceId,
      } satisfies TwoFactorChallenge),
      'EX',
      TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    );

    return {
      accessToken: '',
      refreshToken: '',
      deviceId,
      expiresIn: 0,
      user: mapUserProfile(user),
      twoFactorRequired: true,
      twoFactorChallengeId: challengeId,
    };
  }

  private encryptTwoFactorSecret(secret: string): string {
    return encryptSecret(
      secret,
      this.configService.getOrThrow<string>('TWO_FACTOR_SECRET_KEY'),
    );
  }

  private decryptTwoFactorSecret(payload: string): string {
    return decryptSecret(
      payload,
      this.configService.getOrThrow<string>('TWO_FACTOR_SECRET_KEY'),
    );
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: TWO_FACTOR_RECOVERY_CODE_COUNT }, () =>
      randomBytes(8)
        .toString('hex')
        .toUpperCase()
        .match(/.{1,4}/g)!
        .join('-'),
    );
  }

  private hashRecoveryCode(code: string): string {
    const normalizedCode = code.replace(/[\s-]/g, '').toUpperCase();

    return createHmac(
      'sha256',
      this.configService.getOrThrow<string>('TWO_FACTOR_SECRET_KEY'),
    )
      .update(normalizedCode)
      .digest('hex');
  }

  private async verifyTwoFactorCodeOrRecovery(
    input: TwoFactorCheckInput,
  ): Promise<boolean> {
    const matchedCounter = input.code
      ? verifyTotpCodeWithCounter(
          this.decryptTwoFactorSecret(input.encryptedSecret),
          input.code,
        )
      : null;
    const isValidTotp = matchedCounter !== null;

    if (isValidTotp) {
      await this.assertNotReusedTotpCounter(input.userId, matchedCounter);
      return true;
    }

    if (!input.recoveryCode) {
      return false;
    }

    return this.usersService.consumeTwoFactorRecoveryCode(
      input.userId,
      this.hashRecoveryCode(input.recoveryCode),
    );
  }

  private async assertNotReusedTotpCounter(
    userId: string,
    counter: number,
  ): Promise<void> {
    const key = twoFactorOtpLastCounterKey(userId);
    const lastRaw = await this.redis.get(key);
    const lastCounter = lastRaw ? Number(lastRaw) : null;

    if (
      lastCounter !== null &&
      Number.isFinite(lastCounter) &&
      counter <= lastCounter
    ) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Mã 2FA đã được sử dụng, vui lòng chờ mã mới',
      });
    }

    await this.redis.set(key, String(counter), 'EX', 120);
  }

  private extractSeconds(expiresIn: string): number {
    const duration = ms(expiresIn as import('ms').StringValue);

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('expiresIn phải là thời lượng hợp lệ và lớn hơn 0');
    }

    return Math.floor(duration / 1000);
  }

  private async writeAuditLog(params: {
    actorUserId?: string;
    targetUserId?: string;
    action: string;
    status: 'SUCCESS' | 'FAILURE';
    ipAddress?: string;
    userAgent?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.usersService.createSecurityAuditLog(params);
    } catch (error) {
      this.logger.warn(
        `Không thể ghi security audit log cho action=${params.action}`,
      );
      this.logger.debug(String(error));
    }
  }
}

function validateResetPassword(password: string): void {
  if (
    !password ||
    password.length < 8 ||
    !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/.test(password)
  ) {
    throw new RpcException({
      code: status.INVALID_ARGUMENT,
      message:
        'Mật khẩu mới phải có ít nhất 8 ký tự và chứa chữ hoa, chữ thường, số, ký tự đặc biệt',
    });
  }
}

function addMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function addHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
