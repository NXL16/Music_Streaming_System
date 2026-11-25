import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../common/database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { UsersService } from './users.service';

jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
}));

jest.mock('mongoose', () => ({}));

jest.mock('./schemas/user-metadata.schema', () => ({
  UserMetadata: class UserMetadata {},
}));

jest.mock('../generated/prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    constructor(
      message: string,
      readonly options: { code: string; clientVersion: string },
    ) {
      super(message);
    }

    get code(): string {
      return this.options.code;
    }
  }

  return { Prisma: { PrismaClientKnownRequestError } };
});

jest.mock('../common/database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('UsersService.linkGoogleAccount', () => {
  const userId = 'user-1';
  const providerSub = 'google-subject-1';
  const emailAtProvider = 'user@example.com';

  let create: jest.Mock;
  let findUnique: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    create = jest.fn();
    findUnique = jest.fn();

    service = new UsersService(
      {
        oAuthAccount: {
          create,
          findUnique,
        },
      } as unknown as PrismaService,
      {} as never,
    );
  });

  it('treats a duplicate binding for the same user as idempotent', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue({ userId });

    await expect(
      service.linkGoogleAccount(userId, providerSub, emailAtProvider),
    ).resolves.toBeUndefined();

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerSub: {
          provider: 'GOOGLE',
          providerSub,
        },
      },
      select: { userId: true },
    });
  });

  it('rejects a duplicate binding owned by another user', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue({ userId: 'another-user' });

    await expect(
      service.linkGoogleAccount(userId, providerSub, emailAtProvider),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a duplicate constraint when no matching binding can be verified', async () => {
    create.mockRejectedValue(uniqueConstraintError());
    findUnique.mockResolvedValue(null);

    await expect(
      service.linkGoogleAccount(userId, providerSub, emailAtProvider),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService.create provisioning outbox', () => {
  const createdUser = {
    id: 'user-1',
    username: 'linh',
    email: 'linh@example.com',
    password: 'hashed-password',
    displayName: 'Linh',
    role: 'USER',
    isActive: true,
    emailVerified: false,
    twoFactorEnabled: false,
    tokenVersion: 0,
    lastPasswordChangeAt: new Date('2026-08-22T00:00:00.000Z'),
    lastLoginAt: null,
    createdAt: new Date('2026-08-22T00:00:00.000Z'),
    updatedAt: new Date('2026-08-22T00:00:00.000Z'),
  };

  let createUser: jest.Mock;
  let insertOutbox: jest.Mock;
  let transaction: jest.Mock;
  let metadataCreate: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    createUser = jest.fn().mockResolvedValue(createdUser);
    insertOutbox = jest.fn().mockResolvedValue(2);
    transaction = jest.fn((callback: (transactionClient: unknown) => unknown) =>
      callback({
        user: { create: createUser },
        $executeRaw: insertOutbox,
      }),
    );
    metadataCreate = jest.fn();

    service = new UsersService(
      { $transaction: transaction } as unknown as PrismaService,
      { create: metadataCreate } as never,
    );
  });

  it('commits the user and both provisioning requests in one PostgreSQL transaction', async () => {
    const result = await service.create({
      username: 'linh',
      email: 'linh@example.com',
      password: 'hashed-password',
      displayName: 'Linh',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith({
      data: {
        username: 'linh',
        email: 'linh@example.com',
        password: 'hashed-password',
        displayName: 'Linh',
        role: 'USER',
      },
    });
    expect(insertOutbox).toHaveBeenCalledTimes(1);
    expect(metadataCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: createdUser.id,
      avatarAssetId: null,
      bio: '',
    });
  });

  it('does not report a created user when the atomic outbox write fails', async () => {
    insertOutbox.mockRejectedValueOnce(new Error('outbox write failed'));

    await expect(
      service.create({
        username: 'linh',
        email: 'linh@example.com',
        password: 'hashed-password',
        displayName: 'Linh',
      }),
    ).rejects.toThrow('outbox write failed');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(metadataCreate).not.toHaveBeenCalled();
  });
});

