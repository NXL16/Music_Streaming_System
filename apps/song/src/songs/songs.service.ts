import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type Redis from 'ioredis';
import {
  GetSongRequest,
  GetSongResponse,
  GetSongByChecksumRequest,
  GetSongByChecksumResponse,
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
  SongSummary,
  SongDetail,
  SongIngestInfo,
  GetSongIngestInfoRequest,
  GetSongIngestInfoResponse,
} from '@musical/shared-proto';
import { SONG_ASSET_CLEANUP_QUEUE } from '@musical/shared-types';
import { PrismaService } from '../database/prisma.service';
import { Prisma, PrismaClient } from '../generated/prisma/client';

const songSummarySelect = {
  id: true,
  status: true,
  durationSec: true,
  createdAt: true,
  owners: {
    select: {
      userId: true,
      isPublic: true,
      title: true,
      artist: true,
      album: true,
      coverUrl: true,
    },
  },
} as const;

const songDetailSelect = {
  id: true,
  status: true,
  encryptedFilePath: true,
  durationSec: true,
  bitrateKbps: true,
  codec: true,
  format: true,
  createdAt: true,
  updatedAt: true,
  owners: {
    select: {
      userId: true,
      isPublic: true,
      title: true,
      artist: true,
      album: true,
      coverUrl: true,
    },
  },
} as const;

const songIngestSelect = {
  id: true,
  status: true,
  sourceObjectPath: true,
  checksum: true,
  fileSizeBytes: true,
  createdAt: true,
} as const;

type SongSummaryEntity = Prisma.SongGetPayload<{
  select: typeof songSummarySelect;
}>;
type SongDetailEntity = Prisma.SongGetPayload<{
  select: typeof songDetailSelect;
}>;
type SongIngestEntity = Prisma.SongGetPayload<{
  select: typeof songIngestSelect;
}>;

const MAX_LIST_LIMIT = 50;

type WorkerSongCompletionEvent = {
  song_id: string;
  status: 'success' | 'error';
  duration_sec?: number | null;
  encrypted_file_path?: string | null;
  bitrate_kbps?: number | null;
  codec?: string | null;
  format?: string | null;
  error_message?: string | null;
};

type AssetCleanupOutboxRepo = {
  upsert(args: {
    where: { songId: string };
    update: {
      sourceObjectPath: string;
      encryptedFilePath: string;
      lastError: string;
    };
    create: {
      songId: string;
      sourceObjectPath: string;
      encryptedFilePath: string;
      lastError: string;
    };
  }): Promise<unknown>;
};

@Injectable()
export class SongsService {
  private readonly logger = new Logger(SongsService.name);
  private readonly prisma: PrismaClient;

  constructor(
    prismaService: PrismaService,
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
  ) {
    this.prisma = prismaService;
  }

