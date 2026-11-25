import { AuthService } from './auth.service';
import { JsonWebTokenError, TokenExpiredError } from '@nestjs/jwt';
import { createHash } from 'crypto';
import * as argon2 from 'argon2';

jest.mock('argon2', () => ({ verify: jest.fn(), hash: jest.fn() }));

jest.mock('@musical/shared-proto', () => ({}));
jest.mock('@musical/shared-types', () => ({
  authAccessBlacklistKey: (jti: string) => `auth:blacklist:${jti}`,
  authDevicesKey: (userId: string) => `auth:devices:${userId}`,
  authRefreshKey: (userId: string, deviceId: string) =>
    `auth:refresh:${userId}:${deviceId}`,
  authStateKey: (userId: string) => `auth:state:${userId}`,
}));
jest.mock('@grpc/grpc-js', () => ({
  status: {
    UNAUTHENTICATED: 16,
    RESOURCE_EXHAUSTED: 8,
    FAILED_PRECONDITION: 9,
    PERMISSION_DENIED: 7,
    INTERNAL: 13,
    INVALID_ARGUMENT: 3,
  },
}));

describe('Current password verification', () => {
  const user = { id: 'user-1', isActive: true, password: 'stored-hash' };
  let service: AuthService;
  let findAuthUserById: jest.Mock;
  let changePassword: jest.Mock;
  let redis: { eval: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    findAuthUserById = jest.fn().mockResolvedValue(user);
    changePassword = jest.fn();
    redis = { eval: jest.fn().mockResolvedValue([1, 600]), del: jest.fn() };
    service = new AuthService(
      { findAuthUserById, changePassword } as never,
      {} as never,
      {} as never,
      {} as never,
      redis as never,
    );
    jest.mocked(argon2.verify).mockResolvedValue(true);
  });

  it('checks the stored hash without changing the password or session', async () => {
    await service.verifyCurrentPassword({
      userId: user.id,
      currentPassword: ' Current!123 ',
    });
    expect(argon2.verify).toHaveBeenCalledWith('stored-hash', ' Current!123 ');
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(changePassword).not.toHaveBeenCalled();
    expect(argon2.hash).not.toHaveBeenCalled();
  });

  it('rejects a wrong password and keeps the failure counter', async () => {
    jest.mocked(argon2.verify).mockResolvedValue(false);
    await expect(
      service.verifyCurrentPassword({
        userId: user.id,
        currentPassword: 'wrong',
      }),
    ).rejects.toThrow('Your current password is incorrect.');
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('blocks repeated attempts before querying or verifying a password', async () => {
    redis.eval.mockResolvedValue([6, 120]);
    await expect(
      service.verifyCurrentPassword({
        userId: user.id,
        currentPassword: 'wrong',
      }),
    ).rejects.toThrow('Try again in 2 minutes.');
    expect(findAuthUserById).not.toHaveBeenCalled();
    expect(argon2.verify).not.toHaveBeenCalled();
  });

  it('rechecks the current password when saving instead of trusting step one', async () => {
    jest.mocked(argon2.verify).mockResolvedValue(false);
    await expect(
      service.changePassword({
        userId: user.id,
        currentPassword: 'OldPass!123',
        newPassword: 'NewPass!123',
      }),
    ).rejects.toThrow('Your current password is incorrect.');
    expect(changePassword).not.toHaveBeenCalled();
    expect(argon2.hash).not.toHaveBeenCalled();
  });
});
jest.mock('@nestjs/microservices', () => ({
  RpcException: class RpcException extends Error {
    constructor(readonly error: { message: string }) {
      super(error.message);
    }
  },
}));
jest.mock('../generated/prisma/client', () => ({ Prisma: {} }));
jest.mock('../generated/prisma/enums', () => ({
  UserRole: {
    USER: 'USER',
    ARTIST: 'ARTIST',
    ARTIST_PENDING: 'ARTIST_PENDING',
  },
}));
jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));
jest.mock('../common/mail/mail.service', () => ({
  MailService: class MailService {},
}));

