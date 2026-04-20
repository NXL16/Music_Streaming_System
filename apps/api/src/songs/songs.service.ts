import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Song, SongDocument } from './schemas/song.schema';
import { GetSongsQueryDto } from './dto/get-songs-query.dto';
import {
  SongStatus,
  ITranscodeJob,
  TRANSCODE_QUEUE,
} from '@musical/shared-types';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { KmsService } from '../kms/kms.service';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { createReadStream } from 'fs';
import Redis from 'ioredis';

@Injectable()
export class SongsService {
  constructor(
    @InjectModel(Song.name)
    private readonly songModel: Model<SongDocument>,
    @InjectQueue(TRANSCODE_QUEUE)
    private readonly transcodeQueue: Queue,
    private readonly kmsService: KmsService,
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
  ) {}

  private isSameUserId(value: unknown, userId: string): boolean {
    if (typeof value === 'string') {
      return value === userId;
    }

    if (value instanceof Types.ObjectId) {
      return value.toHexString() === userId;
    }

    return false;
  }

  private isSongOwner(song: { uploadedBy?: unknown }, userId: string): boolean {
    return this.isSameUserId(song.uploadedBy, userId);
  }

  async findAll(queryDto: GetSongsQueryDto) {
    const { cursor, limit, genre, search } = queryDto;

    const safeLimit = Math.min(limit ?? 20, 50);

    const filter: Record<string, unknown> = {
      isPublic: true,
      status: SongStatus.READY,
    };

    if (genre) {
      filter.genre = genre;
    }

    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    if (cursor) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }

    const songs = await this.songModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(safeLimit + 1) // lấy dư 1 record
      .lean()
      .exec();

    const hasMore = songs.length > safeLimit;

    if (hasMore) {
      songs.pop();
    }

    const nextCursor =
      songs.length > 0 ? songs[songs.length - 1]._id.toString() : null;

