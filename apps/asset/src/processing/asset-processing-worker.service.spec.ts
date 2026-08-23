import assert from "node:assert/strict";
import test from "node:test";
import { AssetStatus } from "../generated/prisma/client";
import { AssetProcessingWorkerService } from "./asset-processing-worker.service";

type ClaimedJob = {
  id: string;
  assetId: string;
  attempts: number;
  leaseToken: string;
  reclaimed: boolean;
};

type WorkerInternals = {
  complete: (
    job: ClaimedJob,
    asset: unknown,
    result: unknown,
  ) => Promise<boolean>;
  fail: (job: ClaimedJob, asset: unknown, error: unknown) => Promise<void>;
  heartbeat: (
    job: ClaimedJob,
    lease: { active: boolean; lost: boolean },
  ) => Promise<void>;
  onModuleDestroy: () => void;
  activeJob?: ClaimedJob;
  activeLease?: { active: boolean; lost: boolean };
  metrics: {
    jobsFailed: number;
    jobsRetried: number;
    jobsDeadLettered: number;
    leasesLost: number;
  };
  logger: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
};

const job: ClaimedJob = {
  id: "job-1",
  assetId: "asset-1",
  attempts: 1,
  leaseToken: "current-lease-token",
  reclaimed: false,
};

const asset = {
  id: "asset-1",
  status: AssetStatus.PROCESSING,
  sourceObjectKey: "uploads/asset-1/source.webp",
};

const processingResult = {
  publicUrl: "https://assets.example/processed/asset-1.webp",
  width: 632,
  height: 632,
  durationMillis: 0,
  variants: {},
};

