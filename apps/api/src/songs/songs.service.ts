import {
  Injectable,
  Inject,
  OnModuleInit,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
  RemoveSongOwnershipRequest,
  RemoveSongOwnershipResponse,
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

  async removeSongOwnership(
    data: RemoveSongOwnershipRequest,
  ): Promise<RemoveSongOwnershipResponse> {
    return await firstValueFrom(this.songServiceClient.removeSongOwnership(data));
  }

  async unlinkSong(
    songId: string,
    userId: string,
  ): Promise<RemoveSongOwnershipResponse> {
    return await this.removeSongOwnership({ songId, userId });
  }

  async getPlaylist(data: GetPlaylistRequest): Promise<GetPlaylistResponse> {
    return await firstValueFrom(this.songServiceClient.getPlaylist(data));
  }

  async requestUpload(request: RequestUploadDto, userId: string) {
    const existing = await this.getSongByChecksum({
      checksum: request.checksum,
    });

    if (existing.found && existing.song) {
      if (!existing.song.sourceObjectPath) {
        throw new BadRequestException({
          code: 'SONG_SOURCE_PATH_MISSING',
          message: 'SONG_SOURCE_PATH_MISSING',
        });
      }
      let alreadyInLibrary = false;
      try {
        await this.createSongRecord({
          title: request.title,
          artist: request.artist || '',
          album: request.album || '',
          uploaderId: userId,
          isPublic: request.isPublic ?? true,
          sourceObjectPath: existing.song.sourceObjectPath,
          fileSizeBytes: request.size,
          checksum: request.checksum,
        });
      } catch (error) {
        if (this.isSongAlreadyInLibraryError(error)) {
          alreadyInLibrary = true;
        } else {
          throw error;
        }
      }
      return await this.buildExistingUploadResponse(
        existing.song.id,
        alreadyInLibrary,
      );
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

    try {
      const record = await this.createSongRecord(createRequest);

      const uploadUrl = await this.r2Service.createPresignedPutUrl(
        objectKey,
        'application/octet-stream',
      );

      return {
        songId: record.song?.id || '',
        instant: false,
        uploadUrl,
      };
    } catch (error) {
      if (this.isSongAlreadyInLibraryError(error)) {
        throw new ConflictException({
          code: 'SONG_ALREADY_IN_LIBRARY',
          message: 'Bài hát đã tồn tại trong thư viện của bạn',
        });
      }

      // Concurrent requests can race: one request creates first, others hit unique checksum conflict.
      if (!this.isChecksumAlreadyExistsError(error)) {
        throw error;
      }

      const latest = await this.getSongByChecksum({
        checksum: request.checksum,
      });

      if (!latest.found || !latest.song) {
        throw error;
      }

      return await this.buildExistingUploadResponse(latest.song.id, false);
    }
  }

  private async buildExistingUploadResponse(
    songId: string,
    alreadyInLibrary: boolean,
  ) {
    const ingest = await this.getSongIngestInfo({ songId });
    if (!ingest.song) {
      throw new NotFoundException({
        code: 'SONG_NOT_FOUND',
        message: 'SONG_NOT_FOUND',
      });
    }
    const existingStatus = Number(ingest.song.status);

    if (!ingest.song.sourceObjectPath) {
      throw new BadRequestException({
        code: 'SONG_SOURCE_PATH_MISSING',
        message: 'SONG_SOURCE_PATH_MISSING',
      });
    }

    if (existingStatus === SongStatus.SONG_STATUS_PROCESSING) {
      return {
        songId: ingest.song.id,
        instant: false,
        uploadUrl: '',
        status: 'PROCESSING',
      };
    }

    if (existingStatus === SongStatus.SONG_STATUS_PENDING) {
      try {
        const objectMeta = await this.r2Service.headObject(
          ingest.song.sourceObjectPath,
        );
        const expectedSize = Number(ingest.song.fileSizeBytes ?? 0);
        const actualSize = Number(objectMeta.contentLength ?? 0);
        if (expectedSize > 0 && actualSize !== expectedSize) {
          const uploadUrl = await this.r2Service.createPresignedPutUrl(
            ingest.song.sourceObjectPath,
            'application/octet-stream',
          );
          return {
            songId: ingest.song.id,
            instant: false,
            uploadUrl,
            status: 'RETRY_UPLOAD',
          };
        }
        return {
          songId: ingest.song.id,
          instant: false,
          uploadUrl: '',
          status: 'PROCESSING',
        };
      } catch (error) {
        if (!this.isObjectMissingError(error)) {
          throw error;
        }
      }
    }

    if (existingStatus === SongStatus.SONG_STATUS_READY) {
      try {
        await this.r2Service.headObject(ingest.song.sourceObjectPath);
      } catch (error) {
        if (!this.isObjectMissingError(error)) {
          throw error;
        }
        const uploadUrl = await this.r2Service.createPresignedPutUrl(
          ingest.song.sourceObjectPath,
          'application/octet-stream',
        );
        return {
          songId: ingest.song.id,
          instant: false,
          uploadUrl,
          status: 'RETRY_UPLOAD',
        };
      }

      if (alreadyInLibrary) {
        throw new ConflictException({
          code: 'SONG_ALREADY_IN_LIBRARY',
          message: 'Bài hát đã tồn tại trong thư viện của bạn',
        });
      }

      return {
        songId: ingest.song.id,
        instant: true,
        uploadUrl: '',
      };
    }

    const uploadUrl = await this.r2Service.createPresignedPutUrl(
      ingest.song.sourceObjectPath,
      'application/octet-stream',
    );

    return {
      songId: ingest.song.id,
      instant: false,
      uploadUrl,
      status: 'RETRY_UPLOAD',
    };
  }

  private isChecksumAlreadyExistsError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.message.includes('CHECKSUM_ALREADY_EXISTS');
  }

  private isSongAlreadyInLibraryError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.message.includes('SONG_ALREADY_IN_LIBRARY');
  }

  private isObjectMissingError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (statusCode === 404) return true;
    const message = error.message.toLowerCase();
    return message.includes('not found') || message.includes('no such key');
  }

  async finalizeUpload(request: FinalizeUploadDto) {
    let songId = request.songId;

    // If songId is not provided but checksum is, lookup by checksum
    if (!songId && request.checksum) {
      const songByChecksum = await this.getSongByChecksum({
        checksum: request.checksum,
      });
      if (!songByChecksum.song) {
        throw new NotFoundException({
          code: 'SONG_NOT_FOUND_BY_CHECKSUM',
          message: 'SONG_NOT_FOUND_BY_CHECKSUM',
        });
      }
      songId = songByChecksum.song.id;
    }

    if (!songId) {
      throw new BadRequestException({
        code: 'SONG_ID_OR_CHECKSUM_REQUIRED',
        message: 'SONG_ID_OR_CHECKSUM_REQUIRED',
      });
    }

    const lockKey = this.finalizeLockKey(songId);
    const lockTtlSec = this.parseFinalizeLockTtlSec();
    const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      // Global-asset behavior: finalize is not bound to uploader ownership.
      // Access control should be handled by route-level auth/internal token.

      const song = await this.getSongIngestInfo({
        songId,
      });

      if (!song.song || !song.song.sourceObjectPath) {
        throw new BadRequestException({
          code: 'SONG_SOURCE_PATH_MISSING',
          message: 'SONG_SOURCE_PATH_MISSING',
        });
      }

      const currentStatus = Number(song.song.status);

      if (currentStatus === SongStatus.SONG_STATUS_PROCESSING) {
        return { status: 'PROCESSING' };
      }

      if (currentStatus === SongStatus.SONG_STATUS_READY) {
        return { status: 'READY' };
      }

      const objectMeta = await this.r2Service.headObject(
        song.song.sourceObjectPath,
      );

      const expectedSize = Number(song.song.fileSizeBytes ?? 0);
      if (expectedSize > 0 && objectMeta.contentLength !== expectedSize) {
        throw new BadRequestException({
          code: 'UPLOAD_SIZE_MISMATCH',
          message: `UPLOAD_SIZE_MISMATCH expected=${expectedSize} actual=${objectMeta.contentLength}`,
        });
      }

      // Set PROCESSING before enqueue to keep state machine explicit.
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

      const jobPayload = {
        song_id: songId,
        r2_path: song.song.sourceObjectPath,
        checksum: song.song.checksum || '',
      };

      try {
        await this.redis.lpush(TRANSCODE_QUEUE, JSON.stringify(jobPayload));
      } catch (error) {
        // Rollback so caller can safely retry finalize.
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

      return { status: 'PROCESSING' };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('UPLOAD_SIZE_MISMATCH')) {
          throw new BadRequestException({
            code: 'UPLOAD_SIZE_MISMATCH',
            message: 'UPLOAD_SIZE_MISMATCH',
          });
        }

        if (error.message.includes('SONG_NOT_FOUND')) {
          throw new NotFoundException({
            code: 'SONG_NOT_FOUND',
            message: 'SONG_NOT_FOUND',
          });
        }
      }

      throw error;
    } finally {
      await this.releaseFinalizeLock(lockKey, lockValue);
    }
  }

  private buildQuarantineObjectKey(checksum: string, title: string) {
    const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `quarantine/${checksum}/${safeTitle}`;
  }

  private finalizeLockKey(songId: string) {
    return `song:finalize:lock:${songId}`;
  }

  private async releaseFinalizeLock(lockKey: string, lockValue: string) {
    const releaseScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

    try {
      await this.redis.eval(releaseScript, 1, lockKey, lockValue);
    } catch (error) {
      this.logger.warn(
        `Failed to release finalize lock safely for key=${lockKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
