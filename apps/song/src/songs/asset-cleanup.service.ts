import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { SONG_ASSET_CLEANUP_QUEUE } from '@musical/shared-types';
import {
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaService } from '../database/prisma.service';

type AssetCleanupJob = {
  song_id: string;
  source_object_path?: string;
  encrypted_file_path?: string;
  retry_count?: number;
};

type AssetCleanupOutboxRow = {
  id: string;
  songId: string;
  sourceObjectPath: string;
  encryptedFilePath: string;
  attempts: number;
  createdAt: Date;
};

type AssetCleanupOutboxRepo = {
  findMany(args: {
    orderBy: { createdAt: 'asc' };
    take: number;
  }): Promise<AssetCleanupOutboxRow[]>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  update(args: {
    where: { id: string };
    data: { attempts: number; lastError: string };
  }): Promise<unknown>;
};

@Injectable()
export class AssetCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AssetCleanupService.name);
  private readonly bucket: string;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly r2: S3Client;
  private readonly blockingRedis: Redis;
  private running = false;

  constructor(
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.blockingRedis = this.redis.duplicate();
    this.bucket = this.configService.getOrThrow<string>('R2_BUCKET');
    this.maxRetries = this.readNumber('SONG_ASSET_CLEANUP_MAX_RETRIES', 5, 1);
    this.baseBackoffMs = this.readNumber(
      'SONG_ASSET_CLEANUP_BACKOFF_MS',
      250,
      50,
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
    void this.consumeLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;

    await this.blockingRedis.quit().catch(() => {
      this.blockingRedis.disconnect(false);
    });
  }

  private async consumeLoop(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.blockingRedis.blpop(
          SONG_ASSET_CLEANUP_QUEUE,
          5,
        );
        if (result) {
          const [, message] = result;
          const job = JSON.parse(message) as AssetCleanupJob;
          await this.processJob(job);
          continue;
        }

        await this.processOutboxBatch();
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
    try {
      await this.deleteIfPresent(job.source_object_path);
      await this.deleteIfPresent(job.encrypted_file_path);
      this.logger.log(
        `Asset cleanup completed for song ${job.song_id} bucket=${this.bucket} source=${job.source_object_path || '<empty>'} encrypted=${job.encrypted_file_path || '<empty>'}`,
      );
    } catch (error) {
      const retryCount = job.retry_count ?? 0;
      if (retryCount >= this.maxRetries) {
        this.logger.error(
          `Asset cleanup failed permanently for song ${job.song_id} after ${this.maxRetries} retries`,
          error instanceof Error ? error.stack : String(error),
        );
        return;
      }

      const next = { ...job, retry_count: retryCount + 1 };
      await this.redis.lpush(SONG_ASSET_CLEANUP_QUEUE, JSON.stringify(next));
      const delay = Math.min(
        this.baseBackoffMs * 2 ** retryCount,
        30_000,
      );
      this.logger.warn(
        `Asset cleanup failed for song ${job.song_id}, retry ${retryCount + 1}/${this.maxRetries} after ${delay}ms`,
      );
      await this.sleep(delay);
    }
  }

  private async processOutboxBatch(): Promise<void> {
    const rows = await this.outboxRepo().findMany({
      orderBy: { createdAt: 'asc' },
      take: 25,
    });
    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        await this.deleteIfPresent(row.sourceObjectPath);
        await this.deleteIfPresent(row.encryptedFilePath);
        await this.outboxRepo().delete({
          where: { id: row.id },
        });
        this.logger.log(
          `Asset cleanup outbox completed for song ${row.songId} bucket=${this.bucket} source=${row.sourceObjectPath || '<empty>'} encrypted=${row.encryptedFilePath || '<empty>'}`,
        );
      } catch (error) {
        const nextAttempts = row.attempts + 1;
        const message =
          error instanceof Error ? error.message : String(error);
        await this.outboxRepo().update({
          where: { id: row.id },
          data: { attempts: nextAttempts, lastError: message },
        });
      }
    }
  }

  private outboxRepo(): AssetCleanupOutboxRepo {
    return (
      this.prisma as unknown as { assetCleanupOutbox: AssetCleanupOutboxRepo }
    ).assetCleanupOutbox;
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

  private readNumber(key: string, fallback: number, min: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
