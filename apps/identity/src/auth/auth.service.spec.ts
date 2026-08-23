import { AuthService } from './auth.service';

jest.mock('@musical/shared-proto', () => ({}));
jest.mock('@musical/shared-types', () => ({
  authAccessBlacklistKey: (jti: string) => `auth:blacklist:${jti}`,
  authDevicesKey: (userId: string) => `auth:devices:${userId}`,
  authRefreshKey: (userId: string, deviceId: string) =>
    `auth:refresh:${userId}:${deviceId}`,
  authStateKey: (userId: string) => `auth:state:${userId}`,
}));
jest.mock('@grpc/grpc-js', () => ({ status: { UNAUTHENTICATED: 16 } }));
jest.mock('@nestjs/microservices', () => ({
  RpcException: class RpcException extends Error {
    constructor(readonly error: { message: string }) {
      super(error.message);
    }
  },
}));
jest.mock('../generated/prisma/client', () => ({ Prisma: {} }));
jest.mock('../generated/prisma/enums', () => ({}));
jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));
jest.mock('../common/mail/mail.service', () => ({
  MailService: class MailService {},
}));

describe('AuthService TOTP replay protection', () => {
  let redis: { eval: jest.Mock; get: jest.Mock; set: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    redis = {
      eval: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    };
    service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      redis as never,
    );
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

  it('rejects a counter already claimed by a concurrent request', async () => {
    redis.eval.mockResolvedValue(0);

    await expect(
      service['assertNotReusedTotpCounter']('user-1', 12345),
    ).rejects.toThrow('Mã 2FA đã được sử dụng');
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
          key === 'AUTH_MAX_ACTIVE_SESSIONS'
              ? '2'
              : undefined,
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
    expect(cleanup.del).toHaveBeenCalledWith(
      'auth:refresh:user-1:old-device',
    );
    expect(cleanup.del).toHaveBeenCalledWith(
      'auth:session:user-1:old-device',
    );
    expect(cleanup.del).toHaveBeenCalledWith(
      'auth:2fa:trusted:user-1:old-device',
    );
    expect(cleanup.exec).toHaveBeenCalledTimes(1);
  });
});
