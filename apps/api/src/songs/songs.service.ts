import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import {
  SongServiceClient,
  GetSongRequest,
  GetSongResponse,
  GetSongByChecksumRequest,
  GetSongByChecksumResponse,
  GetSongIngestInfoRequest,
  GetSongIngestInfoResponse,
  ListSongsRequest,
  ListSongsResponse,
  CreateSongRecordRequest,
  CreateSongRecordResponse,
  UpdateSongProcessingResultRequest,
  UpdateSongProcessingResultResponse,
  FavoriteRequest,
  FavoriteResponse,
  GetPlaylistRequest,
  GetPlaylistResponse,
  SongStatus,
} from '@musical/shared-proto';
import { firstValueFrom } from 'rxjs';
import { R2Service } from '../common/r2/r2.service';
import { RequestUploadDto } from './dto/request-upload.dto';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';
import { TRANSCODE_QUEUE } from '@musical/shared-types';

@Injectable()
export class SongsService implements OnModuleInit {
  private songServiceClient: SongServiceClient;
  private readonly logger = new Logger(SongsService.name);

  constructor(
    @Inject('SONG_SERVICE') private readonly client: ClientGrpc,
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    private readonly r2Service: R2Service,
    private readonly configService: ConfigService,
  ) {
    this.songServiceClient =
      this.client.getService<SongServiceClient>('SongService');
  }

  onModuleInit() {
    // Client is initialized in constructor.
  }

  async getSong(data: GetSongRequest): Promise<GetSongResponse> {
    return await firstValueFrom(this.songServiceClient.getSong(data));
  }

  async getSongByChecksum(
    data: GetSongByChecksumRequest,
  ): Promise<GetSongByChecksumResponse> {
    return await firstValueFrom(this.songServiceClient.getSongByChecksum(data));
  }

  async getSongIngestInfo(
    data: GetSongIngestInfoRequest,
  ): Promise<GetSongIngestInfoResponse> {
    return await firstValueFrom(this.songServiceClient.getSongIngestInfo(data));
  }

  async listSongs(data: ListSongsRequest): Promise<ListSongsResponse> {
    return await firstValueFrom(this.songServiceClient.listSongs(data));
  }

  async createSongRecord(
    data: CreateSongRecordRequest,
  ): Promise<CreateSongRecordResponse> {
    return await firstValueFrom(this.songServiceClient.createSongRecord(data));
  }

  async updateSongProcessingResult(
    data: UpdateSongProcessingResultRequest,
  ): Promise<UpdateSongProcessingResultResponse> {
    return await firstValueFrom(
      this.songServiceClient.updateSongProcessingResult(data),
    );
  }

  async addFavorite(data: FavoriteRequest): Promise<FavoriteResponse> {
    return await firstValueFrom(this.songServiceClient.addFavorite(data));
  }

  async removeFavorite(data: FavoriteRequest): Promise<FavoriteResponse> {
    return await firstValueFrom(this.songServiceClient.removeFavorite(data));
  }

  async getPlaylist(data: GetPlaylistRequest): Promise<GetPlaylistResponse> {
    return await firstValueFrom(this.songServiceClient.getPlaylist(data));
  }

  async requestUpload(request: RequestUploadDto, userId: string) {
    const existing = await this.getSongByChecksum({
      checksum: request.checksum,
    });

    if (existing.found && existing.song) {
      const existingStatus = Number(existing.song.status);
      if (existingStatus === SongStatus.SONG_STATUS_READY) {
        return {
          songId: existing.song.id,
          instant: true,
          uploadUrl: '',
        };
      }

      const existingSongDetail = await this.getSong({
        songId: existing.song.id,
        requesterUserId: userId,
      });
      if (
        !existingSongDetail.song ||
        existingSongDetail.song.uploaderId !== userId
      ) {
        throw new Error('CHECKSUM_UPLOAD_IN_PROGRESS_BY_ANOTHER_USER');
      }

      if (!existing.song.sourceObjectPath) {
        throw new Error('SONG_SOURCE_PATH_MISSING');
      }

      const uploadUrl = await this.r2Service.createPresignedPutUrl(
        existing.song.sourceObjectPath,
        'application/octet-stream',
      );

      return {
        songId: existing.song.id,
        instant: false,
        uploadUrl,
      };
    }

    const objectKey = this.buildQuarantineObjectKey(
      request.checksum,
      request.title,
    );

    const createRequest: CreateSongRecordRequest = {
      title: request.title,
      artist: request.artist || '',
      album: request.album || '',
      uploaderId: userId,
      isPublic: request.isPublic ?? true,
      sourceObjectPath: objectKey,
      fileSizeBytes: request.size,
      checksum: request.checksum,
    };

    const uploadUrl = await this.r2Service.createPresignedPutUrl(
      objectKey,
      'application/octet-stream',
    );
    const record = await this.createSongRecord(createRequest);

    return {
      songId: record.song?.id || '',
      instant: false,
      uploadUrl,
    };
  }

