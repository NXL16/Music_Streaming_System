jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
}));

jest.mock('./schemas/user-metadata.schema', () => ({
  UserMetadata: class UserMetadata {},
}));

jest.mock('../common/database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../wallet/wallet-client.service', () => ({
  WalletClientService: class WalletClientService {},
  DEFAULT_WALLET_GRPC_TIMEOUT_MS: 10_000,
}));

import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../common/database/prisma.service';
import type { WalletClientService } from '../wallet/wallet-client.service';
import { UserProvisioningOutboxService } from './user-provisioning-outbox.service';
import { USER_PROVISIONING_EVENT_TYPES } from './user-provisioning-outbox.types';

describe('UserProvisioningOutboxService', () => {
  let queryRaw: jest.Mock;
  let executeRaw: jest.Mock;
  let metadataUpdateOne: jest.Mock;
  let metadataExec: jest.Mock;
  let createWalletForUser: jest.Mock;

  function createService(overrides?: {
    maxAttempts?: string;
    leaseSeconds?: string;
    walletTimeoutMs?: string;
  }) {
    queryRaw = jest.fn();
    executeRaw = jest.fn().mockResolvedValue(1);
    metadataExec = jest.fn().mockResolvedValue({ upsertedCount: 1 });
    metadataUpdateOne = jest.fn().mockReturnValue({ exec: metadataExec });
    createWalletForUser = jest.fn().mockResolvedValue(undefined);

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'IDENTITY_OUTBOX_MAX_ATTEMPTS') {
          return overrides?.maxAttempts;
        }
        if (key === 'IDENTITY_OUTBOX_LEASE_SECONDS') {
          return overrides?.leaseSeconds;
        }
        if (key === 'WALLET_GRPC_TIMEOUT_MS') {
          return overrides?.walletTimeoutMs;
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    return new UserProvisioningOutboxService(
      {
        $queryRaw: queryRaw,
        $executeRaw: executeRaw,
      } as unknown as PrismaService,
      config,
      { createWalletForUser } as unknown as WalletClientService,
      { updateOne: metadataUpdateOne } as never,
    );
  }

  it('uses idempotent targets and marks both provisioning messages after dispatch', async () => {
    const service = createService();
    queryRaw.mockResolvedValue([
      {
        id: 'metadata-1',
        eventType: USER_PROVISIONING_EVENT_TYPES.metadata,
        userId: 'user-1',
        attempts: 1,
      },
      {
        id: 'wallet-1',
        eventType: USER_PROVISIONING_EVENT_TYPES.wallet,
        userId: 'user-1',
        attempts: 1,
      },
    ]);

    await service.processPending();

    expect(metadataUpdateOne).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { $setOnInsert: { userId: 'user-1' } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    expect(metadataExec).toHaveBeenCalledTimes(1);
    expect(createWalletForUser).toHaveBeenCalledWith('user-1', 10_000);
    expect(executeRaw).toHaveBeenCalledTimes(4);
  });

  it('persists a retry after a post-commit downstream failure', async () => {
    const service = createService();
    queryRaw.mockResolvedValue([
      {
        id: 'wallet-1',
        eventType: USER_PROVISIONING_EVENT_TYPES.wallet,
        userId: 'user-1',
        attempts: 1,
      },
    ]);
    createWalletForUser.mockRejectedValueOnce(new Error('wallet unavailable'));

    await service.processPending();

    expect(executeRaw).toHaveBeenCalledTimes(2);
    const failureCall = (executeRaw.mock.calls as unknown[][]).find((call) =>
      call.some(
        (value) =>
          Array.isArray(value) &&
          value.every((item) => typeof item === 'string') &&
          value.join('').includes('"deadLetteredAt"'),
      ),
    );
    expect(failureCall).toBeDefined();
  });

  it('never acknowledges a stale lease after a successful side effect', async () => {
    const service = createService();
    queryRaw.mockResolvedValue([
      {
        id: 'metadata-1',
        eventType: USER_PROVISIONING_EVENT_TYPES.metadata,
        userId: 'user-1',
        attempts: 1,
      },
    ]);
    executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await service.processPending();

    expect(metadataExec).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('dead-letters a failure at the configured retry cap', async () => {
    const service = createService({ maxAttempts: '1' });
    queryRaw.mockResolvedValue([
      {
        id: 'wallet-1',
        eventType: USER_PROVISIONING_EVENT_TYPES.wallet,
        userId: 'user-1',
        attempts: 1,
      },
    ]);
    createWalletForUser.mockRejectedValueOnce(new Error('wallet unavailable'));

    await service.processPending();

    expect(
      (executeRaw.mock.calls as unknown[][]).some((call) =>
        call.some((value: unknown) => value === true),
      ),
    ).toBe(true);
  });

  it('does not dispatch a message after another worker takes its lease', async () => {
    const service = createService();
    queryRaw.mockResolvedValue([
      {
        id: 'wallet-1',
        eventType: USER_PROVISIONING_EVENT_TYPES.wallet,
        userId: 'user-1',
        attempts: 1,
      },
    ]);
    executeRaw.mockResolvedValueOnce(0);

    await service.processPending();

    expect(createWalletForUser).not.toHaveBeenCalled();
    expect(metadataUpdateOne).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('requires the Wallet deadline to fit inside the outbox lease', () => {
    expect(() => createService({ leaseSeconds: '5' })).toThrow(
      'WALLET_GRPC_TIMEOUT_MS phải nhỏ hơn IDENTITY_OUTBOX_LEASE_SECONDS',
    );
  });
});
