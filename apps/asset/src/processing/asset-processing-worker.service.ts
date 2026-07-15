import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Asset,
  AssetStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AssetProcessorService } from './asset-processor.service';

interface ClaimedJob {
  id: string;
  assetId: string;
  attempts: number;
}

@Injectable()
export class AssetProcessingWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AssetProcessingWorkerService.name);
  private readonly enabled: boolean;
  private readonly pollIntervalMs: number;
  private readonly lockTtlMs: number;
  private readonly maxAttempts: number;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: AssetProcessorService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.enabled = this.boolean(config.get<string>('ASSET_WORKER_ENABLED'), true);
    this.pollIntervalMs = this.integer(
      config.get<string>('ASSET_WORKER_POLL_INTERVAL_MS'),
      2000,
    );
    this.lockTtlMs = this.integer(
      config.get<string>('ASSET_WORKER_LOCK_TTL_MS'),
      30 * 60 * 1000,
    );
    this.maxAttempts = this.integer(
      config.get<string>('ASSET_WORKER_MAX_ATTEMPTS'),
      5,
    );
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Asset processing worker is disabled');
      return;
    }
    this.logger.log('Asset processing worker started');
    this.schedule(0);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.processor.abort();
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
      await this.process(job);
      this.schedule(0);
    } catch (error) {
      this.logger.error('Asset worker tick failed', error);
      this.schedule(this.pollIntervalMs);
    }
  }

  private async claim(): Promise<ClaimedJob | undefined> {
    const jobs = await this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id"
        FROM "asset_processing_jobs"
        WHERE "availableAt" <= NOW()
          AND (
            "lockedAt" IS NULL
            OR "lockedAt" < NOW() - (${this.lockTtlMs} * INTERVAL '1 millisecond')
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "asset_processing_jobs" AS job
      SET
        "lockedAt" = NOW(),
        "attempts" = job."attempts" + 1,
        "updatedAt" = NOW()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job."id", job."assetId", job."attempts"
    `);
    return jobs[0];
  }

  private async process(job: ClaimedJob): Promise<void> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: job.assetId },
    });
    if (!asset || asset.status !== AssetStatus.PROCESSING) {
      await this.prisma.assetProcessingJob.deleteMany({
        where: { id: job.id },
      });
      return;
    }

    const heartbeat = setInterval(
      () => void this.heartbeat(job.id),
      Math.max(5000, Math.floor(this.lockTtlMs / 3)),
    );
    heartbeat.unref();

    try {
      const result = await this.processor.process(asset);
      await this.complete(job, asset, result);
      this.logger.log(`Asset ${asset.id} is ready`);
    } catch (error) {
      await this.fail(job, asset, error);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async complete(
    job: ClaimedJob,
    asset: Asset,
    result: Awaited<ReturnType<AssetProcessorService['process']>>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.updateMany({
        where: { id: asset.id, status: AssetStatus.PROCESSING },
        data: {
          status: AssetStatus.READY,
          publicUrl: result.publicUrl,
          width: result.width,
          height: result.height,
          durationMillis: result.durationMillis,
          variants: result.variants,
          errorMessage: '',
        },
      });
      await tx.assetProcessingJob.deleteMany({ where: { id: job.id } });
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
      await this.storage.deletePrefix(`processed/${asset.id}/`);
      await this.prisma.$transaction([
        this.prisma.asset.updateMany({
          where: { id: asset.id, status: AssetStatus.PROCESSING },
          data: {
            status: AssetStatus.FAILED,
            errorMessage: message,
          },
        }),
        this.prisma.assetProcessingJob.deleteMany({
          where: { id: job.id },
        }),
      ]);
      return;
    }

    const retryDelayMs = Math.min(
      15 * 60 * 1000,
      5000 * 2 ** Math.max(0, job.attempts - 1),
    );
    await this.prisma.assetProcessingJob.updateMany({
      where: { id: job.id },
      data: {
        lockedAt: null,
        availableAt: new Date(Date.now() + retryDelayMs),
        lastError: message,
      },
    });
  }

  private async heartbeat(jobId: string): Promise<void> {
    try {
      await this.prisma.assetProcessingJob.updateMany({
        where: { id: jobId },
        data: { lockedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`Asset job ${jobId} heartbeat failed`, error);
    }
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 2000) || 'ASSET_PROCESSING_FAILED';
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
