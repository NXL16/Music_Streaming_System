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
import { ITranscodeResult, SongStatus } from '@musical/shared-types';

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
    returnvalue: string | ITranscodeResult;
  }) {
    this.logger.log(`Bắt được sự kiện hoàn thành từ Worker cho Job ${jobId}`);

    let result: ITranscodeResult;
    try {
      result = (
        typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue
      ) as ITranscodeResult;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Không parse được returnvalue của job ${jobId}: ${message}`,
      );
      return;
    }

    if (result?.success && result?.songId) {
      // API TỰ MÌNH CẬP NHẬT DATABASE
      const updatedSourceSong = await this.songModel.findByIdAndUpdate(
        result.songId,
        {
          status: SongStatus.READY,
          duration: result.duration,
          hlsMasterPath: result.hlsMasterPath,
          hlsKeyId: result.hlsKeyId,
          processingLog: null,
          'thumbnails.large': result.coverUrl,
        },
        { new: true },
      );

      if (updatedSourceSong?.checksum) {
        // Đồng bộ các bản ghi đang chờ cùng checksum (upload bởi user khác).
        await this.songModel.updateMany(
          {
            checksum: updatedSourceSong.checksum,
            status: SongStatus.PROCESSING,
            _id: { $ne: updatedSourceSong._id },
          },
          {
            status: SongStatus.READY,
            duration: result.duration,
            hlsMasterPath: result.hlsMasterPath,
            hlsKeyId: result.hlsKeyId,
            processingLog: null,
            'thumbnails.large': result.coverUrl,
          },
        );
      }

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
    const completedAt = new Date();

    const job = await this.transcodeQueue.getJob(jobId);
    const songId = (job?.data as { songId?: string } | undefined)?.songId;

    if (!songId) {
      this.logger.warn(
        `Không tìm thấy songId từ Job ${jobId}, bỏ qua cập nhật trạng thái failed.`,
      );
      return;
    }

    const failedSourceSong = await this.songModel.findByIdAndUpdate(
      songId,
      {
        status: SongStatus.FAILED,
        processingLog: failedReason,
        processingCompletedAt: completedAt,
      },
      { new: true },
    );

    if (failedSourceSong?.checksum) {
      await this.songModel.updateMany(
        {
          checksum: failedSourceSong.checksum,
          status: SongStatus.PROCESSING,
          _id: { $ne: failedSourceSong._id },
        },
        {
          status: SongStatus.FAILED,
          processingLog: failedReason,
          processingCompletedAt: completedAt,
        },
      );
    }

    this.logger.warn(`Đã cập nhật bài hát ${songId} sang trạng thái failed.`);
  }
}
