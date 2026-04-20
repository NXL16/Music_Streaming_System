import {
  InjectQueue,
  QueueEventsHost,
  QueueEventsListener,
  OnQueueEvent,
} from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Song, SongDocument } from './schemas/song.schema';
import { Queue } from 'bullmq';
import { SongStatus } from '@musical/shared-types';

interface TranscodeResult {
  success: boolean;
  songId: string;
  duration: number;
  hlsMasterPath: string;
  hlsKeyId: string;
  coverUrl: string | null;
}

@QueueEventsListener('transcode-queue')
@Injectable()
export class TranscodeListener extends QueueEventsHost {
  private readonly logger = new Logger(TranscodeListener.name);

  constructor(
    @InjectModel(Song.name) private readonly songModel: Model<SongDocument>,
    @InjectQueue('transcode-queue')
    private readonly transcodeQueue: Queue,
  ) {
    super();
  }

  // Sự kiện kích hoạt khi Worker `return` thành công
  @OnQueueEvent('completed')
  async onCompleted({
    jobId,
    returnvalue,
  }: {
    jobId: string;
    returnvalue: string | TranscodeResult;
  }) {
    this.logger.log(`Bắt được sự kiện hoàn thành từ Worker cho Job ${jobId}`);

    // BullMQ lưu returnvalue dạng chuỗi JSON nếu truyền qua Redis, nên cần parse an toàn
    const result = (
      typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue
    ) as TranscodeResult;

    if (result?.success && result?.songId) {
      // API TỰ MÌNH CẬP NHẬT DATABASE
      await this.songModel.findByIdAndUpdate(result.songId, {
        status: SongStatus.READY,
        duration: result.duration,
        hlsMasterPath: result.hlsMasterPath,
        hlsKeyId: result.hlsKeyId,
        processingLog: null,
        'thumbnails.large': result.coverUrl,
      });

      this.logger.log(
        `Đã cập nhật Database thành công cho bài hát: ${result.songId}`,
      );
    }
  }

  // Bắt sự kiện nếu Worker bị lỗi (hỏng file, crash FFmpeg)
  @OnQueueEvent('failed')
  async onFailed({
    jobId,
    failedReason,
  }: {
    jobId: string;
    failedReason: string;
  }) {
    this.logger.error(`❌ Job ${jobId} thất bại. Lý do: ${failedReason}`);

    const job = await this.transcodeQueue.getJob(jobId);
    const songId = (job?.data as { songId?: string } | undefined)?.songId;

    if (!songId) {
      this.logger.warn(
        `Không tìm thấy songId từ Job ${jobId}, bỏ qua cập nhật trạng thái failed.`,
      );
      return;
    }

    await this.songModel.findByIdAndUpdate(songId, {
      status: SongStatus.FAILED,
      processingLog: failedReason,
      processingCompletedAt: new Date(),
    });

    this.logger.warn(`Đã cập nhật bài hát ${songId} sang trạng thái failed.`);
  }
}