describe('UsersService password reset token preflight', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  let findFirst: jest.Mock;
  let updateMany: jest.Mock;
  let transaction: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    findFirst = jest.fn();
    updateMany = jest.fn();
    transaction = jest.fn();
    service = new UsersService(
      {
        passwordResetToken: { findFirst, updateMany },
        $transaction: transaction,
      } as unknown as PrismaService,
      {} as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('checks expiry, usage and active account without consuming the token', async () => {
    findFirst.mockResolvedValue({ id: 'token-id' });
    await expect(service.isPasswordResetTokenValid('token-hash')).resolves.toBe(
      true,
    );
    await expect(service.isPasswordResetTokenValid('token-hash')).resolves.toBe(
      true,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: 'token-hash',
        usedAt: null,
        expiresAt: { gt: now },
        user: { isActive: true },
      },
      select: { id: true },
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects tokens that do not meet the validity query', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.isPasswordResetTokenValid('token-hash')).resolves.toBe(
      false,
    );
  });

  it('does not report a database outage as an invalid token', async () => {
    findFirst.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.isPasswordResetTokenValid('token-hash'),
    ).rejects.toThrow('database unavailable');
  });
});

describe('UsersService password reset writes', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  let queryRaw: jest.Mock;
  let findUnique: jest.Mock;
  let updateMany: jest.Mock;
  let create: jest.Mock;
  let updateUser: jest.Mock;
  let externalUpdate: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    queryRaw = jest.fn().mockResolvedValue([{ id: 'user-1' }]);
    findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'token-1', userId: 'user-1' });
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    create = jest.fn().mockResolvedValue({});
    updateUser = jest.fn().mockResolvedValue({ id: 'user-1', tokenVersion: 2 });
    externalUpdate = jest.fn();
    const tx = {
      $queryRaw: queryRaw,
      passwordResetToken: { findUnique, updateMany, create },
      user: { update: updateUser },
    };
    service = new UsersService(
      {
        $transaction: (work: (database: typeof tx) => Promise<unknown>) =>
          work(tx),
        user: { update: externalUpdate },
      } as unknown as PrismaService,
      {} as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('locks the account before replacing old reset links', async () => {
    await service.createPasswordResetToken(
      'user-1',
      'new-token-hash',
      new Date(),
    );
    expect(queryRaw).toHaveBeenCalledWith(expect.any(Array), 'user-1');
    const [query] = queryRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(query.join('')).toContain('FOR UPDATE');
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      updateMany.mock.invocationCallOrder[0],
    );
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
      data: { usedAt: now },
    });
  });

  it('updates the password and session version in the same transaction as claiming the token', async () => {
    await expect(
      service.resetPasswordWithToken('token-hash', 'password-hash'),
    ).resolves.toMatchObject({ id: 'user-1', tokenVersion: 2 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'token-1',
          usedAt: null,
          expiresAt: { gt: now },
          user: { isActive: true },
        },
      }),
    );
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        password: 'password-hash',
        lastPasswordChangeAt: now,
        tokenVersion: { increment: 1 },
      },
    });
    expect(externalUpdate).not.toHaveBeenCalled();
  });

  it('does not update a password when another request already claimed or invalidated the token', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.resetPasswordWithToken('token-hash', 'password-hash'),
    ).resolves.toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects an unknown token without locking an account or writing data', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.resetPasswordWithToken('token-hash', 'password-hash'),
    ).resolves.toBeNull();
    expect(queryRaw).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('propagates password write failures so the transaction can roll back the token claim', async () => {
    updateUser.mockRejectedValue(new Error('password write failed'));
    await expect(
      service.resetPasswordWithToken('token-hash', 'password-hash'),
    ).rejects.toThrow('password write failed');
  });
});

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}