describe('AuthService refresh session recovery', () => {
  let service: AuthService;
  let findById: jest.Mock;
  let verifyAsync: jest.Mock;
  let redis: { get: jest.Mock; set: jest.Mock; eval: jest.Mock };
  const tokens = { accessToken: 'access-new', refreshToken: 'refresh-new' };

  beforeEach(() => {
    findById = jest.fn().mockResolvedValue({
      id: 'user-1',
      isActive: true,
      tokenVersion: 1,
    });
    verifyAsync = jest.fn().mockResolvedValue({
      sub: 'user-1',
      deviceId: 'device-1',
      tokenVersion: 1,
    });
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue([]),
    };
    service = new AuthService(
      { findById } as never,
      { verifyAsync } as never,
      {
        get: () => undefined,
        getOrThrow: (key: string) =>
          key === 'JWT_REFRESH_EXPIRES_IN' ? '7d' : 'test-secret',
      } as never,
      {} as never,
      redis as never,
    );
    service['generateTokens'] = jest.fn().mockReturnValue(tokens);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('checks and replaces the previous refresh hash in the same session save', async () => {
    await expect(service.refreshToken('refresh-old')).resolves.toBe(tokens);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    const call = redis.eval.mock.calls[0] as unknown[];
    expect(call[0]).toEqual(expect.stringContaining('stored ~= ARGV[7]'));
    expect(call.at(-1)).toBe(
      createHash('sha256').update('refresh-old').digest('hex'),
    );
    expect(redis.set.mock.invocationCallOrder[0]).toBeLessThan(
      redis.eval.mock.invocationCallOrder[0],
    );
  });

  it.each(['database', 'metadata', 'auth-state'])(
    'does not consume the refresh token when %s preparation fails',
    async (source) => {
      const unavailable = new Error('Dependency unavailable');
      if (source === 'database') findById.mockRejectedValue(unavailable);
      else if (source === 'metadata') redis.get.mockRejectedValue(unavailable);
      else redis.set.mockRejectedValue(unavailable);
      await expect(service.refreshToken('refresh-old')).rejects.toMatchObject({
        error: { code: 13 },
      });
      expect(redis.eval).not.toHaveBeenCalled();
    },
  );

  it('does not report a Redis failure as an invalid token', async () => {
    redis.eval.mockRejectedValue(new Error('Redis unavailable'));
    await expect(service.refreshToken('refresh-old')).rejects.toMatchObject({
      error: { code: 13 },
    });
  });

  it.each([0, -1])(
    'still rejects a reused or missing refresh token (%s)',
    async (result) => {
      redis.eval.mockResolvedValue(result);
      await expect(service.refreshToken('refresh-old')).rejects.toMatchObject({
        error: { code: 16 },
      });
    },
  );

  it.each([
    new JsonWebTokenError('Invalid token'),
    new TokenExpiredError('Expired token', new Date(0)),
  ])('still rejects invalid or expired JWTs', async (error) => {
    verifyAsync.mockRejectedValue(error);
    await expect(service.refreshToken('refresh-old')).rejects.toMatchObject({
      error: { code: 16 },
    });
    expect(findById).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });
});

describe('AuthService password reset preflight', () => {
  it.each([true, false])(
    'returns validity %s after hashing the presented token',
    async (valid) => {
      const isValid = jest.fn().mockResolvedValue(valid);
      const service = new AuthService(
        { isPasswordResetTokenValid: isValid } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await expect(
        service.validatePasswordResetToken({ token: 'test-reset-token' }),
      ).resolves.toEqual({ valid });
      expect(isValid).toHaveBeenCalledWith(
        expect.stringMatching(/^[a-f0-9]{64}$/),
      );
      expect(isValid).not.toHaveBeenCalledWith('test-reset-token');
    },
  );

  it('rejects missing tokens without querying storage', async () => {
    const isValid = jest.fn();
    const service = new AuthService(
      { isPasswordResetTokenValid: isValid } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.validatePasswordResetToken({ token: '' }),
    ).resolves.toEqual({ valid: false });
    expect(isValid).not.toHaveBeenCalled();
  });

  it('rejects an invalid token without writing a password', async () => {
    const reset = jest.fn();
    const service = new AuthService(
      {
        isPasswordResetTokenValid: jest.fn().mockResolvedValue(false),
        resetPasswordWithToken: reset,
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.resetPassword({
        token: 'invalid-test-token',
        newPassword: 'Music123!',
      }),
    ).rejects.toMatchObject({ error: { code: 16 } });
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('AuthService TOTP replay protection', () => {
  let redis: {
    eval: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    getdel: jest.Mock;
    del: jest.Mock;
  };
  let service: AuthService;

  beforeEach(() => {
    redis = {
      eval: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      getdel: jest.fn(),
      del: jest.fn(),
    };
    service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      redis as never,
    );
  });

  it.each([
    [480, 'Try again in 8 minutes.'],
    [1, 'Try again in 1 minute.'],
    [0, 'Please wait a moment and try again.'],
  ])('returns the English rate-limit message for TTL %i', async (ttl, wait) => {
    redis.eval.mockResolvedValue([6, ttl]);
    await expect(
      service['assertRateLimit']('login', 'listener', {
        maxAttempts: 5,
        windowSeconds: 600,
        message: 'Too many sign-in attempts',
      }),
    ).rejects.toMatchObject({
      error: { code: 8, message: `Too many sign-in attempts. ${wait}` },
    });
  });

  it('claims a new TOTP counter with one atomic Redis operation', async () => {
    redis.eval.mockResolvedValue(1);

    await expect(
      service['assertNotReusedTotpCounter']('user-1', 12345),
    ).resolves.toBeUndefined();

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('candidateCounter <= lastCounterNumber'),
      1,
      'auth:2fa:otp:last:user-1',
      '12345',
      '120',
    );
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('distinguishes an expired sign-in challenge from an incorrect verification code', async () => {
    redis.eval.mockResolvedValue([1, 300]);
    redis.get.mockResolvedValue(null);
    await expect(
      service.verifyTwoFactorLogin({
        challengeId: 'test-challenge',
        code: '123456',
      }),
    ).rejects.toMatchObject({
      error: {
        code: 9,
        message: 'Your sign-in session has expired. Sign in again.',
      },
    });
  });

  it('rejects a counter already claimed by a concurrent request', async () => {
    redis.eval.mockResolvedValue(0);

    await expect(
      service['assertNotReusedTotpCounter']('user-1', 12345),
    ).rejects.toThrow('Mã 2FA đã được sử dụng');
  });

  it('does not issue a session if another request consumed the challenge during verification', async () => {
    redis.eval.mockResolvedValue([1, 300]);
    redis.get.mockResolvedValue(
      JSON.stringify({ userId: 'user-1', deviceId: 'device-1' }),
    );
    redis.getdel.mockResolvedValue(null);
    const guardedService = new AuthService(
      {
        findAuthUserById: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'USER',
          isActive: true,
          twoFactorSecret: 'encrypted-secret',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      redis as never,
    );
    jest
      .spyOn(
        guardedService as unknown as {
          verifyTwoFactorCodeOrRecovery: () => Promise<boolean>;
        },
        'verifyTwoFactorCodeOrRecovery',
      )
      .mockResolvedValue(true);
    await expect(
      guardedService.verifyTwoFactorLogin({
        challengeId: 'test-challenge',
        code: '123456',
      }),
    ).rejects.toMatchObject({ error: { code: 9 } });
    expect(redis.getdel).toHaveBeenCalledWith(
      'auth:2fa:challenge:test-challenge',
    );
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('releases a 2FA setup lock only when this request still owns it', async () => {
    redis.eval.mockResolvedValue(0);

    await expect(
      service['releaseLockIfOwned']('auth:2fa:confirm:lock:user-1', 'owner-a'),
    ).resolves.toBeUndefined();

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("GET", KEYS[1]) == ARGV[1]'),
      1,
      'auth:2fa:confirm:lock:user-1',
      'owner-a',
    );
  });

  it('preserves stored session metadata when a refresh token is rotated', async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({
        deviceId: 'device-1',
        ipAddress: '::1',
        userAgent: 'Mozilla/5.0 Chrome/140.0',
        lastSeenAt: 123,
      }),
    );

    await expect(
      service['getSessionMetadata']('user-1', 'device-1'),
    ).resolves.toEqual({
      ipAddress: '::1',
      userAgent: 'Mozilla/5.0 Chrome/140.0',
    });
  });

  it('does not fail token refresh when old session metadata is malformed', async () => {
    redis.get.mockResolvedValue('{not-json');

    await expect(
      service['getSessionMetadata']('user-1', 'device-1'),
    ).resolves.toBeUndefined();
  });

  it('caps active sessions atomically and removes credentials for evicted devices', async () => {
    const cleanup = {
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    const sessionRedis = {
      eval: jest.fn().mockResolvedValue(['old-device']),
      pipeline: jest.fn(() => cleanup),
    };
    const sessionService = new AuthService(
      {} as never,
      {} as never,
      {
        get: (key: string) =>
          key === 'AUTH_MAX_ACTIVE_SESSIONS' ? '2' : undefined,
        getOrThrow: (key: string) =>
          key === 'JWT_REFRESH_EXPIRES_IN' ? '7d' : '',
      } as never,
      {} as never,
      sessionRedis as never,
    );

    await sessionService['saveRefreshToken'](
      'user-1',
      'refresh-token',
      'current-device',
    );

    expect(sessionRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('ZADD'),
      4,
      'auth:refresh:user-1:current-device',
      'auth:session:user-1:current-device',
      'auth:devices:user-1',
      'auth:devices:user-1:recency',
      expect.any(String),
      expect.any(String),
      '604800',
      'current-device',
      expect.any(String),
      '2',
    );
    expect(cleanup.del).toHaveBeenCalledWith('auth:refresh:user-1:old-device');
    expect(cleanup.del).toHaveBeenCalledWith('auth:session:user-1:old-device');
    expect(cleanup.del).toHaveBeenCalledWith(
      'auth:2fa:trusted:user-1:old-device',
    );
    expect(cleanup.exec).toHaveBeenCalledTimes(1);
  });
});
