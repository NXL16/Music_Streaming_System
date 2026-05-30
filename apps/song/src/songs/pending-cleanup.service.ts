import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SongStatus } from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PendingCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly enabled: boolean;
  private readonly staleMinutes: number;
  private readonly intervalSec: number;
  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.enabled = this.readBoolean('SONG_PENDING_CLEANUP_ENABLED', true);
    this.staleMinutes = this.readNumber('SONG_PENDING_STALE_MINUTES', 180, 5);
    this.intervalSec = this.readNumber(
      'SONG_PENDING_CLEANUP_INTERVAL_SEC',
      300,
      30,
    );
    this.batchSize = this.readNumber('SONG_PENDING_CLEANUP_BATCH_SIZE', 200, 1);
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Pending cleanup disabled');
      return;
    }

    this.timer = setInterval(() => {
      void this.runCleanup();
    }, this.intervalSec * 1000);
    this.timer.unref?.();
    void this.runCleanup();
    this.logger.log(
      `Pending cleanup enabled: stale=${this.staleMinutes}m interval=${this.intervalSec}s batch=${this.batchSize}`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCleanup() {
    if (this.running) return;
    this.running = true;
    try {
      const threshold = new Date(Date.now() - this.staleMinutes * 60 * 1000);
      const stalePending = await this.prisma.song.findMany({
        where: {
          status: SongStatus.SONG_STATUS_PENDING,
          createdAt: { lt: threshold },
        },
        select: { id: true },
        take: this.batchSize,
        orderBy: { createdAt: 'asc' },
      });

      if (stalePending.length === 0) {
        return;
      }

      const ids = stalePending.map((item) => item.id);
      const result = await this.prisma.song.updateMany({
        where: { id: { in: ids } },
        data: { status: SongStatus.SONG_STATUS_FAILED },
      });

      this.logger.warn(
        `Marked stale pending songs as FAILED: ${result.count} (threshold=${threshold.toISOString()})`,
      );
    } catch (error) {
      this.logger.error(
        'Pending cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private readNumber(key: string, fallback: number, min: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key);
    if (!raw) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
    return fallback;
  }
}