    return {
      songs,
      pagination: {
        nextCursor,
        limit: safeLimit,
        hasMore,
      },
    };
  }

  async findOne(id: string, userId: string) {
    const song = await this.songModel.findById(id).lean().exec();

    if (!song) {
      throw new NotFoundException({
        code: 'SONG_NOT_FOUND',
        message: 'Bài hát không tồn tại',
      });
    }

    const isOwner = this.isSongOwner(song, userId);
    if (!song.isPublic && !isOwner) {
      throw new ForbiddenException('Bạn không có quyền truy cập bài hát này');
    }

    return song;
  }

  /**
   * Hàm hỗ trợ tính toán SHA-256 từ file path
   * Sử dụng Stream để tránh việc nạp file quá lớn vào RAM gây tràn bộ nhớ
   */
  private calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  async uploadSong(
    file: Express.Multer.File,
    userId: string,
    title: string,
    isPublic = false,
  ) {
    if (!file) {
      throw new BadRequestException('Không tìm thấy file');
    }

    // BƯỚC 1: Tính toán dấu vân tay (Hash) thực tế của file
    const fileChecksum = await this.calculateFileHash(file.path);

    // BƯỚC 2: Kiểm tra xem "vân tay" này đã tồn tại trong hệ thống chưa
    // Chỉ tìm những bài đã xử lý thành công (READY)
    const existingSong = await this.songModel
      .findOne({
        checksum: fileChecksum,
        status: SongStatus.READY,
      })
      .lean()
      .exec();

    if (existingSong) {
      // NHƯỢC ĐIỂM CỦA CÁCH CŨ LÀM ĐÃ ĐƯỢC KHẮC PHỤC Ở ĐÂY:
      // Nếu file đã tồn tại, ta xóa ngay file tạm vừa upload lên để đỡ chật ổ cứng
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      // Tạo bản ghi mới cho người dùng này, nhưng trỏ dữ liệu nhạc về file cũ
      const duplicateSong = new this.songModel({
        title: title || file.originalname,
        originalFormat: file.mimetype,
        fileSize: file.size,
        uploadedBy: new Types.ObjectId(userId),
        artistId: new Types.ObjectId(userId),
        status: SongStatus.READY, // Sẵn sàng luôn
        isPublic,
        checksum: fileChecksum,
        duration: existingSong.duration,
        hlsMasterPath: existingSong.hlsMasterPath, // Dùng chung file đã transcode trên R2
        hlsKeyId: existingSong.hlsKeyId,
        thumbnails: existingSong.thumbnails,
      });

      return {
        song: await duplicateSong.save(),
        isDuplicate: true,
      };
    }

    // BƯỚC 3: Nếu là file mới hoàn toàn, tiến hành quy trình cũ
    const newSong = new this.songModel({
      title: title || file.originalname,
      originalFormat: file.mimetype,
      fileSize: file.size,
      uploadedBy: new Types.ObjectId(userId),
      status: SongStatus.PROCESSING,
      isPublic,
      artistId: new Types.ObjectId(userId), // Tạm thời lấy người upload làm artist
      duration: 1, // Thời lượng 1s (Worker sẽ update sau)
      checksum: fileChecksum, // Lưu hash thật
    });

    await newSong.save();

    // b. Đóng gói dữ liệu Payload chuẩn bị ném cho Worker
    const jobPayload: ITranscodeJob = {
      songId: newSong._id.toString(),
      originalFilePath: file.path,
      uploadedBy: userId,
      format: file.mimetype,
      checksum: fileChecksum,
    };

    // c. Đẩy Job vào Queue (BullMQ lưu vào Redis)
    await this.transcodeQueue.add('transcode-hls', jobPayload, {
      removeOnComplete: true,
      attempts: 3,
    });

    return {
      song: newSong,
      isDuplicate: false,
    };
  }

  // HÀM LẤY KHÓA (WITH CACHING)
  async getSongDecryptionKey(
    songId: string,
    userId: string,
    deviceFingerprint: string,
  ) {
    const song = await this.songModel.findById(songId).lean().exec();

    if (!song) {
      throw new NotFoundException('Bài hát không tồn tại');
    }

    if (song.status !== SongStatus.READY) {
      throw new BadRequestException('Bài hát chưa sẵn sàng để phát');
    }

    const isOwner = this.isSongOwner(song, userId);
    const canAccess = song.isPublic || isOwner;

    if (!canAccess) {
      throw new ForbiddenException('Bạn không có quyền truy cập bài hát này');
    }

    // BƯỚC 1: Tạo cache key dựa trên songId, userId, và device fingerprint hash
    const fingerprintHash = crypto
      .createHash('sha256')
      .update(deviceFingerprint)
      .digest('hex')
      .substring(0, 16);
    const cacheKey = `song:key:${songId}:${userId}:${fingerprintHash}`;

    try {
      // BƯỚC 2: Kiểm tra cache trong Redis
      const cachedKey = await this.redis.getBuffer(cacheKey);
      if (cachedKey) {
        return cachedKey;
      }

      // BƯỚC 3: Nếu không có cache, tìm song nguồn theo hlsKeyId để lấy đúng khóa KMS
      // (quan trọng cho case duplicate dùng chung HLS/key metadata).
      let keyLookupSongId = songId;

      if (song.hlsKeyId) {
        const sourceSong = await this.songModel
          .findOne({
            hlsKeyId: song.hlsKeyId,
            status: SongStatus.READY,
          })
          .sort({ createdAt: 1 })
          .select('_id')
          .lean()
          .exec();

        if (sourceSong?._id) {
          keyLookupSongId = sourceSong._id.toString();
        }
      }

      const keyResponse = await this.kmsService.getKey(
        keyLookupSongId,
        userId,
        deviceFingerprint,
      );

      const keyBuffer = Buffer.from(keyResponse.key);

      // BƯỚC 4: Lưu key vào cache với TTL 30 phút (1800 giây)
      await this.redis.setex(cacheKey, 1800, keyBuffer);

      return keyBuffer;
    } catch {
      throw new BadRequestException(
        'Không thể lấy khóa giải mã cho bài hát này',
      );
    }
  }
}
