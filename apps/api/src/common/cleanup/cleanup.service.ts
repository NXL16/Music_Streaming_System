import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Song, SongDocument } from '../../songs/schemas/song.schema';
import { SongStatus } from '@musical/shared-types';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  // Root folder của app (apps/api)
  private readonly appRoot = path.join(__dirname, '../../..');

  constructor(@InjectModel(Song.name) private songModel: Model<SongDocument>) {}

  /**
   * Xóa file tạm thời cũ (> 24 giờ)
   * Chạy hàng ngày lúc 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupTempFiles() {
    await this._cleanupTempFilesWithThreshold(24 * 60 * 60 * 1000);
  }

  /**
   * Helper: Xóa file tạm thời với threshold tùy chỉnh
   * @param maxAgeMs - Thời gian file được giữ (ms)
   */
  async _cleanupTempFilesWithThreshold(maxAgeMs: number) {
    const tempDir = path.join(this.appRoot, 'uploads', 'temp');
    const now = Date.now();

    if (!fs.existsSync(tempDir)) {
      return;
    }

    const entries = await fsp.readdir(tempDir, { withFileTypes: true });
    let deletedCount = 0;

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const file = entry.name;
      const filePath = path.join(tempDir, file);
      const stats = await fsp.stat(filePath).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Không đọc được metadata file ${filePath}: ${message}`);
        return null;
      });

      if (!stats) {
        continue;
      }

      const fileAge = now - stats.mtimeMs;

      if (fileAge > maxAgeMs) {
        const deleted = await fsp
          .unlink(filePath)
          .then(() => true)
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Không xóa được file tạm ${filePath}: ${message}`);
            return false;
          });

        if (deleted) {
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      this.logger.log(
        `Đã xóa ${deletedCount} file tạm thời (threshold: ${Math.round(maxAgeMs / 1000 / 60)}min)`,
      );
    }
  }

  /**
   * Xóa bài hát bị stuck (trạng thái PROCESSING > 7 ngày)
   * Chạy hàng ngày lúc 3 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupFailedProcessing() {
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoffDate = new Date(Date.now() - maxAgeMs);

    const result = await this.songModel.deleteMany({
      status: SongStatus.PROCESSING,
      createdAt: { $lt: cutoffDate },
    });

    if (result.deletedCount > 0) {
      this.logger.log(`Đã xóa ${result.deletedCount} bài hát bị stuck`);
    }
  }
}
