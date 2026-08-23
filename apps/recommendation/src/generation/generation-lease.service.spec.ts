import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { GenerationLeaseService } from './generation-lease.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(),
}));

function sqlText(call: readonly unknown[]): string {
  const [strings] = call;
  if (!Array.isArray(strings)) {
    throw new Error('Expected a tagged SQL template call');
  }

  return strings.join('');
}

function mockCall(mock: jest.Mock, index: number): readonly unknown[] {
  const call: unknown = mock.mock.calls[index];
  return Array.isArray(call) ? call : [];
}

describe('GenerationLeaseService', () => {
  const LEASE_TOKEN = '00000000-0000-4000-8000-000000000000';
  const mockedRandomUuid = jest.mocked(randomUUID);

  beforeEach(() => {
    mockedRandomUuid.mockReturnValue(LEASE_TOKEN);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  function createService(queryRows: unknown[] = []) {
    const queryRaw = jest.fn().mockResolvedValue(queryRows);
    const executeRaw = jest.fn().mockResolvedValue(1);
    const service = new GenerationLeaseService(
      {
        $queryRaw: queryRaw,
        $executeRaw: executeRaw,
      } as unknown as PrismaService,
      {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService,
    );

    return { service, queryRaw, executeRaw };
  }

  it('acquires only the token returned by an expired-or-empty lease row', async () => {
    const { service, queryRaw } = createService([{ leaseToken: LEASE_TOKEN }]);

    await expect(service.acquire('home-key')).resolves.toEqual({
      leaseKey: 'home-key',
      leaseToken: LEASE_TOKEN,
    });

    expect(sqlText(mockCall(queryRaw, 0))).toContain('ON CONFLICT');
    expect(sqlText(mockCall(queryRaw, 0))).toContain(
      'clock_timestamp()',
    );
  });

  it('does not claim a lease held by another worker', async () => {
    const { service } = createService([]);

    await expect(service.acquire('home-key')).resolves.toBeNull();
  });

  it('renews, checks, and releases only the matching token', async () => {
    const { service, queryRaw, executeRaw } = createService([
      { leaseToken: LEASE_TOKEN },
    ]);
    const lease = { leaseKey: 'home-key', leaseToken: LEASE_TOKEN };

    await expect(service.renew(lease)).resolves.toBe(true);
    await expect(service.isHeld(lease)).resolves.toBe(true);
    await service.release(lease);

    expect(sqlText(mockCall(queryRaw, 0))).toContain(
      'AND "leaseToken" =',
    );
    expect(sqlText(mockCall(queryRaw, 1))).toContain(
      'AND "expiresAt" > clock_timestamp()',
    );
    expect(sqlText(mockCall(executeRaw, 0))).toContain(
      'DELETE FROM "recommendation_generation_leases"',
    );
  });
});
