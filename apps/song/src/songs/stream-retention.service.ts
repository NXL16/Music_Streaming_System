import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import {
  SONG_ASSET_CLEANUP_DLQ,
  SONG_ASSET_CLEANUP_STREAM,
  SONG_COMPLETION_DLQ,
  SONG_COMPLETION_QUEUE,
  TRANSCODE_QUEUE,
} from '@musical/shared-types';

type StreamGroup = {
  name: string;
  pending: number;
  lastDeliveredId: string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Keeps Redis Streams bounded without ever trimming a message that a consumer
 * group may still need. Main streams are trimmed only below every group's
 * oldest pending/last-delivered entry; DLQs have no automatic consumer and
 * are retained by age for operator investigation.
 */
@Injectable()
export class StreamRetentionService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StreamRetentionService.name);
  private readonly mainRetentionMs: number;
  private readonly dlqRetentionMs: number;
  private readonly intervalMs: number;
  private readonly trimBatchSize: number;
  private readonly transcodeQueue: string;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.mainRetentionMs = this.positive(
      config.get<string>('REDIS_STREAM_MAIN_RETENTION_MS'),
      7 * DAY_MS,
    );
    this.dlqRetentionMs = this.positive(
      config.get<string>('REDIS_STREAM_DLQ_RETENTION_MS'),
      30 * DAY_MS,
    );
    this.intervalMs = this.positive(
      config.get<string>('REDIS_STREAM_RETENTION_INTERVAL_MS'),
      HOUR_MS,
    );
    this.trimBatchSize = this.positive(
      config.get<string>('REDIS_STREAM_TRIM_BATCH_SIZE'),
      1_000,
    );
    this.transcodeQueue =
      config.get<string>('TRANSCODE_QUEUE')?.trim() || TRANSCODE_QUEUE;
  }

  onApplicationBootstrap(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await Promise.all([
        ...this.mainStreams().map((stream) => this.trimMainStream(stream)),
        ...this.dlqStreams().map((stream) => this.trimDlqStream(stream)),
      ]);
    } catch (error) {
      this.logger.error(
        'Redis Stream retention pass failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private mainStreams(): string[] {
    return [
      this.transcodeQueue,
      SONG_COMPLETION_QUEUE,
      SONG_ASSET_CLEANUP_STREAM,
    ];
  }

  private dlqStreams(): string[] {
    return [
      `${this.transcodeQueue}:dlq`,
      `${this.transcodeQueue}:outbox:dlq`,
      SONG_COMPLETION_DLQ,
      SONG_ASSET_CLEANUP_DLQ,
    ];
  }

  private async trimMainStream(stream: string): Promise<void> {
    const groups = await this.groups(stream);
    // A queue without a consumer group has no ACK watermark. Skipping it is
    // deliberately conservative: it may contain work for a service that is
    // temporarily offline, so time alone must never delete it.
    if (groups.length === 0) return;

    const acknowledgedThrough = await this.safeAcknowledgedThrough(
      stream,
      groups,
    );
    if (!acknowledgedThrough) return;

    const ageThreshold = this.streamIdAt(Date.now() - this.mainRetentionMs);
    await this.trimBefore(
      stream,
      this.earlierStreamId(acknowledgedThrough, ageThreshold),
    );
  }

  private async trimDlqStream(stream: string): Promise<void> {
    const groups = await this.groups(stream);
    const ageThreshold = this.streamIdAt(Date.now() - this.dlqRetentionMs);
    // DLQs normally have no consumer group and are retained solely by age.
    // If an operator creates a group to replay entries, apply the same ACK
    // barrier as a main queue instead of deleting its pending messages.
    if (groups.length === 0) {
      if (await this.streamExists(stream)) {
        await this.trimBefore(stream, ageThreshold);
      }
      return;
    }

    const acknowledgedThrough = await this.safeAcknowledgedThrough(
      stream,
      groups,
    );
    if (!acknowledgedThrough) return;
    await this.trimBefore(
      stream,
      this.earlierStreamId(acknowledgedThrough, ageThreshold),
    );
  }

  private async safeAcknowledgedThrough(
    stream: string,
    groups: StreamGroup[],
  ): Promise<string | undefined> {
    const boundaries = await Promise.all(
      groups.map(async (group) => {
        if (group.pending <= 0) return group.lastDeliveredId;

        const pending = (await this.redis.call(
          'XPENDING',
          stream,
          group.name,
          '-',
          '+',
          '1',
        )) as unknown[];
        const firstPending = pending[0];
        const oldestPending = Array.isArray(firstPending)
          ? this.stringValue(firstPending[0])
          : '';
        return oldestPending || group.lastDeliveredId;
      }),
    );

    // A group created at 0-0 may still need the oldest entry in the stream.
    // Do not trim anything until every group has established an ACK boundary.
    if (
      boundaries.some(
        (value) => !value || value === '0-0' || !this.isStreamId(value),
      )
    ) {
      return undefined;
    }
    const valid = boundaries;
    return valid.length
      ? valid.reduce((earliest, value) => this.earlierStreamId(earliest, value))
      : undefined;
  }

  private async groups(stream: string): Promise<StreamGroup[]> {
    if (!(await this.streamExists(stream))) return [];
    const rawGroups = (await this.redis.call(
      'XINFO',
      'GROUPS',
      stream,
    )) as unknown[];
    return rawGroups
      .map((rawGroup) => {
        const fields = this.fields(rawGroup);
        return {
          name: this.stringValue(fields.name),
          pending: Number(fields.pending ?? 0),
          lastDeliveredId: this.stringValue(
            fields['last-delivered-id'],
            '0-0',
          ),
        };
      })
      .filter((group) => group.name);
  }

  private async streamExists(stream: string): Promise<boolean> {
    return (await this.redis.exists(stream)) === 1;
  }

  private async trimBefore(stream: string, cutoff: string): Promise<void> {
    const removed = Number(
      await this.redis.call(
        'XTRIM',
        stream,
        'MINID',
        '~',
        cutoff,
        'LIMIT',
        String(this.trimBatchSize),
      ),
    );
    if (removed > 0) {
      this.logger.log(
        `Trimmed ${removed} retained Redis Stream entries from ${stream}`,
      );
    }
  }

  private fields(value: unknown): Record<string, unknown> {
    const entries = Array.isArray(value) ? value : [];
    const result: Record<string, unknown> = {};
    for (let index = 0; index + 1 < entries.length; index += 2) {
      result[String(entries[index])] = entries[index + 1];
    }
    return result;
  }

  private stringValue(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value.toString();
    if (typeof value === 'number') return String(value);
    return fallback;
  }

  private streamIdAt(timestampMs: number): string {
    return `${Math.max(0, Math.floor(timestampMs))}-0`;
  }

  private isStreamId(value: string): boolean {
    return /^\d+-\d+$/.test(value);
  }

  private earlierStreamId(left: string, right: string): string {
    const [leftTime, leftSequence] = left.split('-').map(Number);
    const [rightTime, rightSequence] = right.split('-').map(Number);
    return leftTime < rightTime ||
      (leftTime === rightTime && leftSequence <= rightSequence)
      ? left
      : right;
  }

  private positive(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
