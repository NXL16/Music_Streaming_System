import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetStatus } from '../generated/prisma/client';
import { AssetArtifactRetentionService } from './asset-artifact-retention.service';

type ClaimedCleanupJob = {
  id: string;
  assetId: string;
  sourceObjectKey: string;
  attempts: number;
  leaseToken: string;
  reclaimed: boolean;
};

type RetentionInternals = {
  fenceAssetForDeletion: (job: ClaimedCleanupJob) => Promise<boolean>;
  heartbeat: (
    job: ClaimedCleanupJob,
    lease: { active: boolean; lost: boolean },
  ) => Promise<void>;
  retry: (job: ClaimedCleanupJob, error: unknown) => Promise<void>;
  metrics: { retried: number; leasesLost: number };
  logger: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
};

const job: ClaimedCleanupJob = {
  id: 'cleanup-job-1',
  assetId: 'asset-1',
  sourceObjectKey: 'assets/image/artwork/source.webp',
  attempts: 2,
  leaseToken: 'current-cleanup-lease',
  reclaimed: false,
};

function sweepWith(prisma: unknown): RetentionInternals {
  const sweep = new AssetArtifactRetentionService(
    prisma as never,
    { deleteMany: () => Promise.resolve(), deletePrefix: () => Promise.resolve() } as never,
    { get: () => undefined } as never,
  ) as unknown as RetentionInternals;
  sweep.logger = {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  return sweep;
}

void test('a current cleanup lease fences a failed asset before R2 deletion', async () => {
  let queryCount = 0;
  let updateInput: unknown;
  const transaction = {
    $queryRaw: () => {
      queryCount += 1;
      return Promise.resolve(
        queryCount === 1
          ? [{ status: AssetStatus.FAILED }]
          : [{ id: job.id }],
      );
    },
    asset: {
      updateMany: (input: unknown) => {
        updateInput = input;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (transactionClient: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  };
  const sweep = sweepWith(prisma);

  assert.equal(await sweep.fenceAssetForDeletion(job), true);
  const update = updateInput as {
    where: { id: string; status: AssetStatus };
    data: { status: AssetStatus; publicUrl: string };
  };
  assert.deepEqual(update.where, { id: job.assetId, status: AssetStatus.FAILED });
  assert.equal(update.data.status, AssetStatus.DELETED);
  assert.equal(update.data.publicUrl, '');
});

void test('a stale cleanup lease cannot fence an asset', async () => {
  let updateCalls = 0;
  let queryCount = 0;
  const transaction = {
    $queryRaw: () => {
      queryCount += 1;
      return Promise.resolve(
        queryCount === 1 ? [{ status: AssetStatus.FAILED }] : [],
      );
    },
    asset: {
      updateMany: () => {
        updateCalls += 1;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (transactionClient: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  };
  const sweep = sweepWith(prisma);

  assert.equal(await sweep.fenceAssetForDeletion(job), false);
  assert.equal(updateCalls, 0);
});

void test('a reprocessed asset discards its delayed cleanup intent', async () => {
  let queryCount = 0;
  let discardInput: unknown;
  const transaction = {
    $queryRaw: () => {
      queryCount += 1;
      return Promise.resolve(
        queryCount === 1
          ? [{ status: AssetStatus.PROCESSING }]
          : [{ id: job.id }],
      );
    },
    assetArtifactCleanupJob: {
      deleteMany: (input: unknown) => {
        discardInput = input;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (transactionClient: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  };
  const sweep = sweepWith(prisma);

  assert.equal(await sweep.fenceAssetForDeletion(job), false);
  assert.deepEqual(discardInput, {
    where: { id: job.id, leaseToken: job.leaseToken },
  });
});

void test('a failed R2 deletion is retried with the current cleanup lease', async () => {
  let retryInput: unknown;
  const prisma = {
    assetArtifactCleanupJob: {
      updateMany: (input: unknown) => {
        retryInput = input;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const sweep = sweepWith(prisma);

  await sweep.retry(job, new Error('R2 temporarily unavailable'));

  const retry = retryInput as {
    where: { id: string; leaseToken: string };
    data: {
      lockedAt: null;
      leaseToken: null;
      availableAt: Date;
      lastError: string;
    };
  };
  assert.deepEqual(retry.where, { id: job.id, leaseToken: job.leaseToken });
  assert.equal(retry.data.lockedAt, null);
  assert.equal(retry.data.leaseToken, null);
  assert.ok(retry.data.availableAt instanceof Date);
  assert.equal(retry.data.lastError, 'R2 temporarily unavailable');
  assert.equal(sweep.metrics.retried, 1);
});

void test('a heartbeat database error loses the cleanup lease before more deletions', async () => {
  const sweep = sweepWith({
    assetArtifactCleanupJob: {
      updateMany: () => Promise.reject(new Error('database unavailable')),
    },
  });
  const lease = { active: true, lost: false };

  await sweep.heartbeat(job, lease);

  assert.deepEqual(lease, { active: true, lost: true });
  assert.equal(sweep.metrics.leasesLost, 1);
});
