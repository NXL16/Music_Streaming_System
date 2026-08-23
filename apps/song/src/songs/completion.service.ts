import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { SongsService } from './songs.service';
import {
  type RedisAutoClaimResponse,
  type RedisStreamEntry,
  type RedisStreamReadResponse,
  streamField,
} from '../common/redis/stream-entry';
import {
  SONG_COMPLETION_QUEUE,
  SONG_COMPLETION_DLQ,
  songCompletionLockKey,
  songCompletionProcessedKey,
} from '@musical/shared-types';

type WorkerSongCompletionEvent = {
  song_id: string;
  metadata_version?: number | null;
  status: 'success' | 'error';
  duration_sec?: number | null;
  encrypted_file_path?: string | null;
  bitrate_kbps?: number | null;
  codec?: string | null;
  format?: string | null;
  error_message?: string | null;
  mood_tags?: string[] | null;
  mood_analysis_version?: string | null;
  mood_analysis_scores?: Record<string, number> | null;
};

type CompletionLockLease = {
  active: boolean;
  lost: boolean;
};

@Injectable()
export class CompletionService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CompletionService.name);
  private readonly blockingRedis: Redis;
  private readonly group = 'song-completion-consumers';
  private readonly consumer = `song-${hostname()}-${process.pid}-${randomUUID()}`;
  private readonly claimIdleMs: number;
  private readonly maxDeliveries: number;
  private readonly lockTtlMs: number;
  private running = false;
  private retryPending = false;
  private reclaimCursor = '0-0';
  private nextReclaimAt = 0;

  constructor(
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    private readonly songsService: SongsService,
    config: ConfigService,
  ) {
    this.blockingRedis = this.redis.duplicate();
    this.claimIdleMs = this.positive(
      config.get<string>('SONG_COMPLETION_STREAM_CLAIM_IDLE_MS'),
      60_000,
    );
    this.maxDeliveries = this.positive(
      config.get<string>('SONG_COMPLETION_STREAM_MAX_DELIVERIES'),
      5,
    );
    this.lockTtlMs = this.positive(
      config.get<string>('SONG_COMPLETION_LOCK_TTL_MS'),
      60_000,
    );
  }

  onApplicationBootstrap() {
    this.running = true;
    void this.start();
  }

  private async start(): Promise<void> {
    while (this.running) {
      try {
        await this.redis.xgroup(
          'CREATE',
          SONG_COMPLETION_QUEUE,
          this.group,
          '0',
          'MKSTREAM',
        );
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) {
          if (!this.running) return;
          this.logger.error(
            'Unable to initialize completion stream consumer; retrying',
            error instanceof Error ? error.stack : String(error),
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
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
              SONG_COMPLETION_QUEUE,
              this.retryPending ? '0' : '>',
            )) as RedisStreamReadResponse | null);

        if (!result && !reclaimed) {
          continue;
        }

        const entry = reclaimed ?? result?.[0]?.[1]?.[0];
        const messageId = entry?.[0];
        const payload = streamField(entry, 'payload');
        if (!messageId) continue;
        if (!payload) {
          await this.moveToDlq(
            messageId,
            '',
            'Completion entry missing payload',
            0,
          );
          this.retryPending = false;
          await this.recordMetric('dead_lettered');
          continue;
        }
        const message = payload;
        let event: WorkerSongCompletionEvent;
        try {
          event = JSON.parse(message) as WorkerSongCompletionEvent;
        } catch (error) {
          await this.moveToDlq(
            messageId,
            message,
            `Invalid completion payload: ${this.errorMessage(error)}`,
            0,
          );
          this.retryPending = false;
          await this.recordMetric('dead_lettered');
          this.logger.error(
            `Completion message ${messageId} moved to DLQ: invalid JSON`,
          );
          continue;
        }
        const metadataVersion = event.metadata_version;
        if (
          !event.song_id ||
          typeof event.song_id !== 'string' ||
          typeof metadataVersion !== 'number' ||
          !Number.isSafeInteger(metadataVersion) ||
          metadataVersion <= 0 ||
          (event.status !== 'success' && event.status !== 'error')
        ) {
          await this.moveToDlq(
            messageId,
            message,
            'Completion payload has invalid song_id, metadata_version, or status',
            0,
          );
          this.retryPending = false;
          await this.recordMetric('dead_lettered');
          continue;
        }

        const processedKey = songCompletionProcessedKey(
          event.song_id,
          metadataVersion,
        );
        const lockKey = songCompletionLockKey(event.song_id);

        // dedupe by outcome:
        // - success is terminal and always wins.
        // - error can be upgraded later by a success event.
        const already = await this.redis.get(processedKey);
        if (already === 'success' || already === 'stale') {
          this.logger.log(
            `Skipping already-successful song ${event.song_id} (incoming=${event.status})`,
          );
          await this.redis.xack(SONG_COMPLETION_QUEUE, this.group, messageId);
          continue;
        }
        if (already === 'error' && event.status === 'error') {
          this.logger.log(
            `Skipping duplicate error event for song ${event.song_id}`,
          );
          await this.redis.xack(SONG_COMPLETION_QUEUE, this.group, messageId);
          continue;
        }

        // attempt to acquire a short-lived lock to avoid concurrent processing
        const lockToken = randomUUID();
        const lock = await this.redis.set(
          lockKey,
          lockToken,
          'PX',
          this.lockTtlMs,
          'NX',
        );
        if (!lock) {
          this.logger.log(
            `Song ${event.song_id} currently locked; keeping stream entry pending`,
          );
          this.retryPending = true;
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        const lease: CompletionLockLease = { active: true, lost: false };
        const heartbeat = setInterval(
          () => void this.renewLock(lockKey, lockToken, lease),
          Math.max(1000, Math.floor(this.lockTtlMs / 3)),
        );
        heartbeat.unref();

        try {
          const applied = await this.songsService.applyWorkerCompletion({
            ...event,
            metadata_version: metadataVersion,
          });
          if (lease.lost) {
            this.retryPending = true;
            this.logger.warn(
              `Completion lock for song ${event.song_id} was lost; leaving entry pending for safe retry`,
            );
            continue;
          }

          if (!applied) {
            // A newer transcode generation has already superseded this result.
            // Acknowledge it without changing the current Song state.
            await this.redis.set(processedKey, 'stale', 'EX', 60 * 60 * 24);
            await this.redis.xack(SONG_COMPLETION_QUEUE, this.group, messageId);
            this.retryPending = false;
            this.logger.log(
              `Ignoring stale completion for song ${event.song_id} version ${metadataVersion}`,
            );
            continue;
          }

          // mark outcome for 1 day.
          await this.redis.set(processedKey, event.status, 'EX', 60 * 60 * 24);
          await this.redis.xack(SONG_COMPLETION_QUEUE, this.group, messageId);
          this.retryPending = false;

          this.logger.log(
            `Processed worker completion event for song ${event.song_id} (${event.status})`,
          );
        } catch (err) {
          const errMsg =
            err instanceof Error ? err.stack || err.message : String(err);

          const deliveries = await this.pendingDeliveries(messageId);
          if (deliveries < this.maxDeliveries) {
            this.retryPending = true;
            const backoffMs = Math.min(
              1000 * 2 ** Math.max(0, deliveries - 1),
              30000,
            );
            this.logger.warn(
              `applyWorkerCompletion failed for ${event.song_id}, delivery ${deliveries}/${this.maxDeliveries}, backing off ${backoffMs}ms`,
            );
            await this.recordMetric('retries');
            await new Promise((r) => setTimeout(r, backoffMs));
          } else {
            this.logger.error(
              `applyWorkerCompletion failed for ${event.song_id} after ${deliveries} deliveries; moving to DLQ: ${errMsg}`,
            );
            await this.moveToDlq(messageId, message, errMsg, deliveries);
            this.retryPending = false;
            await this.recordMetric('dead_lettered');
          }
        } finally {
          lease.active = false;
          clearInterval(heartbeat);
          // release lock
          await this.redis
            .eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
              1,
              lockKey,
              lockToken,
            )
            .catch(() => undefined);
        }
      } catch (error) {
        if (!this.running) {
          break;
        }

        this.logger.error(
          'Failed to consume worker completion event',
          error instanceof Error ? error.stack : undefined,
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async claimStaleEntry(): Promise<RedisStreamEntry | undefined> {
    if (Date.now() < this.nextReclaimAt) return undefined;
    this.nextReclaimAt = Date.now() + 30_000;
    const claimed = (await this.redis.call(
      'XAUTOCLAIM',
      SONG_COMPLETION_QUEUE,
      this.group,
      this.consumer,
      this.claimIdleMs,
      this.reclaimCursor,
      'COUNT',
      1,
    )) as RedisAutoClaimResponse;
    this.reclaimCursor = claimed?.[0] || '0-0';
    const entry = claimed?.[1]?.[0];
    if (entry) {
      await this.recordMetric('reclaimed');
      this.logger.warn(`Reclaimed stale completion entry ${entry[0]}`);
    }
    return entry;
  }

  private async pendingDeliveries(messageId: string): Promise<number> {
    const rows = (await this.redis.call(
      'XPENDING',
      SONG_COMPLETION_QUEUE,
      this.group,
      messageId,
      messageId,
      1,
    )) as [string, string, number, number][];
    return Number(rows[0]?.[3] ?? 0);
  }

  private async renewLock(
    lockKey: string,
    lockToken: string,
    lease: CompletionLockLease,
  ): Promise<void> {
    if (!lease.active || lease.lost) return;

    try {
      const renewed = Number(
        await this.redis.eval(
          "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end return 0",
          1,
          lockKey,
          lockToken,
          String(this.lockTtlMs),
        ),
      );
      if (renewed !== 1 && lease.active) {
        lease.lost = true;
        this.logger.warn('Completion lock lease was no longer owned');
      }
    } catch (error) {
      if (lease.active) {
        lease.lost = true;
        this.logger.warn(
          'Unable to renew completion lock lease; refusing stale acknowledgement',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async moveToDlq(
    messageId: string,
    payload: string,
    error: string,
    deliveries: number,
  ): Promise<void> {
    const result = await this.redis
      .multi()
      .xadd(
        SONG_COMPLETION_DLQ,
        '*',
        'payload',
        payload,
        'source_stream',
        SONG_COMPLETION_QUEUE,
        'source_id',
        messageId,
        'deliveries',
        String(deliveries),
        'error',
        error.slice(0, 2000),
      )
      .xack(SONG_COMPLETION_QUEUE, this.group, messageId)
      .exec();
    const failure = result?.find(([commandError]) => commandError)?.[0];
    if (failure) throw failure;
  }

  private async recordMetric(
    name: 'reclaimed' | 'retries' | 'dead_lettered',
  ): Promise<void> {
    await this.redis
      .incr(`metrics:queue:song_completion:${name}`)
      .catch(() => undefined);
  }

  private positive(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