function workerWith(
  prisma: unknown,
  processor: { abort: () => void } = { abort: () => undefined },
): WorkerInternals {
  const worker = new AssetProcessingWorkerService(
    prisma as never,
    processor as never,
    { get: () => undefined } as never,
  ) as unknown as WorkerInternals;

  worker.logger = {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  return worker;
}

void test("a stale lease token cannot complete an asset job", async () => {
  let assetUpdates = 0;
  let jobDeletes = 0;
  const transaction = {
    $queryRaw: () => Promise.resolve([]),
    asset: {
      updateMany: () => {
        assetUpdates += 1;
        return Promise.resolve({ count: 1 });
      },
    },
    assetProcessingJob: {
      deleteMany: () => {
        jobDeletes += 1;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (transactionClient: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  };
  const worker = workerWith(prisma);

  const completed = await worker.complete(job, asset, processingResult);

  assert.equal(completed, false);
  assert.equal(assetUpdates, 0);
  assert.equal(jobDeletes, 0);
});

void test("a stale lease token cannot schedule a retry", async () => {
  const retryUpdates: unknown[] = [];
  const prisma = {
    assetProcessingJob: {
      updateMany: (input: unknown) => {
        retryUpdates.push(input);
        return Promise.resolve({ count: 0 });
      },
    },
  };
  const worker = workerWith(prisma);

  await worker.fail(job, asset, new Error("temporary processing error"));

  assert.equal(retryUpdates.length, 1);
  const retryInput = retryUpdates[0] as {
    where: { id: string; leaseToken: string };
    data: {
      lockedAt: null;
      leaseToken: null;
      availableAt: Date;
      lastError: string;
    };
  };
  assert.deepEqual(retryInput.where, {
    id: job.id,
    leaseToken: job.leaseToken,
  });
  assert.equal(retryInput.data.lockedAt, null);
  assert.equal(retryInput.data.leaseToken, null);
  assert.ok(retryInput.data.availableAt instanceof Date);
  assert.equal(retryInput.data.lastError, "temporary processing error");
  assert.equal(worker.metrics.jobsFailed, 0);
  assert.equal(worker.metrics.jobsRetried, 0);
});

void test("a heartbeat database error loses the lease and aborts processing", async () => {
  let aborts = 0;
  const worker = workerWith(
    {
      assetProcessingJob: {
        updateMany: () => Promise.reject(new Error("database unavailable")),
      },
    },
    { abort: () => (aborts += 1) },
  );
  const lease = { active: true, lost: false };

  await worker.heartbeat(job, lease);

  assert.deepEqual(lease, { active: true, lost: true });
  assert.equal(worker.metrics.leasesLost, 1);
  assert.equal(aborts, 1);
});

void test("a terminal processing failure writes a DLQ intent before deleting the fenced job", async () => {
  const terminalJob = { ...job, attempts: 5 };
  const sequence: string[] = [];
  let deadLetterInput: unknown;
  let cleanupInput: unknown;
  const transaction = {
    $queryRaw: () => Promise.resolve([{ id: terminalJob.id }]),
    asset: {
      updateMany: () => {
        sequence.push("asset-failed");
        return Promise.resolve({ count: 1 });
      },
    },
    assetProcessingDeadLetter: {
      upsert: (input: unknown) => {
        sequence.push("dlq-upsert");
        deadLetterInput = input;
        return Promise.resolve({});
      },
    },
    assetArtifactCleanupJob: {
      upsert: (input: unknown) => {
        sequence.push("cleanup-upsert");
        cleanupInput = input;
        return Promise.resolve({});
      },
    },
    assetProcessingJob: {
      deleteMany: () => {
        sequence.push("job-delete");
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (transactionClient: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  };
  const worker = workerWith(prisma);

  await worker.fail(terminalJob, asset, new Error("terminal processing error"));

  assert.deepEqual(sequence, [
    "asset-failed",
    "dlq-upsert",
    "cleanup-upsert",
    "job-delete",
  ]);
  assert.deepEqual(deadLetterInput, {
    where: { jobId: terminalJob.id },
    create: {
      jobId: terminalJob.id,
      assetId: asset.id,
      attempts: terminalJob.attempts,
      sourceObjectKey: asset.sourceObjectKey,
      errorMessage: "terminal processing error",
    },
    update: {
      attempts: terminalJob.attempts,
      errorMessage: "terminal processing error",
    },
  });
  const cleanup = cleanupInput as {
    where: { assetId: string };
    create: { assetId: string; sourceObjectKey: string; availableAt: Date };
    update: {
      sourceObjectKey: string;
      availableAt: Date;
      lockedAt: null;
      leaseToken: null;
      lastError: string;
    };
  };
  assert.deepEqual(cleanup.where, { assetId: asset.id });
  assert.equal(cleanup.create.assetId, asset.id);
  assert.equal(cleanup.create.sourceObjectKey, asset.sourceObjectKey);
  assert.ok(cleanup.create.availableAt instanceof Date);
  assert.equal(cleanup.update.sourceObjectKey, asset.sourceObjectKey);
  assert.ok(cleanup.update.availableAt instanceof Date);
  assert.equal(cleanup.update.lockedAt, null);
  assert.equal(cleanup.update.leaseToken, null);
  assert.equal(cleanup.update.lastError, "");
  assert.equal(worker.metrics.jobsFailed, 1);
  assert.equal(worker.metrics.jobsDeadLettered, 1);
});

void test("a successful completion cancels an obsolete artifact cleanup intent", async () => {
  const sequence: string[] = [];
  const transaction = {
    $queryRaw: () => Promise.resolve([{ id: job.id }]),
    asset: {
      updateMany: () => {
        sequence.push("asset-ready");
        return Promise.resolve({ count: 1 });
      },
    },
    assetArtifactCleanupJob: {
      deleteMany: () => {
        sequence.push("cleanup-delete");
        return Promise.resolve({ count: 1 });
      },
    },
    assetProcessingJob: {
      deleteMany: () => {
        sequence.push("job-delete");
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (transactionClient: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  };
  const worker = workerWith(prisma);

  const completed = await worker.complete(job, asset, processingResult);

  assert.equal(completed, true);
  assert.deepEqual(sequence, ["asset-ready", "cleanup-delete", "job-delete"]);
});

void test('shutdown leaves an active lease for TTL-based recovery', () => {
  let jobUpdates = 0;
  let aborts = 0;
  const prisma = {
    assetProcessingJob: {
      updateMany: () => {
        jobUpdates += 1;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const worker = workerWith(prisma, {
    abort: () => {
      aborts += 1;
    },
  });
  worker.activeJob = job;
  worker.activeLease = { active: true, lost: false };

  worker.onModuleDestroy();

  assert.equal(aborts, 1);
  assert.equal(jobUpdates, 0);
  assert.deepEqual(worker.activeLease, { active: false, lost: true });
});
