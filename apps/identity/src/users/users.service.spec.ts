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
    transaction = jest.fn(
      (callback: (transactionClient: unknown) => unknown) =>
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

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}
