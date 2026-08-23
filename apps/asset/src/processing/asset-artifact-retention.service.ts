import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AssetStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RETRY_MAX_BACKOFF_MS = 60 * 60 * 1000;
const DEFAULT_METRICS_INTERVAL_MS = 60 * 1000;

type ClaimedCleanupJob = {
  id: string;
  assetId: string;
  sourceObjectKey: string;
  attempts: number;
  leaseToken: string;
  reclaimed: boolean;
};

type CleanupLease = {
  active: boolean;
  lost: boolean;
};

type CleanupMetric = 'succeeded' | 'retried' | 'reclaimed' | 'leasesLost';

/**
 * Deletes terminal Asset artifacts only after a durable job has fenced the
 * Asset row to DELETED. R2 has no transactional lease primitive, so the state
 * fence prevents a new processing generation from beginning while cleanup is
 * deleting its prefix; a retryable cleanup job keeps failed deletes durable.
 */
@Injectable()
export class AssetArtifactRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AssetArtifactRetentionService.name);
  private readonly enabled: boolean;
  private readonly pollIntervalMs: number;
  private readonly lockTtlMs: number;
  private readonly retryMaxBackoffMs: number;
  private readonly metricsIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private activeJob?: ClaimedCleanupJob;
  private activeLease?: CleanupLease;
  private stopped = false;
  private readonly metrics: Record<CleanupMetric, number> = {
    succeeded: 0,
    retried: 0,
    reclaimed: 0,
    leasesLost: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.enabled = this.boolean(
      config.get<string>('ASSET_ARTIFACT_CLEANUP_ENABLED'),
      true,
    );
    this.pollIntervalMs = this.integer(
      config.get<string>('ASSET_ARTIFACT_CLEANUP_POLL_INTERVAL_MS'),
      DEFAULT_POLL_INTERVAL_MS,
    );
    this.lockTtlMs = this.integer(
      config.get<string>('ASSET_ARTIFACT_CLEANUP_LOCK_TTL_MS'),
      DEFAULT_LOCK_TTL_MS,
    );
    this.retryMaxBackoffMs = this.integer(
      config.get<string>('ASSET_ARTIFACT_CLEANUP_RETRY_MAX_BACKOFF_MS'),
      DEFAULT_RETRY_MAX_BACKOFF_MS,
    );
    this.metricsIntervalMs = this.integer(
      config.get<string>('ASSET_ARTIFACT_CLEANUP_METRICS_INTERVAL_MS'),
      DEFAULT_METRICS_INTERVAL_MS,
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Asset artifact retention sweep is disabled');
      return;
    }
    this.logger.log('Asset artifact retention sweep started');
    this.metricsTimer = setInterval(
      () => this.logMetrics(),
      this.metricsIntervalMs,
    );
    this.metricsTimer.unref();
    this.schedule(0);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.activeLease) {
      // R2 deletion is intentionally not released early. A replacement sweep
      // can reclaim the durable job after the normal TTL if this process exits
      // while an object-store call is still in flight.
      this.activeLease.active = false;
      this.activeLease.lost = true;
    }
    if (this.activeJob) {
      this.logger.warn(
        `Leaving retained-artifact job ${this.activeJob.id} leased until expiry during shutdown`,
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
      if (job.reclaimed) this.increment('reclaimed');
      await this.process(job);
      this.schedule(0);
    } catch (error) {
      this.logger.error('Asset artifact retention sweep failed', error);
      this.schedule(this.pollIntervalMs);
    }
  }

  private async claim(): Promise<ClaimedCleanupJob | undefined> {
    const leaseToken = randomUUID();
    const rows = await this.prisma.$queryRaw<ClaimedCleanupJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id", "lockedAt"
        FROM "asset_artifact_cleanup_jobs"
        WHERE "availableAt" <= clock_timestamp()
          AND (
            "lockedAt" IS NULL
            OR "lockedAt" < clock_timestamp() - (${this.lockTtlMs} * INTERVAL '1 millisecond')
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "asset_artifact_cleanup_jobs" AS job
      SET
        "lockedAt" = clock_timestamp(),
        "leaseToken" = ${leaseToken},
        "attempts" = job."attempts" + 1,
        "updatedAt" = clock_timestamp()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING
        job."id",
        job."assetId",
        job."sourceObjectKey",
        job."attempts",
        job."leaseToken",
        candidate."lockedAt" IS NOT NULL AS "reclaimed"
    `);
    return rows[0];
  }

  private async process(job: ClaimedCleanupJob): Promise<void> {
    const lease: CleanupLease = { active: true, lost: false };
    this.activeJob = job;
    this.activeLease = lease;
    const heartbeat = setInterval(
      () => void this.heartbeat(job, lease),
      Math.max(1000, Math.floor(this.lockTtlMs / 3)),
    );
    heartbeat.unref();

    try {
      const shouldDelete = await this.fenceAssetForDeletion(job);
      if (!shouldDelete || lease.lost) return;

      await this.storage.deleteMany([job.sourceObjectKey]);
      if (lease.lost) return;
      await this.storage.deletePrefix(`processed/${job.assetId}/`);
      if (lease.lost) return;

      if (await this.complete(job)) {
        this.increment('succeeded');
        this.logger.log(
          `Deleted retained artifacts for asset ${job.assetId} after ${job.attempts} attempt(s)`,
        );
      } else {
        this.loseLease(job, lease, 'completion');
      }
    } catch (error) {
      if (!lease.lost) {
        await this.retry(job, error);
      }
    } finally {
      lease.active = false;
      clearInterval(heartbeat);
      if (this.activeLease === lease) this.activeLease = undefined;
      if (this.activeJob === job) this.activeJob = undefined;
    }
  }

  private async fenceAssetForDeletion(
    job: ClaimedCleanupJob,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // The asset row is always locked before its cleanup intent. Upload,
      // reprocess, and delete paths use the same order; this prevents a
      // retention sweep from deadlocking with a retry that cancels the job.
      const asset = await this.lockAsset(tx, job.assetId);
      if (!asset) return false;
      if (!(await this.lockJob(tx, job))) return false;

      if (asset.status === AssetStatus.FAILED) {
        const fenced = await tx.asset.updateMany({
          where: { id: job.assetId, status: AssetStatus.FAILED },
          data: {
            status: AssetStatus.DELETED,
            publicUrl: '',
            variants: Prisma.DbNull,
          },
        });
        return fenced.count === 1;
      }

      if (asset.status === AssetStatus.DELETED) return true;

      // A user retried the upload before the retention deadline. Its cleanup
      // intent must not delete the new generation's source or processed keys.
      await this.discard(tx, job);
      return false;
    });
  }

  private async heartbeat(
    job: ClaimedCleanupJob,
    lease: CleanupLease,
  ): Promise<void> {
    if (!lease.active || lease.lost) return;
    try {
      const updated = await this.prisma.assetArtifactCleanupJob.updateMany({
        where: { id: job.id, leaseToken: job.leaseToken },
        data: { lockedAt: new Date() },
      });
      if (updated.count !== 1 && lease.active) {
        this.loseLease(job, lease, 'heartbeat');
      }
    } catch (error) {
      if (lease.active) {
        this.logger.warn(`Asset cleanup job ${job.id} heartbeat failed`, error);
        this.loseLease(job, lease, 'heartbeat_error');
      }
    }
  }

  private async complete(job: ClaimedCleanupJob): Promise<boolean> {
    const deleted = await this.prisma.assetArtifactCleanupJob.deleteMany({
      where: { id: job.id, leaseToken: job.leaseToken },
    });
    return deleted.count === 1;
  }

  private async retry(job: ClaimedCleanupJob, error: unknown): Promise<void> {
    const message = this.errorMessage(error);
    const delayMs = Math.min(
      this.retryMaxBackoffMs,
      5000 * 2 ** Math.min(10, Math.max(0, job.attempts - 1)),
    );
    const updated = await this.prisma.assetArtifactCleanupJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        lockedAt: null,
        leaseToken: null,
        availableAt: new Date(Date.now() + delayMs),
        lastError: message,
      },
    });
    if (updated.count !== 1) {
      this.logger.warn(`Asset cleanup job ${job.id} lost its lease before retry`);
      return;
    }
    this.increment('retried');
    this.logger.warn(
      `Asset cleanup job ${job.id} retry ${job.attempts} in ${delayMs}ms: ${message}`,
    );
  }

  private async lockJob(
    tx: Prisma.TransactionClient,
    job: ClaimedCleanupJob,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "asset_artifact_cleanup_jobs"
      WHERE "id" = ${job.id}
        AND "leaseToken" = ${job.leaseToken}
      FOR UPDATE
    `);
    return rows.length === 1;
  }

  private async lockAsset(
    tx: Prisma.TransactionClient,
    assetId: string,
  ): Promise<{ status: AssetStatus } | undefined> {
    const rows = await tx.$queryRaw<Array<{ status: AssetStatus }>>(Prisma.sql`
      SELECT "status"
      FROM "assets"
      WHERE "id" = ${assetId}
      FOR UPDATE
    `);
    return rows[0];
  }

  private async discard(
    tx: Prisma.TransactionClient,
    job: ClaimedCleanupJob,
  ): Promise<void> {
    await tx.assetArtifactCleanupJob.deleteMany({
      where: { id: job.id, leaseToken: job.leaseToken },
    });
  }

  private loseLease(
    job: ClaimedCleanupJob,
    lease: CleanupLease,
    operation: string,
  ): void {
    if (lease.lost) return;
    lease.lost = true;
    this.increment('leasesLost');
    this.logger.warn(
      `Asset cleanup job ${job.id} lost its lease during ${operation}; leaving deletion for recovery`,
    );
  }

  private increment(metric: CleanupMetric): void {
    this.metrics[metric] += 1;
  }

  private logMetrics(): void {
    this.logger.log(
      JSON.stringify({
        level: 'info',
        event: 'asset_artifact_retention_metrics',
        jobs_succeeded: this.metrics.succeeded,
        jobs_retried: this.metrics.retried,
        jobs_reclaimed: this.metrics.reclaimed,
        leases_lost: this.metrics.leasesLost,
      }),
    );
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 2000) || 'ASSET_ARTIFACT_CLEANUP_FAILED';
  }

  private boolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    return value.trim().toLowerCase() === 'true';
  }

  private integer(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
