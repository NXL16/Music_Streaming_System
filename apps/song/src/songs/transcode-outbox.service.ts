import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { Prisma, SongAudioMode } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TRANSCODE_QUEUE } from '@musical/shared-types';

type ClaimedJob = {
  id: string;
  songId: string;
  sourceObjectPath: string;
  checksum: string;
  audioMode: SongAudioMode;
  metadataVersion: bigint;
  attempts: number;
  lockToken: string;
};

type OutboxMetric = 'dead_lettered' | 'published' | 'retries';

@Injectable()
export class TranscodeOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranscodeOutboxService.name);
  private readonly queueName: string;
  private readonly pollIntervalMs: number;
  private readonly lockTtlMs: number;
  private readonly maxAttempts: number;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.queueName =
      config.get<string>('TRANSCODE_QUEUE')?.trim() || TRANSCODE_QUEUE;
    this.pollIntervalMs = this.positive(
      config.get<string>('TRANSCODE_OUTBOX_POLL_INTERVAL_MS'),
      1000,
    );
    this.lockTtlMs = this.positive(
      config.get<string>('TRANSCODE_OUTBOX_LOCK_TTL_MS'),
      60_000,
    );
    this.maxAttempts = this.positive(
      config.get<string>('TRANSCODE_OUTBOX_MAX_ATTEMPTS'),
      10,
    );
  }

  onModuleInit(): void {
    this.schedule(0);
  }
  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      const job = await this.claim();
      if (job) await this.publish(job);
      this.schedule(job ? 0 : this.pollIntervalMs);
    } catch (error) {
      this.logger.error('Transcode outbox publisher failed', error);
      this.schedule(this.pollIntervalMs);
    }
  }

  private async claim(): Promise<ClaimedJob | undefined> {
    const lockToken = randomUUID();
    const rows = await this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id" FROM "transcode_outbox"
        WHERE "availableAt" <= NOW() AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${this.lockTtlMs} * INTERVAL '1 millisecond'))
        ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE "transcode_outbox" AS job
      SET "lockedAt" = NOW(), "lockedBy" = ${lockToken}, "attempts" = job."attempts" + 1, "updatedAt" = NOW()
      FROM candidate WHERE job."id" = candidate."id"
      RETURNING job."id", job."songId", job."sourceObjectPath", job."checksum", job."audioMode", job."metadataVersion", job."attempts", job."lockedBy" AS "lockToken"
    `);
    return rows[0];
  }

  private async publish(job: ClaimedJob): Promise<void> {
    try {
      await this.redis.xadd(
        this.queueName,
        '*',
        'payload',
        JSON.stringify(this.workerPayload(job)),
      );
    } catch (error) {
      await this.handlePublishError(job, error);
      return;
    }

    // `XADD` and PostgreSQL cannot commit atomically. A failed delete may
    // publish this job again after the lease expires, but never loses it.
    // The worker receives `job_id` so it can safely deduplicate that case.
    const deleted = await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "transcode_outbox"
      WHERE "id" = ${job.id} AND "lockedBy" = ${job.lockToken}
    `);
    if (deleted !== 1) {
      this.logger.warn(
        `Transcode outbox ${job.id} was published but its lease is no longer owned by this publisher`,
      );
      return;
    }

    await this.recordMetric('published');
  }

  private async handlePublishError(
    job: ClaimedJob,
    error: unknown,
  ): Promise<void> {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, 2000);

    if (job.attempts >= this.maxAttempts) {
      await this.redis.xadd(
        `${this.queueName}:outbox:dlq`,
        '*',
        'payload',
        JSON.stringify(this.workerPayload(job)),
        'outbox_id',
        job.id,
        'song_id',
        job.songId,
        'error',
        message,
        'attempts',
        String(job.attempts),
      );
      const deleted = await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM "transcode_outbox"
        WHERE "id" = ${job.id} AND "lockedBy" = ${job.lockToken}
      `);
      if (deleted !== 1) {
        this.logger.warn(
          `Transcode outbox ${job.id} was DLQ'd but its lease is no longer owned by this publisher`,
        );
        return;
      }
      await this.recordMetric('dead_lettered');
      this.logger.error(
        `Transcode outbox ${job.id} moved to DLQ after ${job.attempts} attempts: ${message}`,
      );
      return;
    }

    const delayMs = Math.min(
      60 * 60 * 1000,
      1000 * 2 ** Math.min(job.attempts - 1, 10),
    );
    const released = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "transcode_outbox"
      SET
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "availableAt" = NOW() + (${delayMs} * INTERVAL '1 millisecond'),
        "lastError" = ${message},
        "updatedAt" = NOW()
      WHERE "id" = ${job.id} AND "lockedBy" = ${job.lockToken}
    `);
    if (released !== 1) {
      this.logger.warn(
        `Transcode outbox ${job.id} failed to publish after its lease was superseded`,
      );
      return;
    }

    await this.recordMetric('retries');
    this.logger.warn(
      `Transcode outbox ${job.id} retry ${job.attempts}/${this.maxAttempts} in ${delayMs}ms: ${message}`,
    );
  }

  private workerPayload(job: ClaimedJob) {
    const metadataVersion = Number(job.metadataVersion);
    if (
      !Number.isSafeInteger(metadataVersion) ||
      metadataVersion <= 0 ||
      BigInt(metadataVersion) !== job.metadataVersion
    ) {
      throw new Error(
        `Transcode outbox ${job.id} has an invalid metadata version`,
      );
    }

    return {
      job_id: job.id,
      song_id: job.songId,
      r2_path: job.sourceObjectPath,
      checksum: job.checksum,
      audio_mode: job.audioMode === SongAudioMode.SING ? 'SING' : 'STANDARD',
      metadata_version: metadataVersion,
    };
  }

  private async recordMetric(name: OutboxMetric): Promise<void> {
    await this.redis
      .incr(`metrics:queue:transcode_outbox:${name}`)
      .catch(() => undefined);
  }

  private positive(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
