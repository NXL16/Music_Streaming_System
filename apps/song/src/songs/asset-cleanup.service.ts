import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  SONG_ASSET_CLEANUP_DLQ,
  SONG_ASSET_CLEANUP_STREAM,
} from '@musical/shared-types';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  type RedisAutoClaimResponse,
  type RedisStreamEntry,
  type RedisStreamReadResponse,
  streamField,
} from '../common/redis/stream-entry';

type AssetCleanupJob = {
  song_id: string;
  source_object_path?: string;
  encrypted_file_path?: string;
};

type AssetCleanupMetric =
  | 'dead_lettered'
  | 'outbox_dead_lettered'
  | 'outbox_published'
  | 'outbox_retries'
  | 'reclaimed'
  | 'retries'
  | 'succeeded';

type AssetCleanupOutboxRow = {
  id: string;
  songId: string;
  sourceObjectPath: string;
  encryptedFilePath: string;
  attempts: number;
  createdAt: Date;
};

type ClaimedAssetCleanupOutboxRow = AssetCleanupOutboxRow & {
  lockToken: string;
};

@Injectable()
export class AssetCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AssetCleanupService.name);
  private readonly bucket: string;
  private readonly baseBackoffMs: number;
  private readonly r2: S3Client;
  private readonly blockingRedis: Redis;
  private readonly group = 'song-asset-cleanup-consumers';
  private readonly consumer = `song-cleanup-${hostname()}-${process.pid}-${randomUUID()}`;
  private readonly claimIdleMs: number;
  private readonly maxDeliveries: number;
  private readonly outboxMaxAttempts: number;
  private readonly outboxLockTtlMs: number;
  private running = false;
  private retryPending = false;
  private reclaimCursor = '0-0';
  private nextReclaimAt = 0;

  constructor(
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.blockingRedis = this.redis.duplicate();
    this.bucket = this.configService.getOrThrow<string>('R2_BUCKET');
    this.baseBackoffMs = this.readNumber(
      'SONG_ASSET_CLEANUP_BACKOFF_MS',
      250,
      50,
    );
    this.claimIdleMs = this.readNumber(
      'SONG_ASSET_CLEANUP_STREAM_CLAIM_IDLE_MS',
      60_000,
      1_000,
    );
    this.maxDeliveries = this.readNumber(
      'SONG_ASSET_CLEANUP_STREAM_MAX_DELIVERIES',
      5,
      1,
    );
    this.outboxMaxAttempts = this.readNumber(
      'SONG_ASSET_CLEANUP_OUTBOX_MAX_ATTEMPTS',
      10,
      1,
    );
    this.outboxLockTtlMs = this.readNumber(
      'SONG_ASSET_CLEANUP_OUTBOX_LOCK_TTL_MS',
      60_000,
      1_000,
    );

    this.r2 = new S3Client({
      region: 'auto',
      endpoint: this.configService.getOrThrow<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('R2_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('R2_SECRET_KEY'),
      },
      forcePathStyle: true,
    });
  }

  onApplicationBootstrap() {
    this.running = true;
    void this.start();
    void this.runOutboxLoop();
  }

  private async start(): Promise<void> {
    while (this.running) {
      try {
        await this.redis.xgroup(
          'CREATE',
          SONG_ASSET_CLEANUP_STREAM,
          this.group,
          '0',
          'MKSTREAM',
        );
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) {
          if (!this.running) return;
          this.logger.error(
            'Unable to initialize asset cleanup stream consumer; retrying',
            error instanceof Error ? error.stack : String(error),
          );
          await this.sleep(1000);
          continue;
        }
      }

      await this.consumeLoop();
      return;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;

    await this.blockingRedis.quit().catch(() => {
      this.blockingRedis.disconnect(false);
    });

    // Release the R2/S3 client's sockets and keep-alive agents on shutdown.
    try {
      this.r2.destroy();
    } catch {
      // Best-effort: ignore teardown errors.
    }
  }

  private async consumeLoop(): Promise<void> {
    while (this.running) {
      try {
        const reclaimed = await this.claimStaleEntry();
        const result = reclaimed
          ? null
          : ((await this.blockingRedis.xreadgroup(
              'GROUP',
              this.group,
              this.consumer,
              'COUNT',
              1,
              'BLOCK',
              5000,
              'STREAMS',
              SONG_ASSET_CLEANUP_STREAM,
              this.retryPending ? '0' : '>',
            )) as RedisStreamReadResponse | null);
        const entry = reclaimed ?? result?.[0]?.[1]?.[0];
        const messageId = entry?.[0];
        if (!messageId) continue;

        const message = streamField(entry, 'payload');
        if (!message) {
          await this.moveToDlq(
            messageId,
            '',
            'Asset cleanup entry missing payload',
            0,
          );
          this.retryPending = false;
          await this.recordMetric('dead_lettered');
          continue;
        }

        let job: AssetCleanupJob;
        try {
          job = JSON.parse(message) as AssetCleanupJob;
        } catch (error) {
          await this.moveToDlq(
            messageId,
            message,
            `Invalid asset cleanup payload: ${this.errorMessage(error)}`,
            0,
          );
          this.retryPending = false;
          await this.recordMetric('dead_lettered');
          continue;
        }
        if (!isAssetCleanupJob(job)) {
          await this.moveToDlq(
            messageId,
            message,
            'Asset cleanup payload has invalid song_id or object paths',
            0,
          );
          this.retryPending = false;
          await this.recordMetric('dead_lettered');
          continue;
        }

        try {
          await this.processJob(job);
          await this.redis.xack(
            SONG_ASSET_CLEANUP_STREAM,
            this.group,
            messageId,
          );
          this.retryPending = false;
          await this.recordMetric('succeeded');
        } catch (error) {
          const deliveries = await this.pendingDeliveries(messageId);
          if (deliveries >= this.maxDeliveries) {
            await this.moveToDlq(
              messageId,
              message,
              this.errorMessage(error),
              deliveries,
            );
            this.retryPending = false;
            await this.recordMetric('dead_lettered');
            this.logger.error(
              `Asset cleanup moved to DLQ for song ${job.song_id} after ${deliveries} deliveries`,
            );
          } else {
            const delay = Math.min(
              this.baseBackoffMs * 2 ** Math.max(0, deliveries - 1),
              30_000,
            );
            this.retryPending = true;
            await this.recordMetric('retries');
            this.logger.warn(
              `Asset cleanup retry for song ${job.song_id}: delivery ${deliveries}/${this.maxDeliveries} after ${delay}ms`,
            );
            await this.sleep(delay);
          }
        }
      } catch (error) {
        if (!this.running) break;
        this.logger.error(
          'Failed to consume asset cleanup job',
          error instanceof Error ? error.stack : String(error),
        );
        await this.sleep(1000);
      }
    }
  }

  private async processJob(job: AssetCleanupJob): Promise<void> {
    await this.deleteIfPresent(job.source_object_path);
    await this.deleteIfPresent(job.encrypted_file_path);
    this.logger.log(
      `Asset cleanup completed for song ${job.song_id} bucket=${this.bucket} source=${job.source_object_path || '<empty>'} encrypted=${job.encrypted_file_path || '<empty>'}`,
    );
  }

  private async claimStaleEntry(): Promise<RedisStreamEntry | undefined> {
    if (Date.now() < this.nextReclaimAt) return undefined;
    this.nextReclaimAt = Date.now() + 30_000;
    const claimed = (await this.redis.call(
      'XAUTOCLAIM',
      SONG_ASSET_CLEANUP_STREAM,
      this.group,
      this.consumer,
      this.claimIdleMs,
      this.reclaimCursor,
      'COUNT',
      1,
    )) as RedisAutoClaimResponse;
    this.reclaimCursor = claimed?.[0] || '0-0';
    const entry = claimed?.[1]?.[0];
    if (!entry) return undefined;
    await this.recordMetric('reclaimed');
    this.logger.warn(`Reclaimed stale asset cleanup entry ${entry[0]}`);
    return entry;
  }

  private async pendingDeliveries(id: string): Promise<number> {
    const rows = (await this.redis.call(
      'XPENDING',
      SONG_ASSET_CLEANUP_STREAM,
      this.group,
      id,
      id,
      1,
    )) as [string, string, number, number][];
    return Number(rows[0]?.[3] ?? 0);
  }

  private async moveToDlq(
    id: string,
    payload: string,
    error: string,
    deliveries: number,
  ): Promise<void> {
    const result = await this.redis
      .multi()
      .xadd(
        SONG_ASSET_CLEANUP_DLQ,
        '*',
        'payload',
        payload,
        'source_stream',
        SONG_ASSET_CLEANUP_STREAM,
        'source_id',
        id,
        'deliveries',
        String(deliveries),
        'error',
        error.slice(0, 2000),
      )
      .xack(SONG_ASSET_CLEANUP_STREAM, this.group, id)
      .exec();
    const failure = result?.find(([commandError]) => commandError)?.[0];
    if (failure) throw failure;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.stack || error.message
      : String(error);
  }

  private async processOutboxBatch(): Promise<void> {
    for (let index = 0; index < 25; index += 1) {
      const row = await this.claimOutboxRow();
      if (!row) return;
      await this.publishOutboxRow(row);
    }
  }

  private async claimOutboxRow(): Promise<
    ClaimedAssetCleanupOutboxRow | undefined
  > {
    const lockToken = randomUUID();
    const rows = await this.prisma.$queryRaw<ClaimedAssetCleanupOutboxRow[]>(
      Prisma.sql`
        WITH candidate AS (
          SELECT "id" FROM "asset_cleanup_outbox"
          WHERE
            "availableAt" <= NOW()
            AND (
              "lockedAt" IS NULL
              OR "lockedAt" < NOW() - (${this.outboxLockTtlMs} * INTERVAL '1 millisecond')
            )
          ORDER BY "availableAt", "createdAt"
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "asset_cleanup_outbox" AS job
        SET
          "lockedAt" = NOW(),
          "lockedBy" = ${lockToken},
          "attempts" = job."attempts" + 1,
          "updatedAt" = NOW()
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING
          job."id",
          job."songId",
          job."sourceObjectPath",
          job."encryptedFilePath",
          job."attempts",
          job."createdAt",
          job."lockedBy" AS "lockToken"
      `,
    );
    return rows[0];
  }

  private async publishOutboxRow(
    row: ClaimedAssetCleanupOutboxRow,
  ): Promise<void> {
    const payload = JSON.stringify({
      song_id: row.songId,
      source_object_path: row.sourceObjectPath,
      encrypted_file_path: row.encryptedFilePath,
    });

    try {
      await this.redis.xadd(SONG_ASSET_CLEANUP_STREAM, '*', 'payload', payload);
    } catch (error) {
      await this.handleOutboxPublishError(row, payload, error);
      return;
    }

    const deleted = await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "asset_cleanup_outbox"
      WHERE "id" = ${row.id} AND "lockedBy" = ${row.lockToken}
    `);
    if (deleted !== 1) {
      this.logger.warn(
        `Asset cleanup outbox ${row.id} was published but its lease is no longer owned by this publisher`,
      );
      return;
    }

    await this.recordMetric('outbox_published');
    this.logger.log(
      `Asset cleanup outbox completed for song ${row.songId} bucket=${this.bucket} source=${row.sourceObjectPath || '<empty>'} encrypted=${row.encryptedFilePath || '<empty>'}`,
    );
  }

  private async handleOutboxPublishError(
    row: ClaimedAssetCleanupOutboxRow,
    payload: string,
    error: unknown,
  ): Promise<void> {
    const message = this.errorMessage(error).slice(0, 1000);
    if (row.attempts >= this.outboxMaxAttempts) {
      await this.redis.xadd(
        SONG_ASSET_CLEANUP_DLQ,
        '*',
        'payload',
        payload,
        'source',
        'asset_cleanup_outbox',
        'outbox_id',
        row.id,
        'attempts',
        String(row.attempts),
        'error',
        message,
      );
      const deleted = await this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM "asset_cleanup_outbox"
        WHERE "id" = ${row.id} AND "lockedBy" = ${row.lockToken}
      `);
      if (deleted !== 1) {
        this.logger.warn(
          `Asset cleanup outbox ${row.id} was DLQ'd but its lease is no longer owned by this publisher`,
        );
        return;
      }
      await this.recordMetric('outbox_dead_lettered');
      this.logger.error(
        `Asset cleanup outbox ${row.id} moved to DLQ after ${row.attempts} attempts: ${message}`,
      );
      return;
    }

    const delayMs = Math.min(
      60 * 60 * 1000,
      this.baseBackoffMs * 2 ** Math.min(row.attempts - 1, 10),
    );
    const released = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "asset_cleanup_outbox"
      SET
        "availableAt" = NOW() + (${delayMs} * INTERVAL '1 millisecond'),
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "lastError" = ${message},
        "updatedAt" = NOW()
      WHERE "id" = ${row.id} AND "lockedBy" = ${row.lockToken}
    `);
    if (released !== 1) {
      this.logger.warn(
        `Asset cleanup outbox ${row.id} failed to publish after its lease was superseded`,
      );
      return;
    }

    await this.recordMetric('outbox_retries');
    this.logger.warn(
      `Asset cleanup outbox ${row.id} retry ${row.attempts}/${this.outboxMaxAttempts} in ${delayMs}ms: ${message}`,
    );
  }

  private async runOutboxLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.processOutboxBatch();
      } catch (error) {
        this.logger.error(
          'Asset cleanup outbox publisher failed',
          this.errorMessage(error),
        );
      }
      await this.sleep(1000);
    }
  }

  private async deleteIfPresent(objectKey?: string) {
    const key = objectKey?.trim();
    if (!key) return;
    this.logger.log(`Deleting R2 object bucket=${this.bucket} key=${key}`);
    await this.r2.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async recordMetric(name: AssetCleanupMetric): Promise<void> {
    await this.redis
      .incr(`metrics:queue:song_asset_cleanup:${name}`)
      .catch(() => undefined);
  }

  private readNumber(key: string, fallback: number, min: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}

function isAssetCleanupJob(value: AssetCleanupJob): boolean {
  return (
    typeof value.song_id === 'string' &&
    value.song_id.trim().length > 0 &&
    (value.source_object_path === undefined ||
      typeof value.source_object_path === 'string') &&
    (value.encrypted_file_path === undefined ||
      typeof value.encrypted_file_path === 'string')
  );
}