  async finalizeUpload(request: FinalizeUploadDto, requesterUserId?: string) {
    let songId = request.songId;

    // If songId is not provided but checksum is, lookup by checksum
    if (!songId && request.checksum) {
      const songByChecksum = await this.getSongByChecksum({
        checksum: request.checksum,
      });
      if (!songByChecksum.song) {
        throw new Error('SONG_NOT_FOUND_BY_CHECKSUM');
      }
      songId = songByChecksum.song.id;
    }

    if (!songId) {
      throw new Error('SONG_ID_OR_CHECKSUM_REQUIRED');
    }

    const lockKey = this.finalizeLockKey(songId);
    const lockTtlSec = this.parseFinalizeLockTtlSec();
    const lockValue = `${Date.now()}`;
    const lockAcquired = await this.redis.set(
      lockKey,
      lockValue,
      'EX',
      lockTtlSec,
      'NX',
    );

    if (!lockAcquired) {
      this.logger.warn(`Finalize already in progress for song ${songId}`);
      return { status: 'PROCESSING' };
    }

    try {
      if (requesterUserId) {
        const songDetail = await this.getSong({
          songId,
          requesterUserId,
        });

        if (
          !songDetail.song ||
          songDetail.song.uploaderId !== requesterUserId
        ) {
          throw new Error('SONG_ACCESS_DENIED');
        }
      }

      const song = await this.getSongIngestInfo({
        songId,
      });

      if (!song.song || !song.song.sourceObjectPath) {
        throw new Error('SONG_SOURCE_PATH_MISSING');
      }

      if (
        Number(song.song.status) === SongStatus.SONG_STATUS_PROCESSING
      ) {
        return { status: 'PROCESSING' };
      }
      if (Number(song.song.status) === SongStatus.SONG_STATUS_READY) {
        return { status: 'READY' };
      }

      await this.r2Service.headObject(song.song.sourceObjectPath);

      const jobPayload = {
        song_id: songId,
        r2_path: song.song.sourceObjectPath,
        checksum: song.song.checksum || '',
      };

      try {
        await this.redis.lpush(TRANSCODE_QUEUE, JSON.stringify(jobPayload));
      } catch (error) {
        // Queue publish failed: keep song in PENDING to allow safe retry.
        await this.updateSongProcessingResult({
          songId,
          status: SongStatus.SONG_STATUS_PENDING,
          encryptedFilePath: '',
          durationSec: 0,
          bitrateKbps: 0,
          codec: '',
          format: '',
          errorMessage: '',
        });

        throw error;
      }

      // Best effort status update after enqueue.
      // If this fails, job is still queued and completion consumer will converge final state.
      try {
        await this.updateSongProcessingResult({
          songId,
          status: SongStatus.SONG_STATUS_PROCESSING,
          encryptedFilePath: '',
          durationSec: 0,
          bitrateKbps: 0,
          codec: '',
          format: '',
          errorMessage: '',
        });
      } catch (error) {
        this.logger.error(
          `Queued job for song ${songId} but failed to set PROCESSING status`,
          error instanceof Error ? error.stack : String(error),
        );
      }

      return { status: 'PROCESSING' };
    } finally {
      const currentLockValue = await this.redis.get(lockKey);
      if (currentLockValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  private buildQuarantineObjectKey(checksum: string, title: string) {
    const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `quarantine/${checksum}/${safeTitle}`;
  }

  private finalizeLockKey(songId: string) {
    return `song:finalize:lock:${songId}`;
  }

  private parseFinalizeLockTtlSec() {
    const raw = this.configService.get<string>('FINALIZE_LOCK_TTL_SEC');
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed < 30) {
      return 120;
    }
    return Math.floor(parsed);
  }
}