  async createSongRecord(
    request: CreateSongRecordRequest,
  ): Promise<CreateSongRecordResponse> {
    try {
      if (!request.uploaderId) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'UPLOADER_ID_REQUIRED',
        });
      }

      if (!request.sourceObjectPath) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'SOURCE_OBJECT_PATH_REQUIRED',
        });
      }

      if (!request.checksum) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'CHECKSUM_REQUIRED',
        });
      }

      const existingSong = await this.prisma.song.findUnique({
        where: { checksum: request.checksum },
        select: songIngestSelect,
      });

      if (existingSong) {
        const existingOwner = await this.prisma.songOwner.findUnique({
          where: {
            songId_userId: {
              songId: existingSong.id,
              userId: request.uploaderId,
            },
          },
          select: { id: true },
        });

        if (existingOwner) {
          throw new RpcException({
            code: status.ALREADY_EXISTS,
            message: 'SONG_ALREADY_IN_LIBRARY',
          });
        }

        await this.prisma.songOwner.upsert({
          where: {
            songId_userId: {
              songId: existingSong.id,
              userId: request.uploaderId,
            },
          },
          update: {
            isPublic: request.isPublic ?? true,
            title: request.title,
            artist: request.artist,
            album: request.album,
          },
          create: {
            songId: existingSong.id,
            userId: request.uploaderId,
            isPublic: request.isPublic ?? true,
            title: request.title,
            artist: request.artist,
            album: request.album,
          },
        });

        return {
          song: this.mapEntityToIngestInfo(existingSong),
          ingestJobId: existingSong.id,
        };
      }

      const savedSong = await this.prisma.song.create({
        data: {
          title: request.title,
          artist: request.artist,
          album: request.album,
          uploaderId: request.uploaderId,
          isPublic: request.isPublic ?? true,
          sourceObjectPath: request.sourceObjectPath,
          checksum: request.checksum,
          fileSizeBytes: BigInt(request.fileSizeBytes ?? 0),
          status: SongStatus.SONG_STATUS_PENDING,
          owners: {
            create: {
              userId: request.uploaderId,
              isPublic: request.isPublic ?? true,
              title: request.title,
              artist: request.artist,
              album: request.album,
            },
          },
        },
        select: songIngestSelect,
      });

      return {
        song: this.mapEntityToIngestInfo(savedSong),
        ingestJobId: savedSong.id,
      };
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.song.findUnique({
          where: { checksum: request.checksum },
          select: songIngestSelect,
        });
        if (existing) {
          const existingOwner = await this.prisma.songOwner.findUnique({
            where: {
              songId_userId: {
                songId: existing.id,
                userId: request.uploaderId,
              },
            },
            select: { id: true },
          });

          if (existingOwner) {
            throw new RpcException({
              code: status.ALREADY_EXISTS,
              message: 'SONG_ALREADY_IN_LIBRARY',
            });
          }

          await this.prisma.songOwner.upsert({
            where: {
              songId_userId: {
                songId: existing.id,
                userId: request.uploaderId,
              },
            },
            update: {
              isPublic: request.isPublic ?? true,
              title: request.title,
              artist: request.artist,
              album: request.album,
            },
            create: {
              songId: existing.id,
              userId: request.uploaderId,
              isPublic: request.isPublic ?? true,
              title: request.title,
              artist: request.artist,
              album: request.album,
            },
          });

          return {
            song: this.mapEntityToIngestInfo(existing),
            ingestJobId: existing.id,
          };
        }

        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: 'CHECKSUM_ALREADY_EXISTS',
        });
      }

      throw new RpcException({ code: status.INTERNAL, message: 'DB_ERROR' });
    }
  }

  async updateSongProcessingResult(
    request: UpdateSongProcessingResultRequest,
  ): Promise<UpdateSongProcessingResultResponse> {
    try {
      if (!request.songId) {
        this.throwInvalidArgument('SONG_ID_REQUIRED');
      }

      const updateData: Prisma.SongUpdateInput = {
        status: request.status,
      };

      if (Number(request.status) === SongStatus.SONG_STATUS_READY) {
        updateData.encryptedFilePath = request.encryptedFilePath;
        updateData.durationSec = request.durationSec;
        updateData.bitrateKbps = request.bitrateKbps;
        updateData.codec = request.codec;
        updateData.format = request.format;
      }

      const result = await this.prisma.song.updateMany({
        where: { id: request.songId },
        data: updateData,
      });

      if (result.count === 0) {
        this.throwNotFound('SONG_NOT_FOUND');
      }

      return { success: true };
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({ code: status.INTERNAL, message: 'DB_ERROR' });
    }
  }

  async getSong(request: GetSongRequest): Promise<GetSongResponse> {
    if (!request.songId) {
      this.throwInvalidArgument('SONG_ID_REQUIRED');
    }

    const song = await this.prisma.song.findUnique({
      where: { id: request.songId },
      select: songDetailSelect,
    });
    if (!song) {
      this.throwNotFound('SONG_NOT_FOUND');
    }

    const requesterUserId = request.requesterUserId?.trim() || '';
    const ownerProfile = requesterUserId
      ? song.owners.find((owner) => owner.userId === requesterUserId)
      : song.owners.find((owner) => owner.isPublic);

    if (!ownerProfile) {
      this.throwPermissionDenied('SONG_ACCESS_DENIED');
    }

    return { song: this.mapEntityToDetail(song, ownerProfile) };
  }

  async getSongByChecksum(
    request: GetSongByChecksumRequest,
  ): Promise<GetSongByChecksumResponse> {
    if (!request.checksum) {
      this.throwInvalidArgument('CHECKSUM_REQUIRED');
    }

    const song = await this.prisma.song.findUnique({
      where: { checksum: request.checksum },
      select: songIngestSelect,
    });

    if (!song) {
      return { song: undefined, found: false };
    }

    return { song: this.mapEntityToIngestInfo(song), found: true };
  }

  async getSongIngestInfo(
    request: GetSongIngestInfoRequest,
  ): Promise<GetSongIngestInfoResponse> {
    if (!request.songId) {
      this.throwInvalidArgument('SONG_ID_REQUIRED');
    }

    const song = await this.prisma.song.findUnique({
      where: { id: request.songId },
      select: songIngestSelect,
    });

    if (!song) {
      this.throwNotFound('SONG_NOT_FOUND');
    }

    return { song: this.mapEntityToIngestInfo(song) };
  }

  async listSongs(request: ListSongsRequest): Promise<ListSongsResponse> {
    const requestedLimit = request.limit || 10;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIST_LIMIT);
    const cursor = this.parseCursor(request.cursor);
    const search = request.search?.trim();
    const artist = request.artist?.trim();

    const filters: Prisma.SongWhereInput[] = [{ status: SongStatus.SONG_STATUS_READY }];
    const requesterUserId = request.requesterUserId?.trim() || '';
    const ownerFilter: Prisma.SongOwnerWhereInput = request.onlyPublic
      ? { isPublic: true }
      : requesterUserId
        ? { userId: requesterUserId }
        : { isPublic: true };

    const ownerSearchFilters: Prisma.SongOwnerWhereInput[] = [ownerFilter];
    if (artist) {
      ownerSearchFilters.push({
        artist: { contains: artist, mode: 'insensitive' },
      });
    }
    if (search) {
      ownerSearchFilters.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { album: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    filters.push({
      owners: {
        some: ownerSearchFilters.length === 1 ? ownerSearchFilters[0] : { AND: ownerSearchFilters },
      },
    });

    if (cursor) {
      filters.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const songs = await this.prisma.song.findMany({
      where: { AND: filters },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: songSummarySelect,
    });
    const hasMore = songs.length > limit;
    const resultSongs: SongSummaryEntity[] = hasMore
      ? songs.slice(0, limit)
      : songs;

    return {
      songs: resultSongs.map(
        (song): SongSummary =>
          this.mapEntityToSummary(song, requesterUserId, request.onlyPublic),
      ),
      nextCursor: hasMore
        ? this.buildCursor(resultSongs[resultSongs.length - 1])
        : '',
      hasMore,
    };
  }

  addFavorite(request: FavoriteRequest): Promise<FavoriteResponse> {
    this.logger.log(`User ${request.userId} liked song ${request.songId}`);
    return Promise.resolve({ success: true });
  }

  removeFavorite(request: FavoriteRequest): Promise<FavoriteResponse> {
    this.logger.log(`User ${request.userId} unliked song ${request.songId}`);
    return Promise.resolve({ success: true });
  }

  async removeSongOwnership(
    request: RemoveSongOwnershipRequest,
  ): Promise<RemoveSongOwnershipResponse> {
    if (!request.userId) {
      this.throwInvalidArgument('USER_ID_REQUIRED');
    }
    if (!request.songId) {
      this.throwInvalidArgument('SONG_ID_REQUIRED');
    }

    let cleanupPayload:
      | {
          song_id: string;
          source_object_path: string;
          encrypted_file_path: string;
        }
      | undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.songOwner.deleteMany({
        where: {
          songId: request.songId,
          userId: request.userId,
        },
      });

      const ownerCount = await tx.songOwner.count({
        where: { songId: request.songId },
      });

      if (ownerCount === 0) {
        const song = await tx.song.findUnique({
          where: { id: request.songId },
          select: {
            id: true,
            sourceObjectPath: true,
            encryptedFilePath: true,
          },
        });

        await tx.song.deleteMany({
          where: { id: request.songId },
        });

        if (song) {
          cleanupPayload = {
            song_id: song.id,
            source_object_path: song.sourceObjectPath || '',
            encrypted_file_path: song.encryptedFilePath || '',
          };
        }
      }
    });

    if (cleanupPayload) {
      try {
        await this.redis.lpush(
          SONG_ASSET_CLEANUP_QUEUE,
          JSON.stringify(cleanupPayload),
        );
        this.logger.log(
          `Queued asset cleanup for song ${cleanupPayload.song_id} source=${cleanupPayload.source_object_path || '<empty>'} encrypted=${cleanupPayload.encrypted_file_path || '<empty>'}`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        await this.outboxRepo().upsert({
          where: { songId: cleanupPayload.song_id },
          update: {
            sourceObjectPath: cleanupPayload.source_object_path,
            encryptedFilePath: cleanupPayload.encrypted_file_path,
            lastError: message,
          },
          create: {
            songId: cleanupPayload.song_id,
            sourceObjectPath: cleanupPayload.source_object_path,
            encryptedFilePath: cleanupPayload.encrypted_file_path,
            lastError: message,
          },
        });
        this.logger.warn(
          `Stored asset cleanup outbox for song ${cleanupPayload.song_id} after queue failure: ${message}`,
        );
      }
    }

    this.logger.log(`User ${request.userId} unlinked ownership for song ${request.songId}`);
    return { success: true };
  }

  getPlaylist(request: GetPlaylistRequest): Promise<GetPlaylistResponse> {
    return Promise.resolve({
      playlist: {
        id: request.playlistId,
        name: 'My Playlist',
        ownerId: request.requesterUserId,
        songs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });
  }

  async applyWorkerCompletion(event: WorkerSongCompletionEvent): Promise<void> {
    const succeeded = event.status === 'success';

    await this.updateSongProcessingResult({
      songId: event.song_id,
      status: succeeded
        ? SongStatus.SONG_STATUS_READY
        : SongStatus.SONG_STATUS_FAILED,
      encryptedFilePath:
        event.encrypted_file_path || this.buildProcessedObjectPath(event.song_id),
      durationSec: succeeded ? Math.max(0, Math.round(event.duration_sec ?? 0)) : 0,
      bitrateKbps: succeeded ? event.bitrate_kbps ?? 128 : 0,
      codec: succeeded ? event.codec ?? 'aac' : '',
      format: succeeded ? event.format ?? 'fmp4' : '',
      errorMessage: event.error_message ?? '',
    });
  }

  private mapEntityToSummary(
    entity: SongSummaryEntity,
    requesterUserId: string,
    onlyPublic: boolean,
  ): SongSummary {
    const ownerProfile =
      (!onlyPublic && requesterUserId
        ? entity.owners.find((owner) => owner.userId === requesterUserId)
        : undefined) ?? entity.owners.find((owner) => owner.isPublic) ?? entity.owners[0];

    return {
      id: entity.id,
      title: ownerProfile?.title || '',
      artist: ownerProfile?.artist || '',
      album: ownerProfile?.album || '',
      coverUrl: ownerProfile?.coverUrl || '',
      isPublic: ownerProfile?.isPublic ?? false,
      status: entity.status,
      durationSec: entity.durationSec || 0,
      createdAt: entity.createdAt.getTime(),
    };
  }

  private mapEntityToDetail(
    entity: SongDetailEntity,
    ownerProfile: SongDetailEntity['owners'][number],
  ): SongDetail {
    return {
      id: entity.id,
      title: ownerProfile.title || '',
      artist: ownerProfile.artist || '',
      album: ownerProfile.album || '',
      uploaderId: ownerProfile.userId,
      isPublic: ownerProfile.isPublic,
      status: entity.status,
      encryptedFilePath: entity.encryptedFilePath || '',
      durationSec: entity.durationSec || 0,
      bitrateKbps: entity.bitrateKbps || 0,
      codec: entity.codec || '',
      format: entity.format || 'fmp4',
      createdAt: entity.createdAt.getTime(),
      updatedAt: entity.updatedAt.getTime(),
    };
  }

  private mapEntityToIngestInfo(entity: SongIngestEntity): SongIngestInfo {
    return {
      id: entity.id,
      status: entity.status,
      sourceObjectPath: entity.sourceObjectPath || '',
      checksum: entity.checksum || '',
      fileSizeBytes: Number(entity.fileSizeBytes ?? 0),
      createdAt: entity.createdAt.getTime(),
    };
  }

  private parseCursor(cursor: string | undefined) {
    if (!cursor) return null;
    const [ts, id] = cursor.split(':');
    const timestamp = Number(ts);
    if (!id || Number.isNaN( timestamp)) {
      this.throwInvalidArgument('CURSOR_INVALID');
    }
    return { createdAt: new Date(timestamp), id };
  }

  private buildCursor(entity: SongSummaryEntity): string {
    return `${entity.createdAt.getTime()}:${entity.id}`;
  }

  private buildProcessedObjectPath(songId: string) {
    return `processed/${songId}.m4a`;
  }

  private outboxRepo(): AssetCleanupOutboxRepo {
    return (
      this.prisma as unknown as { assetCleanupOutbox: AssetCleanupOutboxRepo }
    ).assetCleanupOutbox;
  }

  private throwInvalidArgument(message: string): never {
    throw new RpcException({ code: status.INVALID_ARGUMENT, message });
  }

  private throwNotFound(message: string): never {
    throw new RpcException({ code: status.NOT_FOUND, message });
  }

  private throwPermissionDenied(message: string): never {
    throw new RpcException({ code: status.PERMISSION_DENIED, message });
  }
}
