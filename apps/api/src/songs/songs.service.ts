import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import type { Redis } from 'ioredis';
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
  ) {
    this.songServiceClient =
      this.client.getService<SongServiceClient>('SongService');
  }

  onModuleInit() {
    this.songServiceClient =
      this.client.getService<SongServiceClient>('SongService');
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
    return await firstValueFrom(
      this.songServiceClient.getSongIngestInfo(data),
    );
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
      return {
        songId: existing.song.id,
        instant: true,
        uploadUrl: '',
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
  }

  async finalizeUpload(request: FinalizeUploadDto) {
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

    const song = await this.getSongIngestInfo({
      songId,
    });

    if (!song.song || !song.song.sourceObjectPath) {
      throw new Error('SONG_SOURCE_PATH_MISSING');
    }

    const downloadUrl = await this.r2Service.createPresignedGetUrl(
      song.song.sourceObjectPath,
    );

    const jobPayload = {
      song_id: songId,
      r2_path: song.song.sourceObjectPath,
      checksum: song.song.checksum || '',
      file_url: downloadUrl,
    };

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

    try {
      await this.redis.lpush(
        TRANSCODE_QUEUE,
        JSON.stringify(jobPayload),
      );
    } catch (error) {
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
  }

  private buildQuarantineObjectKey(checksum: string, title: string) {
    const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `quarantine/${checksum}/${safeTitle}`;
  }
}
