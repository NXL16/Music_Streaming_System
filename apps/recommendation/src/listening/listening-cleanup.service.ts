import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const RETENTION_DAYS = 90;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BATCH_SIZE = 5000;

@Injectable()
export class ListeningCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ListeningCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
    this.logger.log(
      `Listening events cleanup scheduled — retention ${RETENTION_DAYS} days, every ${CLEANUP_INTERVAL_MS / 3600000}h`,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runCleanup(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    let totalDeleted = 0;

    try {
      let deleted: number;
      do {
        deleted = await this.deleteBatch(cutoff);
        totalDeleted += deleted;
      } while (deleted >= BATCH_SIZE);

      if (totalDeleted > 0) {
        this.logger.log(
          `Đã xóa ${totalDeleted} listening events cũ hơn ${RETENTION_DAYS} ngày`,
        );
      }
    } catch (error) {
      this.logger.error('Lỗi khi cleanup listening events', error);
    } finally {
      this.running = false;
    }
  }

  private async deleteBatch(cutoff: Date): Promise<number> {
    const result = await this.prisma.$executeRaw`
      DELETE FROM listening_events
      WHERE id IN (
        SELECT id FROM listening_events
        WHERE "createdAt" < ${cutoff}
        LIMIT ${BATCH_SIZE}
      )
    `;
    return result;
  }
}
