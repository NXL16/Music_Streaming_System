import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../database/prisma.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { TokenCleanupService } from './token-cleanup.service';

type TokenCleanupInternals = {
  runCleanup(): Promise<void>;
  scheduleRetry(error: unknown): number | undefined;
};

describe('TokenCleanupService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses independent idempotent deletes instead of a pool-holding transaction', async () => {
    const passwordResetDelete = jest.fn().mockResolvedValue({ count: 1 });
    const emailVerifyDelete = jest.fn().mockResolvedValue({ count: 2 });
    const recoveryDelete = jest.fn().mockResolvedValue({ count: 3 });
    const transaction = jest.fn();
    const prisma = {
      passwordResetToken: { deleteMany: passwordResetDelete },
      emailVerificationToken: { deleteMany: emailVerifyDelete },
      twoFactorRecoveryCode: { deleteMany: recoveryDelete },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new TokenCleanupService(prisma, {
      get: jest.fn(),
    } as unknown as ConfigService);

    await (service as unknown as TokenCleanupInternals).runCleanup();

    expect(transaction).not.toHaveBeenCalled();
    expect(passwordResetDelete).toHaveBeenCalledTimes(1);
    expect(emailVerifyDelete).toHaveBeenCalledTimes(1);
    expect(recoveryDelete).toHaveBeenCalledTimes(1);
    expect(passwordResetDelete.mock.invocationCallOrder[0]).toBeLessThan(
      emailVerifyDelete.mock.invocationCallOrder[0],
    );
    expect(emailVerifyDelete.mock.invocationCallOrder[0]).toBeLessThan(
      recoveryDelete.mock.invocationCallOrder[0],
    );
  });

  it('schedules a bounded retry for Prisma transaction-acquisition failures', () => {
    jest.useFakeTimers();
    const service = new TokenCleanupService(
      {} as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    const internals = service as unknown as TokenCleanupInternals;

    expect(internals.scheduleRetry({ code: 'P2028' })).toBe(5_000);
    expect(internals.scheduleRetry({ code: 'P2028' })).toBeUndefined();

    service.onModuleDestroy();
  });
});
