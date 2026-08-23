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
  ListFavoriteSongsRequest,
  ListFavoriteSongsResponse,
  UpsertFavoriteArtworkRequest,
  FavoriteArtworkResponse,
  LibraryResourceRequest,
  LibraryResourceResponse,
  ListLibraryResourcesRequest,
  ListLibraryResourcesResponse,
  ListLibrarySongsRequest,
  ListLibrarySongsResponse,
  RemoveSongOwnershipRequest,
  RemoveSongOwnershipResponse,
  GetPlaylistRequest,
  GetPlaylistResponse,
  ListPlaylistTracksRequest,
  ListPlaylistTracksResponse,
  SongStatus,
  AudioMode,
  SongSummary,
  SongDetail,
  SongIngestInfo,
  GetSongIngestInfoRequest,
  GetSongIngestInfoResponse,
  ProtobufStruct,
} from '@musical/shared-proto';
import { getArtworkRenditionSrcSet } from '@musical/shared-types';
import { PrismaService } from '../database/prisma.service';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { CatalogAssetsService } from './catalog-assets.service';

const songSummarySelect = {
  id: true,
  status: true,
  isCatalog: true,
  audioMode: true,
  contentRating: true,
  durationSec: true,
  artwork: true,
  catalogTitle: true,
  albumName: true,
  artistName: true,
  createdAt: true,
  owners: {
    select: {
      userId: true,
      isPublic: true,
      title: true,
      artist: true,
      album: true,
      coverUrl: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
  albumTracks: {
    orderBy: { position: 'asc' },
    take: 1,
    select: { album: { select: { id: true, url: true } } },
  },
  artistCredits: {
    where: { role: { not: 'composer' } },
    orderBy: { position: 'asc' },
    select: { artist: { select: { id: true, name: true, url: true } } },
  },
} as const;

const songDetailSelect = {
  id: true,
  status: true,
  audioMode: true,
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
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} as const;

const songIngestSelect = {
  id: true,
  status: true,
  audioMode: true,
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
const SONG_STATUS_READY = Number(SongStatus.SONG_STATUS_READY);

type WorkerSongCompletionEvent = {
  song_id: string;
  metadata_version: number;
  status: 'success' | 'error';
  duration_sec?: number | null;
  encrypted_file_path?: string | null;
  bitrate_kbps?: number | null;
  codec?: string | null;
  format?: string | null;
  error_message?: string | null;
  mood_tags?: string[] | null;
  mood_analysis_version?: string | null;
  mood_analysis_scores?: Record<string, number> | null;
};

@Injectable()
export class SongsService {
  private readonly logger = new Logger(SongsService.name);
  private readonly prisma: PrismaClient;

  constructor(
    prismaService: PrismaService,
    @Inject('REDIS_INSTANCE') private readonly redis: Redis,
    private readonly catalogAssetsService: CatalogAssetsService,
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
          sourceObjectPath: request.sourceObjectPath,
          audioMode:
            request.audioMode === AudioMode.AUDIO_MODE_SING
              ? 'SING'
              : 'STANDARD',
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

      if (request.status === SongStatus.SONG_STATUS_READY) {
        updateData.encryptedFilePath = request.encryptedFilePath;
        updateData.durationSec = request.durationSec;
        updateData.bitrateKbps = request.bitrateKbps;
        updateData.codec = request.codec;
        updateData.format = request.format;
      }

      await this.prisma.$transaction(async (tx) => {
        const song = await tx.song.findUnique({
          where: { id: request.songId },
          select: {
            id: true,
            sourceObjectPath: true,
            checksum: true,
            audioMode: true,
          },
        });
        if (!song) this.throwNotFound('SONG_NOT_FOUND');

        const updatedSong = await tx.song.update({
          where: { id: request.songId },
          data:
            request.status === SongStatus.SONG_STATUS_PROCESSING
              ? {
                  ...updateData,
                  transcodeVersion: { increment: 1 },
                }
              : updateData,
          select: { transcodeVersion: true },
        });

        if (request.status === SongStatus.SONG_STATUS_PROCESSING) {
          if (!song.sourceObjectPath)
            this.throwInvalidArgument('SONG_SOURCE_PATH_MISSING');
          await tx.transcodeOutbox.upsert({
            where: { songId: song.id },
            update: {
              sourceObjectPath: song.sourceObjectPath,
              checksum: song.checksum || '',
              audioMode: song.audioMode,
              metadataVersion: updatedSong.transcodeVersion,
              availableAt: new Date(),
              lockedAt: null,
              lastError: '',
            },
            create: {
              songId: song.id,
              sourceObjectPath: song.sourceObjectPath,
              checksum: song.checksum || '',
              audioMode: song.audioMode,
              metadataVersion: updatedSong.transcodeVersion,
            },
          });
        }
      });

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

    const requesterUserId = request.requesterUserId?.trim() || '';
    // A signed-in user can read their own private profile or any public one.
    // Restrict the included relation to those candidates instead of loading
    // every owner of a shared song.
    const ownersWhere: Prisma.SongOwnerWhereInput = requesterUserId
      ? { OR: [{ userId: requesterUserId }, { isPublic: true }] }
      : { isPublic: true };

    const song = await this.prisma.song.findUnique({
      where: { id: request.songId },
      select: {
        ...songDetailSelect,
        owners: {
          ...songDetailSelect.owners,
          where: ownersWhere,
          take: requesterUserId ? 2 : 1,
        },
      },
    });
    if (!song) {
      this.throwNotFound('SONG_NOT_FOUND');
    }

    const ownerProfile = requesterUserId
      ? (song.owners.find((owner) => owner.userId === requesterUserId) ??
        song.owners.find((owner) => owner.isPublic))
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

    const requesterUserId = request.requesterUserId?.trim() || '';
    const isMyLibraryRequest = !request.onlyPublic && Boolean(requesterUserId);
    const filters: Prisma.SongWhereInput[] = isMyLibraryRequest
      ? []
      : [{ status: SongStatus.SONG_STATUS_READY }];
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
        some:
          ownerSearchFilters.length === 1
            ? ownerSearchFilters[0]
            : { AND: ownerSearchFilters },
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
      songs: resultSongs.map((song): SongSummary =>
        this.mapEntityToSummary(song, requesterUserId, request.onlyPublic),
      ),
      nextCursor: hasMore
        ? this.buildCursor(resultSongs[resultSongs.length - 1])
        : '',
      hasMore,
    };
  }

  async addFavorite(request: FavoriteRequest): Promise<FavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.songId) this.throwInvalidArgument('SONG_ID_REQUIRED');

    const song = await this.prisma.song.findUnique({
      where: { id: request.songId },
      select: { id: true },
    });
    if (!song) this.throwNotFound('SONG_NOT_FOUND');

    try {
      await this.prisma.favorite.create({
        data: {
          userId: request.userId,
          songId: request.songId,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Already favorited — treat as success
        return { success: true };
      }
      throw new RpcException({ code: status.INTERNAL, message: 'DB_ERROR' });
    }

    return { success: true };
  }

  async removeFavorite(request: FavoriteRequest): Promise<FavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.songId) this.throwInvalidArgument('SONG_ID_REQUIRED');

    await this.prisma.favorite.deleteMany({
      where: {
        userId: request.userId,
        songId: request.songId,
      },
    });

    return { success: true };
  }

  async listFavoriteSongs(
    request: ListFavoriteSongsRequest,
  ): Promise<ListFavoriteSongsResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');

    const requestedLimit = request.limit || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIST_LIMIT);
    const cursor = this.parseCursor(request.cursor);
    const where: Prisma.FavoriteWhereInput = { userId: request.userId };

    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    const favorites = await this.prisma.favorite.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        createdAt: true,
        song: { select: songSummarySelect },
      },
    });
    const hasMore = favorites.length > limit;
    const results = hasMore ? favorites.slice(0, limit) : favorites;

    const storedArtwork = await this.prisma.systemFavoriteArtwork.findUnique({
      where: { key: 'favorite' },
      select: { assetId: true, artwork: true },
    });

    return {
      songs: results.map(({ song }) =>
        this.mapEntityToSummary(song, request.userId, false),
      ),
      nextCursor: hasMore
        ? `${results[results.length - 1].createdAt.getTime()}:${results[results.length - 1].id}`
        : '',
      hasMore,
      collection: this.toProtobufStruct({
        key: 'favorite',
        title: 'Favourite Songs',
        description: 'Songs you loved',
        artworkAssetId: storedArtwork?.assetId ?? '',
        artwork: storedArtwork?.artwork,
      }),
    };
  }

  async upsertFavoriteArtwork(
    request: UpsertFavoriteArtworkRequest,
  ): Promise<FavoriteArtworkResponse> {
    if (!request.assetId.trim()) this.throwInvalidArgument('ASSET_ID_REQUIRED');
    const artwork = await this.catalogAssetsService.bindArtworkUsage({
      ownerService: 'song',
      ownerType: 'system-favorite',
      ownerId: 'favorite',
      assetId: request.assetId,
    });
    await this.prisma.systemFavoriteArtwork.upsert({
      where: { key: 'favorite' },
      create: {
        key: 'favorite',
        assetId: request.assetId,
        artwork: artwork as Prisma.InputJsonObject,
      },
      update: {
        assetId: request.assetId,
        artwork: artwork as Prisma.InputJsonObject,
      },
    });
    return {
      assetId: request.assetId,
      artwork: this.toProtobufStruct(artwork),
    };
  }

  private toProtobufStruct(value: Record<string, unknown>): ProtobufStruct {
    return {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.toProtobufValue(item),
        ]),
      ),
    };
  }

  private toProtobufValue(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) return { nullValue: 0 };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return { numberValue: value };
    if (typeof value === 'boolean') return { boolValue: value };
    if (Array.isArray(value)) {
      return {
        listValue: { values: value.map((item) => this.toProtobufValue(item)) },
      };
    }
    if (typeof value === 'object') {
      return {
        structValue: this.toProtobufStruct(value as Record<string, unknown>),
      };
    }
    return { nullValue: 0 };
  }

  async addLibraryResource(
    request: LibraryResourceRequest,
  ): Promise<LibraryResourceResponse> {
    if (
      !request.userId ||
      !request.resourceId ||
      !['songs', 'albums', 'playlists'].includes(request.resourceType)
    ) {
      this.throwInvalidArgument('LIBRARY_RESOURCE_INVALID');
    }
    await this.prisma.userLibraryResource.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId: request.userId,
          resourceType: request.resourceType,
          resourceId: request.resourceId,
        },
      },
      update: {
        title: request.title || undefined,
        subtitle: request.subtitle || undefined,
        artworkUrl: request.artworkUrl || undefined,
      },
      create: {
        userId: request.userId,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        title: request.title,
        subtitle: request.subtitle,
        artworkUrl: request.artworkUrl,
      },
    });
    return { success: true, deletedUserPlaylist: false };
  }

  async listLibraryResources(
    request: ListLibraryResourcesRequest,
  ): Promise<ListLibraryResourcesResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    const resources = await this.prisma.userLibraryResource.findMany({
      where: { userId: request.userId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      resources: resources.map((resource) => ({
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        title: resource.title,
        subtitle: resource.subtitle,
        artworkUrl: resource.artworkUrl,
        createdAt: resource.createdAt.getTime(),
        isPinned: resource.isPinned,
        pinnedAt: resource.pinnedAt?.getTime() ?? 0,
      })),
    };
  }

  async listLibrarySongs(
    request: ListLibrarySongsRequest,
  ): Promise<ListLibrarySongsResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');

    const limit = Math.min(Math.max(request.limit || 40, 1), 100);
    const isTitleSort = request.sortBy === 'title';
    const direction = request.direction === 'ascending' ? 'asc' : 'desc';
    const songIds = [...new Set(request.songIds.filter(Boolean))];
    const baseWhere: Prisma.UserLibraryResourceWhereInput = {
      userId: request.userId,
      resourceType: 'songs',
      ...(songIds.length ? { resourceId: { in: songIds } } : {}),
    };
    const cursorWhere = this.librarySongsCursorFilter(
      request.cursor,
      isTitleSort,
      direction,
    );
    const rows = await this.prisma.userLibraryResource.findMany({
      where: cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere,
      orderBy: isTitleSort
        ? [{ title: direction }, { resourceId: direction }]
        : [{ createdAt: direction }, { resourceId: direction }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const resources = rows.slice(0, limit);
    const lastResource = resources.at(-1);

    return {
      resources: resources.map((resource) => ({
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        title: resource.title,
        subtitle: resource.subtitle,
        artworkUrl: resource.artworkUrl,
        createdAt: resource.createdAt.getTime(),
        isPinned: resource.isPinned,
        pinnedAt: resource.pinnedAt?.getTime() ?? 0,
      })),
      nextCursor:
        hasMore && lastResource
          ? this.buildLibrarySongsCursor(lastResource, isTitleSort)
          : '',
      hasMore,
    };
  }

  private librarySongsCursorFilter(
    cursor: string | undefined,
    isTitleSort: boolean,
    direction: 'asc' | 'desc',
  ): Prisma.UserLibraryResourceWhereInput | undefined {
    if (!cursor) return undefined;

    let payload: { key?: unknown; resourceId?: unknown };
    try {
      payload = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { key?: unknown; resourceId?: unknown };
    } catch {
      this.throwInvalidArgument('CURSOR_INVALID');
    }
    if (typeof payload!.resourceId !== 'string') {
      this.throwInvalidArgument('CURSOR_INVALID');
    }

    const comparison = direction === 'asc' ? 'gt' : 'lt';
    if (isTitleSort) {
      if (typeof payload!.key !== 'string') {
        this.throwInvalidArgument('CURSOR_INVALID');
      }
      return {
        OR: [
          { title: { [comparison]: payload!.key } },
          {
            title: payload!.key,
            resourceId: { [comparison]: payload!.resourceId },
          },
        ],
      };
    }

    if (typeof payload!.key !== 'number') {
      this.throwInvalidArgument('CURSOR_INVALID');
    }
    const createdAt = new Date(payload!.key);
    if (Number.isNaN(createdAt.getTime())) {
      this.throwInvalidArgument('CURSOR_INVALID');
    }
    return {
      OR: [
        { createdAt: { [comparison]: createdAt } },
        {
          createdAt,
          resourceId: { [comparison]: payload!.resourceId },
        },
      ],
    };
  }

  private buildLibrarySongsCursor(
    resource: { title: string; createdAt: Date; resourceId: string },
    isTitleSort: boolean,
  ) {
    return Buffer.from(
      JSON.stringify({
        key: isTitleSort ? resource.title : resource.createdAt.getTime(),
        resourceId: resource.resourceId,
      }),
    ).toString('base64url');
  }

  async removeLibraryResource(
    request: LibraryResourceRequest,
  ): Promise<LibraryResourceResponse> {
    let deletedUserPlaylist = false;
    await this.prisma.$transaction(async (tx) => {
      if (request.resourceType === 'playlists') {
        const ownedPlaylist = await tx.userPlaylist.findFirst({
          where: { id: request.resourceId, userId: request.userId },
          select: { id: true },
        });

        if (ownedPlaylist) {
          await tx.userPlaylist.delete({ where: { id: ownedPlaylist.id } });
          deletedUserPlaylist = true;
        }
      }

      await tx.userLibraryResource.deleteMany({
        where: {
          userId: request.userId,
          resourceType: request.resourceType,
          resourceId: request.resourceId,
        },
      });
    });
    return { success: true, deletedUserPlaylist };
  }

  async pinLibraryResource(
    request: LibraryResourceRequest,
  ): Promise<LibraryResourceResponse> {
    const result = await this.prisma.userLibraryResource.updateMany({
      where: {
        userId: request.userId,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
      },
      data: { isPinned: true, pinnedAt: new Date() },
    });
    if (!result.count) this.throwNotFound('LIBRARY_RESOURCE_NOT_FOUND');
    return { success: true, deletedUserPlaylist: false };
  }

  async unpinLibraryResource(
    request: LibraryResourceRequest,
  ): Promise<LibraryResourceResponse> {
    await this.prisma.userLibraryResource.updateMany({
      where: {
        userId: request.userId,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
      },
      data: { isPinned: false, pinnedAt: null },
    });
    return { success: true, deletedUserPlaylist: false };
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

    await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent owner removals for the same song. Without this
      // row lock, two requests can each observe the other owner then both
      // commit, leaving an unowned song with no cleanup intent.
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "songs" WHERE "id" = ${request.songId} FOR UPDATE
      `);
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
            isCatalog: true,
            sourceObjectPath: true,
            encryptedFilePath: true,
          },
        });

        if (!song?.isCatalog) {
          // The outbox has no foreign key so it must be cancelled explicitly;
          // otherwise an already queued publisher can transcode a deleted song.
          await tx.transcodeOutbox.deleteMany({
            where: { songId: request.songId },
          });
          await tx.song.deleteMany({
            where: { id: request.songId },
          });
        }

        if (song && !song.isCatalog) {
          await tx.assetCleanupOutbox.upsert({
            where: { songId: song.id },
            update: {
              sourceObjectPath: song.sourceObjectPath || '',
              encryptedFilePath: song.encryptedFilePath || '',
              lastError: '',
            },
            create: {
              songId: song.id,
              sourceObjectPath: song.sourceObjectPath || '',
              encryptedFilePath: song.encryptedFilePath || '',
            },
          });
        }
      }
    });

    this.logger.log(
      `User ${request.userId} unlinked ownership for song ${request.songId}`,
    );
    return { success: true };
  }

  async getPlaylist(request: GetPlaylistRequest): Promise<GetPlaylistResponse> {
    if (!request.playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');

    const requesterUserId = request.requesterUserId?.trim() || '';

    const playlist = await this.prisma.userPlaylist.findUnique({
      where: { id: request.playlistId },
      include: {
        tracks: {
          take: request.includeSongs ? undefined : 0,
          include: {
            song: {
              select: songSummarySelect,
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!playlist) this.throwNotFound('PLAYLIST_NOT_FOUND');

    if (!playlist.isPublic && playlist.userId !== requesterUserId) {
      this.throwPermissionDenied('PLAYLIST_ACCESS_DENIED');
    }
    const visibleTracks =
      playlist.isPublic && playlist.userId !== requesterUserId
        ? playlist.tracks.filter(({ song }) => this.isPubliclyPlayable(song))
        : playlist.tracks;

    return {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        artworkUrl: playlist.coverUrl,
        ownerId: playlist.userId,
        songs: visibleTracks.map(({ song }) =>
          this.mapEntityToSummary(song, requesterUserId, true),
        ),
        createdAt: playlist.createdAt.getTime(),
        updatedAt: playlist.updatedAt.getTime(),
      },
    };
  }

  async listPlaylistTracks(
    request: ListPlaylistTracksRequest,
  ): Promise<ListPlaylistTracksResponse> {
    if (!request.playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');

    const playlist = await this.prisma.userPlaylist.findUnique({
      where: { id: request.playlistId },
      select: { userId: true, isPublic: true },
    });
    if (!playlist) this.throwNotFound('PLAYLIST_NOT_FOUND');

    const requesterUserId = request.requesterUserId?.trim() || '';
    if (!playlist.isPublic && playlist.userId !== requesterUserId) {
      this.throwPermissionDenied('PLAYLIST_ACCESS_DENIED');
    }

    const requestedLimit = request.limit || 40;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIST_LIMIT);
    const cursor = request.cursor?.trim();
    const cursorPosition = cursor ? Number(cursor) : undefined;
    if (
      cursor &&
      (!Number.isSafeInteger(cursorPosition) || (cursorPosition ?? -1) < 0)
    ) {
      this.throwInvalidArgument('CURSOR_INVALID');
    }

    const tracks = await this.prisma.userPlaylistTrack.findMany({
      where: {
        playlistId: request.playlistId,
        ...(playlist.isPublic && playlist.userId !== requesterUserId
          ? this.publicPlaylistTrackWhere()
          : {}),
        ...(cursorPosition === undefined
          ? {}
          : { position: { gt: cursorPosition } }),
      },
      orderBy: { position: 'asc' },
      take: limit + 1,
      select: { position: true, song: { select: songSummarySelect } },
    });
    const hasMore = tracks.length > limit;
    const page = hasMore ? tracks.slice(0, limit) : tracks;

    return {
      songs: page.map(({ song }) =>
        this.mapEntityToSummary(song, requesterUserId, true),
      ),
      nextCursor: hasMore ? String(page[page.length - 1].position) : '',
      hasMore,
    };
  }

  async createUserPlaylist(
    userId: string,
    name: string,
    description: string,
    isPublic: boolean,
  ) {
    if (!userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!name.trim()) this.throwInvalidArgument('PLAYLIST_NAME_REQUIRED');

    const playlist = await this.prisma.$transaction(async (tx) => {
      const createdPlaylist = await tx.userPlaylist.create({
        data: {
          userId,
          name: name.trim(),
          description: description?.trim() || '',
          isPublic,
        },
      });

      await tx.userLibraryResource.create({
        data: {
          userId,
          resourceType: 'playlists',
          resourceId: createdPlaylist.id,
          title: createdPlaylist.name,
          subtitle: '',
          artworkUrl: '',
        },
      });

      return createdPlaylist;
    });

    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      isPublic: playlist.isPublic,
      createdAt: playlist.createdAt.getTime(),
      updatedAt: playlist.updatedAt.getTime(),
      artworkUrl: playlist.coverUrl,
    };
  }

  async updateUserPlaylist(
    userId: string,
    playlistId: string,
    data: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      coverUrl?: string;
    },
  ) {
    if (!playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');

    const existing = await this.prisma.userPlaylist.findUnique({
      where: { id: playlistId },
      select: { userId: true },
    });
    if (!existing) this.throwNotFound('PLAYLIST_NOT_FOUND');
    if (existing.userId !== userId)
      this.throwPermissionDenied('PLAYLIST_ACCESS_DENIED');

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined)
      updateData.description = data.description.trim();
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;
    if (data.coverUrl !== undefined) updateData.coverUrl = data.coverUrl;

    const playlist = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userPlaylist.update({
        where: { id: playlistId },
        data: updateData,
      });
      if (data.coverUrl !== undefined) {
        await tx.userLibraryResource.updateMany({
          where: {
            userId,
            resourceType: 'playlists',
            resourceId: playlistId,
          },
          data: { artworkUrl: data.coverUrl },
        });
      }
      return updated;
    });

    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      isPublic: playlist.isPublic,
      createdAt: playlist.createdAt.getTime(),
      updatedAt: playlist.updatedAt.getTime(),
      artworkUrl: playlist.coverUrl,
    };
  }

  async deleteUserPlaylist(userId: string, playlistId: string) {
    if (!playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');

    const existing = await this.prisma.userPlaylist.findUnique({
      where: { id: playlistId },
      select: { userId: true },
    });
    if (!existing) this.throwNotFound('PLAYLIST_NOT_FOUND');
    if (existing.userId !== userId)
      this.throwPermissionDenied('PLAYLIST_ACCESS_DENIED');

    await this.prisma.$transaction(async (tx) => {
      await tx.userPlaylist.delete({ where: { id: playlistId } });
      await tx.userLibraryResource.deleteMany({
        where: {
          userId,
          resourceType: 'playlists',
          resourceId: playlistId,
        },
      });
    });
    return { success: true };
  }

  async listUserPlaylists(
    userId: string,
    requesterUserId: string,
    limit: number,
    cursor?: string,
  ) {
    const isSelf = userId === requesterUserId;
    const take = Math.min(Math.max(limit || 10, 1), MAX_LIST_LIMIT);
    const filters: Prisma.UserPlaylistWhereInput[] = [{ userId }];

    if (!isSelf) {
      filters.push({ isPublic: true });
    }

    if (cursor) {
      const [ts, id] = cursor.split(':');
      const timestamp = Number(ts);
      if (!id || Number.isNaN(timestamp)) {
        this.throwInvalidArgument('CURSOR_INVALID');
      }
      filters.push({
        OR: [
          { createdAt: { lt: new Date(timestamp) } },
          { createdAt: new Date(timestamp), id: { lt: id } },
        ],
      });
    }

    const visibleTrackWhere = isSelf
      ? undefined
      : this.publicPlaylistTrackWhere();
    const playlists = await this.prisma.userPlaylist.findMany({
      where: { AND: filters },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: {
        _count: {
          select: {
            tracks: visibleTrackWhere ? { where: visibleTrackWhere } : true,
          },
        },
        tracks: {
          take: 1,
          orderBy: { position: 'asc' },
          ...(visibleTrackWhere ? { where: visibleTrackWhere } : {}),
          select: { song: { select: songSummarySelect } },
        },
      },
    });

    const hasMore = playlists.length > take;
    const result = hasMore ? playlists.slice(0, take) : playlists;

    return {
      playlists: result.map((pl) => ({
        id: pl.id,
        name: pl.name,
        description: pl.description,
        isPublic: pl.isPublic,
        trackCount: pl._count.tracks,
        createdAt: pl.createdAt.getTime(),
        updatedAt: pl.updatedAt.getTime(),
        artworkUrl:
          pl.coverUrl ||
          (pl.tracks[0]
            ? this.mapEntityToSummary(
                pl.tracks[0].song,
                requesterUserId,
                !isSelf,
              ).coverUrl
            : ''),
      })),
      nextCursor: hasMore
        ? `${result[result.length - 1].createdAt.getTime()}:${result[result.length - 1].id}`
        : '',
      hasMore,
    };
  }

  async getPlaylistSourceMembership(userId: string, songIds: string[]) {
    if (!userId) this.throwInvalidArgument('USER_ID_REQUIRED');

    const uniqueSongIds = [...new Set(songIds.filter(Boolean))];
    if (!uniqueSongIds.length) return { playlistIds: [] };

    const playlists = await this.prisma.userPlaylist.findMany({
      where: { userId },
      select: {
        id: true,
        tracks: {
          where: { songId: { in: uniqueSongIds } },
          select: { songId: true },
        },
      },
    });

    return {
      playlistIds: playlists
        .filter(
          (playlist) =>
            new Set(playlist.tracks.map((track) => track.songId)).size ===
            uniqueSongIds.length,
        )
        .map((playlist) => playlist.id),
    };
  }

  async addTrackToPlaylist(userId: string, playlistId: string, songId: string) {
    if (!playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');
    if (!songId) this.throwInvalidArgument('SONG_ID_REQUIRED');

    try {
      await this.prisma.$transaction(async (tx) => {
        // A row lock serializes position allocation and prevents two callers
        // from adding different tracks at the same max(position) + 1.
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "user_playlists" WHERE "id" = ${playlistId} FOR UPDATE
        `);
        const playlist = await tx.userPlaylist.findUnique({
          where: { id: playlistId },
          select: { userId: true, isPublic: true },
        });
        if (!playlist) this.throwNotFound('PLAYLIST_NOT_FOUND');
        if (playlist.userId !== userId)
          this.throwPermissionDenied('PLAYLIST_ACCESS_DENIED');

        const song = await tx.song.findUnique({
          where: { id: songId },
          select: {
            id: true,
            isCatalog: true,
            status: true,
            owners: {
              where: { OR: [{ userId }, { isPublic: true }] },
              select: { userId: true, isPublic: true },
            },
          },
        });
        if (!song) this.throwNotFound('SONG_NOT_FOUND');

        const isOwner = song.owners.some((owner) => owner.userId === userId);
        const isPubliclyPlayable =
          song.status === SONG_STATUS_READY &&
          (song.isCatalog || song.owners.some((owner) => owner.isPublic));
        if (!isOwner && !isPubliclyPlayable) {
          this.throwPermissionDenied('SONG_ACCESS_DENIED');
        }
        if (playlist.isPublic && !isPubliclyPlayable) {
          this.throwPermissionDenied(
            'PUBLIC_PLAYLIST_REQUIRES_PUBLIC_READY_SONG',
          );
        }

        const existingTrack = await tx.userPlaylistTrack.findUnique({
          where: { playlistId_songId: { playlistId, songId } },
          select: { songId: true },
        });
        if (existingTrack) {
          throw new RpcException({
            code: status.ALREADY_EXISTS,
            message: 'TRACK_ALREADY_IN_PLAYLIST',
          });
        }

        const maxPosition = await tx.userPlaylistTrack.aggregate({
          where: { playlistId },
          _max: { position: true },
        });
        await tx.userPlaylistTrack.create({
          data: {
            playlistId,
            songId,
            position: (maxPosition._max.position ?? -1) + 1,
          },
        });
      });
    } catch (error: unknown) {
      if (error instanceof RpcException) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: 'TRACK_ALREADY_IN_PLAYLIST',
        });
      }
      throw new RpcException({ code: status.INTERNAL, message: 'DB_ERROR' });
    }

    return { success: true };
  }

  async removeTrackFromPlaylist(
    userId: string,
    playlistId: string,
    songId: string,
  ) {
    if (!playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');
    if (!songId) this.throwInvalidArgument('SONG_ID_REQUIRED');

    const playlist = await this.prisma.userPlaylist.findUnique({
      where: { id: playlistId },
      select: { userId: true },
    });
    if (!playlist) this.throwNotFound('PLAYLIST_NOT_FOUND');
    if (playlist.userId !== userId)
      this.throwPermissionDenied('PLAYLIST_ACCESS_DENIED');

    await this.prisma.userPlaylistTrack.deleteMany({
      where: { playlistId, songId },
    });

    return { success: true };
  }

  async applyWorkerCompletion(
    event: WorkerSongCompletionEvent,
  ): Promise<boolean> {
    if (
      !Number.isSafeInteger(event.metadata_version) ||
      event.metadata_version <= 0
    ) {
      this.throwInvalidArgument('METADATA_VERSION_INVALID');
    }

    const succeeded = event.status === 'success';
    const updateData: Prisma.SongUpdateManyMutationInput = {
      status: succeeded
        ? SongStatus.SONG_STATUS_READY
        : SongStatus.SONG_STATUS_FAILED,
    };

    if (succeeded) {
      updateData.encryptedFilePath =
        event.encrypted_file_path ||
        this.buildProcessedObjectPath(event.song_id);
      updateData.durationSec = Math.max(0, Math.round(event.duration_sec ?? 0));
      updateData.bitrateKbps = event.bitrate_kbps ?? 128;
      updateData.codec = event.codec ?? 'aac';
      updateData.format = event.format ?? 'fmp4';
    }

    if (succeeded && event.mood_tags?.length) {
      updateData.moodTags = event.mood_tags;
      updateData.moodAnalysisVersion = event.mood_analysis_version ?? '';
      updateData.moodAnalysisScores = event.mood_analysis_scores ?? undefined;
      updateData.moodAnalyzedAt = new Date();
    }

    const result = await this.prisma.song.updateMany({
      where: {
        id: event.song_id,
        transcodeVersion: BigInt(event.metadata_version),
      },
      data: updateData,
    });

    return result.count === 1;
  }

  private mapEntityToSummary(
    entity: SongSummaryEntity,
    requesterUserId: string,
    onlyPublic: boolean,
  ): SongSummary {
    const ownerProfile =
      (!onlyPublic && requesterUserId
        ? entity.owners.find((owner) => owner.userId === requesterUserId)
        : undefined) ??
      entity.owners.find((owner) => owner.isPublic) ??
      entity.owners[0];
    const artists = entity.artistCredits.map(({ artist }) => ({
      id: artist.id,
      name: artist.name,
      url: artist.url,
    }));
    const primaryArtist = artists[0];
    const primaryAlbum = entity.albumTracks[0]?.album;

    return {
      id: entity.id,
      title: ownerProfile?.title || entity.catalogTitle,
      artist: ownerProfile?.artist || entity.artistName,
      album: ownerProfile?.album || entity.albumName,
      coverUrl: ownerProfile?.coverUrl || this.artworkUrl(entity.artwork),
      thumbnailCoverSrcSet:
        getArtworkRenditionSrcSet(entity.artwork, [40, 80]) ||
        ownerProfile?.coverUrl ||
        this.artworkUrl(entity.artwork),
      isPublic: ownerProfile?.isPublic ?? false,
      status: entity.status,
      audioMode:
        entity.audioMode === 'SING'
          ? AudioMode.AUDIO_MODE_SING
          : AudioMode.AUDIO_MODE_STANDARD,
      contentRating: entity.contentRating,
      durationSec: entity.durationSec || 0,
      createdAt: entity.createdAt.getTime(),
      artistId: primaryArtist?.id || '',
      artistUrl: primaryArtist?.url || '',
      artists,
      albumId: primaryAlbum?.id || '',
      albumUrl: primaryAlbum?.url || '',
    };
  }

  private artworkUrl(artwork: Prisma.JsonValue | null): string {
    if (!artwork || typeof artwork !== 'object' || Array.isArray(artwork)) {
      return '';
    }

    const url = artwork.url;
    return typeof url === 'string' ? url : '';
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
      audioMode:
        entity.audioMode === 'SING'
          ? AudioMode.AUDIO_MODE_SING
          : AudioMode.AUDIO_MODE_STANDARD,
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
      audioMode:
        entity.audioMode === 'SING'
          ? AudioMode.AUDIO_MODE_SING
          : AudioMode.AUDIO_MODE_STANDARD,
    };
  }

  private parseCursor(cursor: string | undefined) {
    if (!cursor) return null;
    const [ts, id] = cursor.split(':');
    const timestamp = Number(ts);
    if (!id || Number.isNaN(timestamp)) {
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

  private publicPlaylistTrackWhere(): Prisma.UserPlaylistTrackWhereInput {
    return {
      song: {
        status: SongStatus.SONG_STATUS_READY,
        OR: [{ isCatalog: true }, { owners: { some: { isPublic: true } } }],
      },
    };
  }

  private isPubliclyPlayable(song: SongSummaryEntity): boolean {
    return (
      song.status === SONG_STATUS_READY &&
      (song.isCatalog || song.owners.some((owner) => owner.isPublic))
    );
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
