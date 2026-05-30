import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { SongsService } from './songs.service';
import {
  SONG_COMPLETION_QUEUE,
  songCompletionLockKey,
  songCompletionProcessedKey,
} from '@musical/shared-types';

type WorkerSongCompletionEvent = {
  song_id: string;
  status: 'success' | 'error';
  duration_sec?: number | null;
  encrypted_file_path?: string | null;
  bitrate_kbps?: number | null;
  codec?: string | null;
  format?: string | null;
  error_message?: string | null;
  retry_count?: number | null;
};

@Injectable()
export class CompletionService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CompletionService.name);
  private running = false;

  constructor(
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    private readonly songsService: SongsService,
  ) {}

  onApplicationBootstrap() {
    this.running = true;
    void this.consumeLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;

    await this.redis.quit().catch(() => {
      this.redis.disconnect(false);
    });
  }

  private async consumeLoop(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.redis.blpop(SONG_COMPLETION_QUEUE, 0);

        if (!result) {
          continue;
        }

        const [, message] = result;
        const event = JSON.parse(message) as WorkerSongCompletionEvent;

        const processedKey = songCompletionProcessedKey(event.song_id);
        const lockKey = songCompletionLockKey(event.song_id);

        // dedupe by outcome:
        // - success is terminal and always wins.
        // - error can be upgraded later by a success event.
        const already = await this.redis.get(processedKey);
        if (already === 'success') {
          this.logger.log(
            `Skipping already-successful song ${event.song_id} (incoming=${event.status})`,
          );
          continue;
        }
        if (already === 'error' && event.status === 'error') {
          this.logger.log(
            `Skipping duplicate error event for song ${event.song_id}`,
          );
          continue;
        }

        // attempt to acquire a short-lived lock to avoid concurrent processing
        const lock = await this.redis.set(lockKey, '1', 'EX', 60, 'NX');
        if (!lock) {
          this.logger.log(`Song ${event.song_id} currently locked, requeueing`);
          // push back so another consumer can pick it up later
          await this.redis.lpush(SONG_COMPLETION_QUEUE, message);
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        try {
          await this.songsService.applyWorkerCompletion(event);

          // mark outcome for 1 day.
          await this.redis.set(processedKey, event.status, 'EX', 60 * 60 * 24);

          this.logger.log(
            `Processed worker completion event for song ${event.song_id} (${event.status})`,
          );
        } catch (err) {
          const errMsg =
            err instanceof Error ? err.stack || err.message : String(err);

          const retryCount = event.retry_count ?? 0;
          const MAX_RETRIES = 5;

          if (retryCount < MAX_RETRIES) {
            const next = { ...event, retry_count: retryCount + 1 };
            // exponential-ish backoff (best-effort): requeue and sleep briefly
            await this.redis.lpush(
              SONG_COMPLETION_QUEUE,
              JSON.stringify(next),
            );
            const backoffMs = Math.min(1000 * 2 ** retryCount, 30000);
            this.logger.warn(
              `applyWorkerCompletion failed for ${event.song_id}, retry ${retryCount + 1}/${MAX_RETRIES}, backing off ${backoffMs}ms`,
            );
            await new Promise((r) => setTimeout(r, backoffMs));
          } else {
            this.logger.error(
              `applyWorkerCompletion failed for ${event.song_id} after ${MAX_RETRIES} retries: ${errMsg}`,
            );

            // mark as failed in DB to avoid endless retries
            try {
              const failureEvent: WorkerSongCompletionEvent = {
                song_id: event.song_id,
                status: 'error',
                error_message: `Max retries exceeded: ${errMsg}`,
              };

              await this.songsService.applyWorkerCompletion(failureEvent);
              await this.redis.set(processedKey, 'error', 'EX', 60 * 60 * 24);
            } catch (innerErr) {
              this.logger.error(
                'Failed to mark song as failed after max retries',
                innerErr instanceof Error ? innerErr.stack : undefined,
              );
            }
          }
        } finally {
          // release lock
          await this.redis.del(lockKey).catch(() => undefined);
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
}
