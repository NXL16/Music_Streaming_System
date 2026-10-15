import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Asset, AssetKind, AssetStatus, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { AssetProcessorService } from "./asset-processor.service";

interface ClaimedJob {
  id: string;
  assetId: string;
  attempts: number;
  leaseToken: string;
  reclaimed: boolean;
}

interface LeaseState {
  active: boolean;
  lost: boolean;
}

const DEFAULT_FAILED_ARTIFACT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type MetricName =
  | "jobsStarted"
  | "jobsSucceeded"
  | "jobsFailed"
  | "jobsRetried"
  | "jobsReclaimed"
  | "jobsDeadLettered"
  | "leasesLost";

type WorkerMetrics = Record<MetricName, number>;

@Injectable()
export class AssetProcessingWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AssetProcessingWorkerService.name);
  private readonly enabled: boolean;
  private readonly pollIntervalMs: number;
  private readonly lockTtlMs: number;
  private readonly videoLockTtlMs: number;
  private readonly maxAttempts: number;
  private readonly metricsIntervalMs: number;
  private readonly failedArtifactRetentionMs: number;
  private timer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private activeJob?: ClaimedJob;
  private activeAsset?: Asset;
  private activeLease?: LeaseState;
  private activeAbortController?: AbortController;
  private stopped = false;
  private readonly metrics: WorkerMetrics = {
    jobsStarted: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    jobsRetried: 0,
    jobsReclaimed: 0,
    jobsDeadLettered: 0,
    leasesLost: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: AssetProcessorService,
    config: ConfigService,
  ) {
    this.enabled = this.boolean(
      config.get<string>("ASSET_WORKER_ENABLED"),
      true,
    );
    this.pollIntervalMs = this.integer(
      config.get<string>("ASSET_WORKER_POLL_INTERVAL_MS"),
      2000,
    );
    this.lockTtlMs = this.integer(
      config.get<string>("ASSET_WORKER_LOCK_TTL_MS"),
      30 * 60 * 1000,
    );
    this.videoLockTtlMs = this.integer(
      config.get<string>("ASSET_VIDEO_WORKER_LOCK_TTL_MS"),
      2 * 60 * 1000,
    );
    this.maxAttempts = this.integer(
      config.get<string>("ASSET_WORKER_MAX_ATTEMPTS"),
      5,
    );
    this.metricsIntervalMs = this.integer(
      config.get<string>("ASSET_WORKER_METRICS_INTERVAL_MS"),
      60_000,
    );
    this.failedArtifactRetentionMs = this.integer(
      config.get<string>("ASSET_FAILED_ARTIFACT_RETENTION_MS"),
      DEFAULT_FAILED_ARTIFACT_RETENTION_MS,
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log("Asset processing worker is disabled");
      return;
    }
    this.logger.log("Asset processing worker started");
    this.metricsTimer = setInterval(
      () => this.logMetrics(),
      this.metricsIntervalMs,
    );
    this.metricsTimer.unref();
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.activeLease) {
      this.activeLease.active = false;
      this.activeLease.lost = true;
    }
    this.activeAbortController?.abort();
    const activeJob = this.activeJob;
    if (activeJob && this.activeAsset?.kind === AssetKind.VIDEO) {
      // A video operation is keyed by this durable job id. Modal records its
      // state under that id, so another worker can observe the same remote
      // operation after a graceful restart without launching a second GPU job.
      const released = await this.prisma.assetProcessingJob.updateMany({
        where: { id: activeJob.id, leaseToken: activeJob.leaseToken },
        data: {
          lockedAt: null,
          leaseToken: null,
          availableAt: new Date(),
        },
      });
      if (released.count === 1) {
        this.logger.log(
          `Released asset job ${activeJob.id} for durable recovery during shutdown`,
        );
      } else {
        this.logger.warn(
          `Asset job ${activeJob.id} could not be released during shutdown`,
        );
      }
    } else if (activeJob) {
      this.logger.warn(
        `Leaving non-video asset job ${activeJob.id} leased until expiry during shutdown`,
      );
    }
    this.logMetrics();
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      const job = await this.claim();
      if (!job) {
        this.schedule(this.pollIntervalMs);
        return;
      }
      this.increment("jobsStarted");
      if (job.reclaimed) this.increment("jobsReclaimed");
      await this.process(job);
      this.schedule(0);
    } catch (error) {
      this.logger.error("Asset worker tick failed", error);
      this.schedule(this.pollIntervalMs);
    }
  }

  private async claim(): Promise<ClaimedJob | undefined> {
    const leaseToken = randomUUID();
    const jobs = await this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT job."id", job."lockedAt"
        FROM "asset_processing_jobs" AS job
        INNER JOIN "assets" AS asset ON asset."id" = job."assetId"
        WHERE job."availableAt" <= NOW()
          AND (
            job."lockedAt" IS NULL
            OR job."lockedAt" < NOW() - CASE
              WHEN asset."kind" = 'VIDEO'::"AssetKind"
                THEN (${this.videoLockTtlMs}::double precision * INTERVAL '1 millisecond')
              ELSE (${this.lockTtlMs}::double precision * INTERVAL '1 millisecond')
            END
          )
        ORDER BY job."availableAt" ASC, job."createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "asset_processing_jobs" AS job
      SET
        "lockedAt" = NOW(),
        "leaseToken" = ${leaseToken},
        "attempts" = job."attempts" + 1,
        "updatedAt" = NOW()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING
        job."id",
        job."assetId",
        job."attempts",
        job."leaseToken",
        candidate."lockedAt" IS NOT NULL AS "reclaimed"
    `);
    return jobs[0];
  }

  private async process(job: ClaimedJob): Promise<void> {
    this.activeJob = job;
    try {
      const asset = await this.prisma.asset.findUnique({
        where: { id: job.assetId },
      });
      if (!asset || asset.status !== AssetStatus.PROCESSING) {
        if (await this.discard(job)) {
          this.logger.warn(
            `Discarded asset job ${job.id} because its asset is no longer processing`,
          );
        }
        return;
      }
      this.activeAsset = asset;
      if (job.attempts > this.maxAttempts) {
        await this.deadLetter(
          job,
          asset,
          "ASSET_PROCESSING_ATTEMPT_LIMIT_EXCEEDED",
        );
        return;
      }

      const lease: LeaseState = { active: true, lost: false };
      const abortController = new AbortController();
      this.activeLease = lease;
      this.activeAbortController = abortController;
      const leaseTtlMs =
        asset.kind === AssetKind.VIDEO ? this.videoLockTtlMs : this.lockTtlMs;
      const heartbeat = setInterval(
        () => void this.heartbeat(job, lease),
        Math.max(5000, Math.floor(leaseTtlMs / 3)),
      );
      heartbeat.unref();

      try {
        const result = await this.processor.process(
          asset,
          job.id,
          abortController.signal,
        );
        lease.active = false;
        if (lease.lost) return;
        if (!(await this.complete(job, asset, result))) {
          this.loseLease(job, lease, "completion");
          return;
        }
        this.increment("jobsSucceeded");
        this.logger.log(`Asset ${asset.id} is ready`);
      } catch (error) {
        lease.active = false;
        if (!lease.lost) await this.fail(job, asset, error);
      } finally {
        lease.active = false;
        clearInterval(heartbeat);
        if (this.activeLease === lease) this.activeLease = undefined;
        if (this.activeAbortController === abortController) {
          this.activeAbortController = undefined;
        }
      }
    } finally {
      if (this.activeJob === job) {
        this.activeJob = undefined;
        this.activeAsset = undefined;
      }
    }
  }

  private async complete(
    job: ClaimedJob,
    asset: Asset,
    result: Awaited<ReturnType<AssetProcessorService["process"]>>,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockJob(tx, job))) return false;

      const updated = await tx.asset.updateMany({
        where: { id: asset.id, status: AssetStatus.PROCESSING },
        data: {
          status: AssetStatus.READY,
          publicUrl: result.publicUrl,
          width: result.width,
          height: result.height,
          durationMillis: result.durationMillis,
          variants: result.variants,
          errorMessage: "",
        },
      });
      if (updated.count !== 1) {
        await tx.assetProcessingJob.deleteMany({
          where: { id: job.id, leaseToken: job.leaseToken },
        });
        return false;
      }

      if (result.videoEncryption) {
        await tx.assetVideoEncryptionKey.upsert({
          where: { assetId: asset.id },
          create: {
            assetId: asset.id,
            ciphertext: Uint8Array.from(result.videoEncryption.ciphertext),
            iv: Uint8Array.from(result.videoEncryption.iv),
            authTag: Uint8Array.from(result.videoEncryption.authTag),
          },
          update: {
            ciphertext: Uint8Array.from(result.videoEncryption.ciphertext),
            iv: Uint8Array.from(result.videoEncryption.iv),
            authTag: Uint8Array.from(result.videoEncryption.authTag),
          },
        });
      } else if (asset.purpose === "MUSIC_VIDEO") {
        await tx.assetVideoEncryptionKey.deleteMany({
          where: { assetId: asset.id },
        });
      }

      // A previous failed generation may have left a delayed cleanup intent.
      // READY is the terminal owner of these keys, so it must cancel that intent
      // in the same transaction as the state transition.
      await tx.assetArtifactCleanupJob.deleteMany({
        where: { assetId: asset.id },
      });

      const deleted = await tx.assetProcessingJob.deleteMany({
        where: { id: job.id, leaseToken: job.leaseToken },
      });
      if (deleted.count !== 1) {
        throw new Error("ASSET_PROCESSING_LEASE_DELETE_FAILED");
      }
      return true;
    });
  }

  private async fail(
    job: ClaimedJob,
    asset: Asset,
    error: unknown,
  ): Promise<void> {
    const message = this.errorMessage(error);
    this.logger.warn(
      `Asset ${asset.id} processing attempt ${job.attempts} failed: ${message}`,
    );

    if (job.attempts >= this.maxAttempts) {
      await this.deadLetter(job, asset, message);
      return;
    }

    const retryDelayMs = Math.min(
      15 * 60 * 1000,
      5000 * 2 ** Math.max(0, job.attempts - 1),
    );
    const retried = await this.prisma.assetProcessingJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        lockedAt: null,
        leaseToken: null,
        availableAt: new Date(Date.now() + retryDelayMs),
        lastError: message,
      },
    });
    if (retried.count !== 1) {
      this.logger.warn(`Asset job ${job.id} lost its lease before retry`);
      return;
    }
    this.increment("jobsFailed");
    this.increment("jobsRetried");
  }

  private async heartbeat(job: ClaimedJob, lease: LeaseState): Promise<void> {
    if (!lease.active || lease.lost) return;
    try {
      const heartbeat = await this.prisma.assetProcessingJob.updateMany({
        where: { id: job.id, leaseToken: job.leaseToken },
        data: { lockedAt: new Date() },
      });
      if (heartbeat.count !== 1 && lease.active) {
        this.loseLease(job, lease, "heartbeat");
      }
    } catch (error) {
      if (lease.active) {
        this.logger.warn(`Asset job ${job.id} heartbeat failed`, error);
        this.loseLease(job, lease, "heartbeat_error");
      }
    }
  }

  private async discard(job: ClaimedJob): Promise<boolean> {
    const deleted = await this.prisma.assetProcessingJob.deleteMany({
      where: { id: job.id, leaseToken: job.leaseToken },
    });
    return deleted.count === 1;
  }

  private async deadLetter(
    job: ClaimedJob,
    asset: Asset,
    message: string,
  ): Promise<boolean> {
    const availableAt = new Date(Date.now() + this.failedArtifactRetentionMs);
    const deadLettered = await this.prisma.$transaction(async (tx) => {
      if (!(await this.lockJob(tx, job))) return false;

      const failed = await tx.asset.updateMany({
        where: { id: asset.id, status: AssetStatus.PROCESSING },
        data: {
          status: AssetStatus.FAILED,
          errorMessage: message,
        },
      });
      if (failed.count !== 1) {
        await tx.assetProcessingJob.deleteMany({
          where: { id: job.id, leaseToken: job.leaseToken },
        });
        return false;
      }

      await tx.assetProcessingDeadLetter.upsert({
        where: { jobId: job.id },
        create: {
          jobId: job.id,
          assetId: asset.id,
          attempts: job.attempts,
          sourceObjectKey: asset.sourceObjectKey,
          errorMessage: message,
        },
        update: {
          attempts: job.attempts,
          errorMessage: message,
        },
      });
      await tx.assetArtifactCleanupJob.upsert({
        where: { assetId: asset.id },
        create: {
          assetId: asset.id,
          sourceObjectKey: asset.sourceObjectKey,
          availableAt,
        },
        update: {
          sourceObjectKey: asset.sourceObjectKey,
          availableAt,
          lockedAt: null,
          leaseToken: null,
          lastError: "",
        },
      });
      const deleted = await tx.assetProcessingJob.deleteMany({
        where: { id: job.id, leaseToken: job.leaseToken },
      });
      if (deleted.count !== 1) {
        throw new Error("ASSET_PROCESSING_LEASE_DELETE_FAILED");
      }
      return true;
    });
    if (!deadLettered) {
      this.logger.warn(`Asset job ${job.id} lost its lease before DLQ`);
      return false;
    }

    // Object-storage writes cannot be fenced by a database token. Do not delete
    // processed/{assetId} here: a timed-out worker may have been reclaimed and
    // could otherwise erase the replacement worker's output. Unreferenced
    // partial files are retained for a separately fenced retention sweep.
    this.increment("jobsFailed");
    this.increment("jobsDeadLettered");
    this.logger.error(
      `Asset ${asset.id} moved to processing DLQ after ${job.attempts} attempt(s): ${message}`,
    );
    return true;
  }

  private async lockJob(
    tx: Prisma.TransactionClient,
    job: ClaimedJob,
  ): Promise<boolean> {
    const jobs = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "asset_processing_jobs"
      WHERE "id" = ${job.id}
        AND "leaseToken" = ${job.leaseToken}
      FOR UPDATE
    `);
    return jobs.length === 1;
  }

  private loseLease(
    job: ClaimedJob,
    lease: LeaseState,
    operation: string,
  ): void {
    if (lease.lost) return;
    lease.lost = true;
    if (this.activeJob?.id === job.id) this.activeAbortController?.abort();
    this.increment("leasesLost");
    this.logger.warn(
      `Asset job ${job.id} lost its lease during ${operation}; refusing stale state changes`,
    );
  }

  private increment(name: MetricName): void {
    this.metrics[name] += 1;
  }

  private logMetrics(): void {
    this.logger.log(
      JSON.stringify({
        level: "info",
        event: "asset_processing_worker_metrics",
        jobs_started: this.metrics.jobsStarted,
        jobs_succeeded: this.metrics.jobsSucceeded,
        jobs_failed: this.metrics.jobsFailed,
        jobs_retried: this.metrics.jobsRetried,
        jobs_reclaimed: this.metrics.jobsReclaimed,
        jobs_dead_lettered: this.metrics.jobsDeadLettered,
        leases_lost: this.metrics.leasesLost,
      }),
    );
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 2000) || "ASSET_PROCESSING_FAILED";
  }

  private boolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    return value.trim().toLowerCase() === "true";
  }

  private integer(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
