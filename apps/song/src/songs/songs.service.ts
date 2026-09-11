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
  ListAudioAnalysisSongsRequest,
  ListAudioAnalysisSongsResponse,
  AudioAnalysisSong,
  CreateSongRecordRequest,
  CreateSongRecordResponse,
  UpdateSongProcessingResultRequest,
  UpdateSongProcessingResultResponse,
  FavoriteRequest,
  FavoriteResponse,
  AlbumFavoriteRequest,
  AlbumFavoriteResponse,
  ListAlbumFavoriteIdsRequest,
  ListAlbumFavoriteIdsResponse,
  PlaylistFavoriteRequest,
  PlaylistFavoriteResponse,
  ListPlaylistFavoriteIdsRequest,
  ListPlaylistFavoriteIdsResponse,
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
  PreferenceEventType,
} from '@musical/shared-proto';
import { getArtworkRenditionSrcSet } from '@musical/shared-types';
import {
  PREFERENCE_SIGNAL_WEIGHT,
  SYSTEM_FAVORITE_PLAYLIST_ID,
} from '@musical/shared-constants';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { CatalogAssetsService } from './catalog-assets.service';
import { albumPrimaryArtistName } from './album-artist';

const albumSummarySelect = {
  id: true,
  name: true,
  artistName: true,
  url: true,
  artwork: true,
  artistCredits: {
    orderBy: { position: 'asc' },
    select: {
      isPrimary: true,
      position: true,
      artist: { select: { name: true } },
    },
  },
} as const;

const songSummarySelect = {
  id: true,
  status: true,
  isCatalog: true,
  audioMode: true,
  contentRating: true,
  durationSec: true,
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
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
  albumTracks: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      album: {
        select: albumSummarySelect,
      },
    },
  },
  artistCredits: {
    where: { role: 'artist' },
    orderBy: { position: 'asc' },
    select: {
      isPrimary: true,
      artist: { select: { id: true, name: true, url: true } },
    },
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
type AlbumSummaryEntity = Prisma.AlbumGetPayload<{
  select: typeof albumSummarySelect;
}>;
type SongDetailEntity = Prisma.SongGetPayload<{
  select: typeof songDetailSelect;
}>;
type SongIngestEntity = Prisma.SongGetPayload<{
  select: typeof songIngestSelect;
}>;

const MAX_LIST_LIMIT = 50;
const MAX_AUDIO_ANALYSIS_LIST_LIMIT = 200;
const AUDIO_EMBEDDING_DIMENSION = 512;

function truncateLibraryMetadata(value: string, maxLength: number) {
  return value.slice(0, maxLength);
}
const SONG_STATUS_READY = Number(SongStatus.SONG_STATUS_READY);

type WorkerSongCompletionEvent = {
  song_id: string;
  metadata_version: number;
  status: 'success' | 'error';
  audio_analysis_only?: boolean;
  duration_sec?: number | null;
  encrypted_file_path?: string | null;
  bitrate_kbps?: number | null;
  codec?: string | null;
  format?: string | null;
  error_message?: string | null;
  audio_bpm?: number | null;
  audio_energy?: number | null;
  audio_tags?: string[] | null;
  audio_embedding?: number[] | null;
  audio_analysis_version?: string | null;
  audio_analysis_error?: string | null;
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

  private enqueuePreferenceOutbox(
    tx: Prisma.TransactionClient,
    userId: string,
    eventType: PreferenceEventType,
    resourceType: string,
    resourceId: string,
    weight: number,
  ) {
    return tx.preferenceOutbox.create({
      data: {
        eventId: randomUUID(),
        userId,
        eventType,
        resourceType,
        resourceId,
        weight,
      },
    });
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
                  audioAnalysisStatus: 'PENDING',
                  audioAnalysisVersion: '',
                  audioBpm: null,
                  audioEnergy: null,
                  audioTags: [],
                  audioEmbedding: [],
                  audioAnalysisError: '',
                  audioAnalyzedAt: null,
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

  /**
   * Internal, cursor-paginated feed for rebuilding a derived vector index.
   * The Song database is authoritative; callers must never treat this feed as
   * a replacement for catalog authorization or playback checks.
   */
  async listAudioAnalysisSongs(
    request: ListAudioAnalysisSongsRequest,
  ): Promise<ListAudioAnalysisSongsResponse> {
    const limit = Math.min(
      Math.max(request.limit || 100, 1),
      MAX_AUDIO_ANALYSIS_LIST_LIMIT,
    );
    const cursor = this.parseAudioAnalysisCursor(request.cursor);
    const filters: Prisma.SongWhereInput[] = [
      {
        status: SONG_STATUS_READY,
        audioAnalysisStatus: 'READY',
        audioEmbedding: { isEmpty: false },
        audioAnalyzedAt: { not: null },
      },
    ];
    if (request.onlyCatalog) filters.push({ isCatalog: true });
    if (cursor) {
      filters.push({
        OR: [
          { audioAnalyzedAt: { gt: cursor.analyzedAt } },
          { audioAnalyzedAt: cursor.analyzedAt, id: { gt: cursor.id } },
        ],
      });
    }

    const songs = await this.prisma.song.findMany({
      where: { AND: filters },
      orderBy: [{ audioAnalyzedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: {
        id: true,
        storefront: true,
        audioBpm: true,
        audioEnergy: true,
        audioTags: true,
        audioEmbedding: true,
        audioAnalysisVersion: true,
        audioAnalyzedAt: true,
        genreNames: true,
        albumTracks: {
          orderBy: { position: 'asc' },
          take: 1,
          select: { albumId: true },
        },
        artistCredits: {
          where: { role: 'artist' },
          orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
          select: { artistId: true },
        },
      },
    });
    const hasMore = songs.length > limit;
    const page = hasMore ? songs.slice(0, limit) : songs;
    const validSongs = page.filter(
      (song) =>
        song.audioEmbedding.length === AUDIO_EMBEDDING_DIMENSION &&
        song.audioEmbedding.every(Number.isFinite),
    );
    const lastSong = page.at(-1);

    return {
      songs: validSongs.map((song): AudioAnalysisSong => ({
        songId: song.id,
        albumId: song.albumTracks[0]?.albumId ?? '',
        artistIds: song.artistCredits.map((credit) => credit.artistId),
        genreNames: song.genreNames,
        audioTags: song.audioTags,
        audioBpm: song.audioBpm ?? 0,
        audioEnergy: song.audioEnergy ?? 0,
        audioEmbedding: song.audioEmbedding,
        analysisVersion: song.audioAnalysisVersion,
        analyzedAt: song.audioAnalyzedAt?.getTime() ?? 0,
        storefront: song.storefront,
      })),
      nextCursor: lastSong?.audioAnalyzedAt
        ? this.buildAudioAnalysisCursor(lastSong.audioAnalyzedAt, lastSong.id)
        : '',
      hasMore,
    };
  }

  async addFavorite(request: FavoriteRequest): Promise<FavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.songId) this.throwInvalidArgument('SONG_ID_REQUIRED');
    if (!request.sourceAlbumId)
      this.throwInvalidArgument('SOURCE_ALBUM_ID_REQUIRED');

    const albumTrack = await this.prisma.albumTrack.findUnique({
      where: {
        albumId_songId: {
          albumId: request.sourceAlbumId,
          songId: request.songId,
        },
      },
      select: { songId: true },
    });
    if (!albumTrack) this.throwInvalidArgument('SOURCE_ALBUM_TRACK_MISMATCH');

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const existingFavorite = await tx.favorite.findUnique({
          where: {
            userId_songId: {
              userId: request.userId,
              songId: request.songId,
            },
          },
          select: { id: true },
        });

        await tx.favorite.upsert({
          where: {
            userId_songId: {
              userId: request.userId,
              songId: request.songId,
            },
          },
          create: {
            userId: request.userId,
            songId: request.songId,
            sourceAlbumId: request.sourceAlbumId,
          },
          update: {},
        });

        // Favourite is a stronger form of Add to Library. Persist the parent
        // Album and this Song in the same transaction, never as two UI-only
        // mutations that could diverge after a reload.
        await tx.userLibraryResource.upsert({
          where: {
            userId_resourceType_resourceId: {
              userId: request.userId,
              resourceType: 'albums',
              resourceId: request.sourceAlbumId,
            },
          },
          create: {
            userId: request.userId,
            resourceType: 'albums',
            resourceId: request.sourceAlbumId,
            title: '',
            subtitle: '',
            artworkUrl: '',
          },
          update: {},
        });

        await tx.userLibraryResource.upsert({
          where: {
            userId_resourceType_resourceId: {
              userId: request.userId,
              resourceType: 'songs',
              resourceId: request.songId,
            },
          },
          create: {
            userId: request.userId,
            resourceType: 'songs',
            resourceId: request.songId,
            sourceAlbumId: request.sourceAlbumId,
            title: '',
            subtitle: '',
            artworkUrl: '',
          },
          update: {},
        });

        // Favourite is a stronger form of saving a Song. Keep every Music
        // Video attached to that Song in Library too, regardless of whether
        // the favourite was initiated from an audio or video surface.
        await this.addSongMusicVideosToLibrary(
          tx,
          request.userId,
          request.songId,
          request.sourceAlbumId,
          '',
          '',
          '',
        );

        if (!existingFavorite) {
          await this.enqueuePreferenceOutbox(
            tx,
            request.userId,
            PreferenceEventType.PREFERENCE_EVENT_TYPE_SONG_FAVOURITED,
            'songs',
            request.songId,
            PREFERENCE_SIGNAL_WEIGHT.SONG_FAVOURITED,
          );
        }

        return !existingFavorite;
      });

      return { success: true, created, removed: false };
    } catch {
      throw new RpcException({ code: status.INTERNAL, message: 'DB_ERROR' });
    }
  }

  async removeFavorite(request: FavoriteRequest): Promise<FavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.songId) this.throwInvalidArgument('SONG_ID_REQUIRED');

    const removed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.favorite.deleteMany({
        where: {
          userId: request.userId,
          songId: request.songId,
        },
      });
      if (result.count) {
        await this.enqueuePreferenceOutbox(
          tx,
          request.userId,
          PreferenceEventType.PREFERENCE_EVENT_TYPE_SONG_UNFAVOURITED,
          'songs',
          request.songId,
          PREFERENCE_SIGNAL_WEIGHT.SONG_UNFAVOURITED,
        );
      }
      return result.count > 0;
    });

    return { success: true, created: false, removed };
  }

  async addAlbumFavorite(
    request: AlbumFavoriteRequest,
  ): Promise<AlbumFavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.albumId) this.throwInvalidArgument('ALBUM_ID_REQUIRED');

    const album = await this.prisma.album.findUnique({
      where: { id: request.albumId },
      select: { id: true },
    });
    if (!album) this.throwInvalidArgument('ALBUM_NOT_FOUND');

    await this.prisma.$transaction(async (tx) => {
      const albumTracks = await tx.albumTrack.findMany({
        where: { albumId: album.id },
        select: { songId: true },
      });
      const existing = await tx.albumFavorite.findUnique({
        where: {
          userId_albumId: { userId: request.userId, albumId: album.id },
        },
        select: { id: true },
      });
      // Favourite is also a Library save. Keep both writes and the preference
      // signal in one transaction so clients never observe a favourite album
      // without its Library membership.
      await tx.userLibraryResource.upsert({
        where: {
          userId_resourceType_resourceId: {
            userId: request.userId,
            resourceType: 'albums',
            resourceId: album.id,
          },
        },
        create: {
          userId: request.userId,
          resourceType: 'albums',
          resourceId: album.id,
          title: '',
          subtitle: '',
          artworkUrl: '',
        },
        update: {},
      });

      // Favourite has the same Library membership as saving the complete
      // album. Do it in this transaction rather than depending on a client
      // follow-up request, otherwise a revalidation can see only the parent
      // Album row and make the UI revert to “Add to Library”.
      for (const { songId } of albumTracks) {
        const existingSong = await tx.userLibraryResource.findUnique({
          where: {
            userId_resourceType_resourceId: {
              userId: request.userId,
              resourceType: 'songs',
              resourceId: songId,
            },
          },
          select: { id: true },
        });
        if (!existingSong) {
          await tx.userLibraryResource.create({
            data: {
              userId: request.userId,
              resourceType: 'songs',
              resourceId: songId,
              sourceAlbumId: album.id,
              title: '',
              subtitle: '',
              artworkUrl: '',
            },
          });
          await this.enqueuePreferenceOutbox(
            tx,
            request.userId,
            PreferenceEventType.PREFERENCE_EVENT_TYPE_LIBRARY_ADDED,
            'songs',
            songId,
            PREFERENCE_SIGNAL_WEIGHT.LIBRARY_ADDED,
          );
        }
        await this.addSongMusicVideosToLibrary(
          tx,
          request.userId,
          songId,
          album.id,
          '',
          '',
          '',
        );
      }

      if (existing) return;

      await tx.albumFavorite.create({
        data: { userId: request.userId, albumId: album.id },
      });
      await this.enqueuePreferenceOutbox(
        tx,
        request.userId,
        PreferenceEventType.PREFERENCE_EVENT_TYPE_ALBUM_FAVOURITED,
        'albums',
        album.id,
        PREFERENCE_SIGNAL_WEIGHT.ALBUM_FAVOURITED,
      );
    });
    return { success: true, isFavorite: true };
  }

  async removeAlbumFavorite(
    request: AlbumFavoriteRequest,
  ): Promise<AlbumFavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.albumId) this.throwInvalidArgument('ALBUM_ID_REQUIRED');
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.albumFavorite.deleteMany({
        where: { userId: request.userId, albumId: request.albumId },
      });
      if (result.count) {
        await this.enqueuePreferenceOutbox(
          tx,
          request.userId,
          PreferenceEventType.PREFERENCE_EVENT_TYPE_ALBUM_UNFAVOURITED,
          'albums',
          request.albumId,
          PREFERENCE_SIGNAL_WEIGHT.ALBUM_UNFAVOURITED,
        );
      }
    });
    return { success: true, isFavorite: false };
  }

  async getAlbumFavorite(
    request: AlbumFavoriteRequest,
  ): Promise<AlbumFavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.albumId) this.throwInvalidArgument('ALBUM_ID_REQUIRED');
    const favorite = await this.prisma.albumFavorite.findUnique({
      where: {
        userId_albumId: { userId: request.userId, albumId: request.albumId },
      },
      select: { id: true },
    });
    return { success: true, isFavorite: Boolean(favorite) };
  }

  async listAlbumFavoriteIds(
    request: ListAlbumFavoriteIdsRequest,
  ): Promise<ListAlbumFavoriteIdsResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    const favorites = await this.prisma.albumFavorite.findMany({
      where: { userId: request.userId },
      orderBy: { createdAt: 'desc' },
      select: { albumId: true },
    });
    return { albumIds: favorites.map((favorite) => favorite.albumId) };
  }

  async addPlaylistFavorite(
    request: PlaylistFavoriteRequest,
  ): Promise<PlaylistFavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');

    if (request.playlistId === SYSTEM_FAVORITE_PLAYLIST_ID) {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.systemPlaylistFavorite.findUnique({
          where: { userId: request.userId },
          select: { id: true },
        });
        await this.ensurePlaylistFavoriteLibraryResource(
          tx,
          request.userId,
          request.playlistId,
        );
        if (existing) return;

        await tx.systemPlaylistFavorite.create({
          data: { userId: request.userId },
        });
        await this.enqueuePlaylistFavoritePreference(
          tx,
          request.userId,
          request.playlistId,
          true,
        );
      });
      return { success: true, isFavorite: true };
    }

    const playlist = await this.prisma.playlist.findUnique({
      where: { id: request.playlistId },
      select: { id: true },
    });
    if (!playlist) {
      const userPlaylist = await this.prisma.userPlaylist.findFirst({
        where: { id: request.playlistId, userId: request.userId },
        select: { id: true },
      });
      if (!userPlaylist) this.throwInvalidArgument('PLAYLIST_NOT_FOUND');

      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.userPlaylistFavorite.findUnique({
          where: {
            userId_playlistId: {
              userId: request.userId,
              playlistId: userPlaylist.id,
            },
          },
          select: { id: true },
        });
        if (existing) return;

        await tx.userPlaylistFavorite.create({
          data: { userId: request.userId, playlistId: userPlaylist.id },
        });
        await this.enqueuePlaylistFavoritePreference(
          tx,
          request.userId,
          userPlaylist.id,
          true,
        );
      });
      return { success: true, isFavorite: true };
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.playlistFavorite.findUnique({
        where: {
          userId_playlistId: {
            userId: request.userId,
            playlistId: playlist.id,
          },
        },
        select: { id: true },
      });
      // Match the Album and Song favourite contract: a favourite playlist is
      // persisted in Library by this same transaction.
      await this.ensurePlaylistFavoriteLibraryResource(
        tx,
        request.userId,
        playlist.id,
      );

      if (existing) return;

      await tx.playlistFavorite.create({
        data: { userId: request.userId, playlistId: playlist.id },
      });
      await this.enqueuePlaylistFavoritePreference(
        tx,
        request.userId,
        playlist.id,
        true,
      );
    });
    return { success: true, isFavorite: true };
  }

  async removePlaylistFavorite(
    request: PlaylistFavoriteRequest,
  ): Promise<PlaylistFavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');

    if (request.playlistId === SYSTEM_FAVORITE_PLAYLIST_ID) {
      await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.systemPlaylistFavorite.deleteMany({
          where: { userId: request.userId },
        });
        if (!deleted.count) return;

        await this.enqueuePlaylistFavoritePreference(
          tx,
          request.userId,
          request.playlistId,
          false,
        );
      });
      return { success: true, isFavorite: false };
    }

    await this.prisma.$transaction(async (tx) => {
      const userDeleted = await tx.userPlaylistFavorite.deleteMany({
        where: { userId: request.userId, playlistId: request.playlistId },
      });
      const deleted =
        userDeleted.count > 0
          ? userDeleted
          : await tx.playlistFavorite.deleteMany({
              where: {
                userId: request.userId,
                playlistId: request.playlistId,
              },
            });
      if (!deleted.count) return;

      await this.enqueuePlaylistFavoritePreference(
        tx,
        request.userId,
        request.playlistId,
        false,
      );
    });
    return { success: true, isFavorite: false };
  }

  async getPlaylistFavorite(
    request: PlaylistFavoriteRequest,
  ): Promise<PlaylistFavoriteResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    if (!request.playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');
    if (request.playlistId === SYSTEM_FAVORITE_PLAYLIST_ID) {
      const favorite = await this.prisma.systemPlaylistFavorite.findUnique({
        where: { userId: request.userId },
        select: { id: true },
      });
      return { success: true, isFavorite: Boolean(favorite) };
    }
    const [favorite, userPlaylistFavorite] = await Promise.all([
      this.prisma.playlistFavorite.findUnique({
        where: {
          userId_playlistId: {
            userId: request.userId,
            playlistId: request.playlistId,
          },
        },
        select: { id: true },
      }),
      this.prisma.userPlaylistFavorite.findUnique({
        where: {
          userId_playlistId: {
            userId: request.userId,
            playlistId: request.playlistId,
          },
        },
        select: { id: true },
      }),
    ]);
    return {
      success: true,
      isFavorite: Boolean(favorite || userPlaylistFavorite),
    };
  }

  async listPlaylistFavoriteIds(
    request: ListPlaylistFavoriteIdsRequest,
  ): Promise<ListPlaylistFavoriteIdsResponse> {
    if (!request.userId) this.throwInvalidArgument('USER_ID_REQUIRED');
    const [favorites, systemFavorite, userPlaylistFavorites] = await Promise.all([
      this.prisma.playlistFavorite.findMany({
        where: { userId: request.userId },
        orderBy: { createdAt: 'desc' },
        select: { playlistId: true },
      }),
      this.prisma.systemPlaylistFavorite.findUnique({
        where: { userId: request.userId },
        select: { id: true },
      }),
      this.prisma.userPlaylistFavorite.findMany({
        where: { userId: request.userId },
        orderBy: { createdAt: 'desc' },
        select: { playlistId: true },
      }),
    ]);
    return {
      playlistIds: [
        ...(systemFavorite ? [SYSTEM_FAVORITE_PLAYLIST_ID] : []),
        ...favorites.map((favorite) => favorite.playlistId),
        ...userPlaylistFavorites.map((favorite) => favorite.playlistId),
      ],
    };
  }

  private async ensurePlaylistFavoriteLibraryResource(
    tx: Prisma.TransactionClient,
    userId: string,
    playlistId: string,
  ): Promise<void> {
    await tx.userLibraryResource.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId,
          resourceType: 'playlists',
          resourceId: playlistId,
        },
      },
      create: {
        userId,
        resourceType: 'playlists',
        resourceId: playlistId,
        title: '',
        subtitle: '',
        artworkUrl: '',
      },
      update: {},
    });
  }

  private async enqueuePlaylistFavoritePreference(
    tx: Prisma.TransactionClient,
    userId: string,
    playlistId: string,
    isFavorite: boolean,
  ): Promise<void> {
    await this.enqueuePreferenceOutbox(
      tx,
      userId,
      isFavorite
        ? PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_FAVOURITED
        : PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_UNFAVOURITED,
      'playlists',
      playlistId,
      isFavorite
        ? PREFERENCE_SIGNAL_WEIGHT.PLAYLIST_FAVOURITED
        : PREFERENCE_SIGNAL_WEIGHT.PLAYLIST_UNFAVOURITED,
    );
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
        sourceAlbum: { select: albumSummarySelect },
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
      songs: results.map(({ song, sourceAlbum }) =>
        this.mapEntityToSummary(song, request.userId, false, sourceAlbum),
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
      !['songs', 'albums', 'playlists', 'music-videos'].includes(
        request.resourceType,
      )
    ) {
      this.throwInvalidArgument('LIBRARY_RESOURCE_INVALID');
    }

    // Catalog metadata is external input. Keep the durable Library projection
    // within its schema limits instead of failing an entire album/playlist
    // cascade because one title or artist credit is unusually long.
    const title = truncateLibraryMetadata(request.title, 255);
    const subtitle = truncateLibraryMetadata(request.subtitle, 255);
    const artworkUrl = truncateLibraryMetadata(request.artworkUrl, 1000);

    if (request.resourceType === 'songs') {
      if (!request.sourceAlbumId) {
        this.throwInvalidArgument('SOURCE_ALBUM_ID_REQUIRED');
      }
      const albumTrack = await this.prisma.albumTrack.findUnique({
        where: {
          albumId_songId: {
            albumId: request.sourceAlbumId,
            songId: request.resourceId,
          },
        },
        select: { songId: true },
      });
      if (!albumTrack) {
        this.throwInvalidArgument('SOURCE_ALBUM_TRACK_MISMATCH');
      }
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          // Saving a track always brings its release into Library as the
          // parent resource. Catalog metadata is hydrated by the API later;
          // this row only establishes the listener's Library membership.
          await tx.userLibraryResource.upsert({
            where: {
              userId_resourceType_resourceId: {
                userId: request.userId,
                resourceType: 'albums',
                resourceId: request.sourceAlbumId,
              },
            },
            create: {
              userId: request.userId,
              resourceType: 'albums',
              resourceId: request.sourceAlbumId,
              title: '',
              subtitle: '',
              artworkUrl: '',
            },
            update: {},
          });

          const existingSong = await tx.userLibraryResource.findUnique({
            where: {
              userId_resourceType_resourceId: {
                userId: request.userId,
                resourceType: 'songs',
                resourceId: request.resourceId,
              },
            },
            select: { id: true },
          });
          if (!existingSong) {
            await tx.userLibraryResource.create({
              data: {
                userId: request.userId,
                resourceType: request.resourceType,
                resourceId: request.resourceId,
                sourceAlbumId: request.sourceAlbumId,
                title,
                subtitle,
                artworkUrl,
              },
            });
            await this.enqueuePreferenceOutbox(
              tx,
              request.userId,
              PreferenceEventType.PREFERENCE_EVENT_TYPE_LIBRARY_ADDED,
              request.resourceType,
              request.resourceId,
              PREFERENCE_SIGNAL_WEIGHT.LIBRARY_ADDED,
            );
          }

          await this.addSongMusicVideosToLibrary(
            tx,
            request.userId,
            request.resourceId,
            request.sourceAlbumId,
            title,
            subtitle,
            artworkUrl,
          );
          return !existingSong;
        });
        return {
          success: true,
          deletedUserPlaylist: false,
          created,
          removed: false,
          removedFavoriteSongIds: [],
          removedEmptyAlbumId: '',
          removedEmptyAlbumFavorite: false,
          favoriteRemoved: false,
        };
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return {
            success: true,
            deletedUserPlaylist: false,
            created: false,
            removed: false,
            removedFavoriteSongIds: [],
            removedEmptyAlbumId: '',
            removedEmptyAlbumFavorite: false,
            favoriteRemoved: false,
          };
        }
        throw error;
      }
    }

    const existing = await this.prisma.userLibraryResource.findUnique({
      where: {
        userId_resourceType_resourceId: {
          userId: request.userId,
          resourceType: request.resourceType,
          resourceId: request.resourceId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.userLibraryResource.update({
        where: { id: existing.id },
        data: {
          title: title || undefined,
          subtitle: subtitle || undefined,
          artworkUrl: artworkUrl || undefined,
        },
      });
      return {
        success: true,
        deletedUserPlaylist: false,
        created: false,
        removed: false,
        removedFavoriteSongIds: [],
        removedEmptyAlbumId: '',
        removedEmptyAlbumFavorite: false,
        favoriteRemoved: false,
      };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userLibraryResource.create({
          data: {
            userId: request.userId,
            resourceType: request.resourceType,
            resourceId: request.resourceId,
            sourceAlbumId: request.sourceAlbumId || null,
            title,
            subtitle,
            artworkUrl,
          },
        });
        if (request.resourceType !== 'music-videos') {
          await this.enqueuePreferenceOutbox(
            tx,
            request.userId,
            PreferenceEventType.PREFERENCE_EVENT_TYPE_LIBRARY_ADDED,
            request.resourceType,
            request.resourceId,
            PREFERENCE_SIGNAL_WEIGHT.LIBRARY_ADDED,
          );
        }
      });
      return {
        success: true,
        deletedUserPlaylist: false,
        created: true,
        removed: false,
        removedFavoriteSongIds: [],
        removedEmptyAlbumId: '',
        removedEmptyAlbumFavorite: false,
        favoriteRemoved: false,
      };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return {
          success: true,
          deletedUserPlaylist: false,
          created: false,
          removed: false,
          removedFavoriteSongIds: [],
          removedEmptyAlbumId: '',
          removedEmptyAlbumFavorite: false,
          favoriteRemoved: false,
        };
      }
      throw error;
    }
  }

  /** Keeps Song and its attached Music Videos as one Library membership. */
  private async addSongMusicVideosToLibrary(
    tx: Prisma.TransactionClient,
    userId: string,
    songId: string,
    sourceAlbumId: string,
    title: string,
    subtitle: string,
    artworkUrl: string,
  ) {
    const videos = await tx.songVideo.findMany({
      where: { songId },
      select: { id: true },
    });
    if (!videos.length) return;

    await tx.userLibraryResource.createMany({
      data: videos.map((video) => ({
        userId,
        resourceType: 'music-videos',
        resourceId: video.id,
        sourceAlbumId,
        title,
        subtitle,
        artworkUrl,
      })),
      skipDuplicates: true,
    });
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
        sourceAlbumId: resource.sourceAlbumId ?? '',
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
        sourceAlbumId: resource.sourceAlbumId ?? '',
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
    if (request.resourceType === 'music-videos') {
      const video = await this.prisma.songVideo.findUnique({
        where: { id: request.resourceId },
        select: { songId: true },
      });
      if (!video) this.throwNotFound('MUSIC_VIDEO_NOT_FOUND');
      return this.removeLibraryResource({
        ...request,
        resourceType: 'songs',
        resourceId: video.songId,
      });
    }

    let deletedUserPlaylist = false;
    let removed = false;
    let removedFavoriteSongIds: string[] = [];
    let removedEmptyAlbumId = '';
    let removedEmptyAlbumFavorite = false;
    let favoriteRemoved = false;
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

      const librarySong =
        request.resourceType === 'songs'
          ? await tx.userLibraryResource.findUnique({
              where: {
                userId_resourceType_resourceId: {
                  userId: request.userId,
                  resourceType: 'songs',
                  resourceId: request.resourceId,
                },
              },
              select: { sourceAlbumId: true },
            })
          : null;
      const deletion = await tx.userLibraryResource.deleteMany({
        where: {
          userId: request.userId,
          resourceType: request.resourceType,
          resourceId: request.resourceId,
        },
      });
      removed = deletion.count > 0;

      if (removed && request.resourceType === 'albums') {
        const removedAlbumFavorite = await tx.albumFavorite.deleteMany({
          where: { userId: request.userId, albumId: request.resourceId },
        });
        if (removedAlbumFavorite.count) {
          favoriteRemoved = true;
          await this.enqueuePreferenceOutbox(
            tx,
            request.userId,
            PreferenceEventType.PREFERENCE_EVENT_TYPE_ALBUM_UNFAVOURITED,
            'albums',
            request.resourceId,
            PREFERENCE_SIGNAL_WEIGHT.ALBUM_UNFAVOURITED,
          );
        }
        const favorites = await tx.favorite.findMany({
          where: {
            userId: request.userId,
            sourceAlbumId: request.resourceId,
          },
          select: { songId: true },
        });
        removedFavoriteSongIds = favorites.map(({ songId }) => songId);
        if (removedFavoriteSongIds.length) {
          await tx.favorite.deleteMany({
            where: {
              userId: request.userId,
              sourceAlbumId: request.resourceId,
            },
          });
          await Promise.all(
            removedFavoriteSongIds.map((songId) =>
              this.enqueuePreferenceOutbox(
                tx,
                request.userId,
                PreferenceEventType.PREFERENCE_EVENT_TYPE_SONG_UNFAVOURITED,
                'songs',
                songId,
                PREFERENCE_SIGNAL_WEIGHT.SONG_UNFAVOURITED,
              ),
            ),
          );
        }
        await tx.userLibraryResource.deleteMany({
          where: {
            userId: request.userId,
            resourceType: 'songs',
            sourceAlbumId: request.resourceId,
          },
        });
        await tx.userLibraryResource.deleteMany({
          where: {
            userId: request.userId,
            resourceType: 'music-videos',
            sourceAlbumId: request.resourceId,
          },
        });
      }

      if (removed && request.resourceType === 'songs') {
        const songVideos = await tx.songVideo.findMany({
          where: { songId: request.resourceId },
          select: { id: true },
        });
        if (songVideos.length) {
          await tx.userLibraryResource.deleteMany({
            where: {
              userId: request.userId,
              resourceType: 'music-videos',
              resourceId: { in: songVideos.map((video) => video.id) },
            },
          });
        }
        const favorite = await tx.favorite.findUnique({
          where: {
            userId_songId: {
              userId: request.userId,
              songId: request.resourceId,
            },
          },
          select: { songId: true },
        });
        if (favorite) {
          removedFavoriteSongIds = [favorite.songId];
          await tx.favorite.delete({
            where: {
              userId_songId: {
                userId: request.userId,
                songId: request.resourceId,
              },
            },
          });
          await this.enqueuePreferenceOutbox(
            tx,
            request.userId,
            PreferenceEventType.PREFERENCE_EVENT_TYPE_SONG_UNFAVOURITED,
            'songs',
            favorite.songId,
            PREFERENCE_SIGNAL_WEIGHT.SONG_UNFAVOURITED,
          );
        }

        const sourceAlbumId = librarySong?.sourceAlbumId;
        if (sourceAlbumId) {
          const remainingSongs = await tx.userLibraryResource.count({
            where: {
              userId: request.userId,
              resourceType: 'songs',
              sourceAlbumId,
            },
          });
          if (remainingSongs === 0) {
            const deletedAlbum = await tx.userLibraryResource.deleteMany({
              where: {
                userId: request.userId,
                resourceType: 'albums',
                resourceId: sourceAlbumId,
              },
            });
            if (deletedAlbum.count) {
              removedEmptyAlbumId = sourceAlbumId;
              await tx.userLibraryResource.deleteMany({
                where: {
                  userId: request.userId,
                  resourceType: 'music-videos',
                  sourceAlbumId,
                },
              });
              const removedAlbumFavorite = await tx.albumFavorite.deleteMany({
                where: { userId: request.userId, albumId: sourceAlbumId },
              });
              removedEmptyAlbumFavorite = removedAlbumFavorite.count > 0;
              if (removedEmptyAlbumFavorite) {
                await this.enqueuePreferenceOutbox(
                  tx,
                  request.userId,
                  PreferenceEventType.PREFERENCE_EVENT_TYPE_ALBUM_UNFAVOURITED,
                  'albums',
                  sourceAlbumId,
                  PREFERENCE_SIGNAL_WEIGHT.ALBUM_UNFAVOURITED,
                );
              }
            }
          }
        }
      }

      if (removed && request.resourceType === 'playlists') {
        const removedPlaylistFavorite = await tx.playlistFavorite.deleteMany({
          where: { userId: request.userId, playlistId: request.resourceId },
        });
        if (removedPlaylistFavorite.count) {
          favoriteRemoved = true;
          await this.enqueuePreferenceOutbox(
            tx,
            request.userId,
            PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_UNFAVOURITED,
            'playlists',
            request.resourceId,
            PREFERENCE_SIGNAL_WEIGHT.PLAYLIST_UNFAVOURITED,
          );
        }
      }

      if (removed) {
        await this.enqueuePreferenceOutbox(
          tx,
          request.userId,
          PreferenceEventType.PREFERENCE_EVENT_TYPE_LIBRARY_REMOVED,
          request.resourceType,
          request.resourceId,
          PREFERENCE_SIGNAL_WEIGHT.LIBRARY_REMOVED,
        );
      }
    });
    return {
      success: true,
      deletedUserPlaylist,
      created: false,
      removed,
      removedFavoriteSongIds,
      removedEmptyAlbumId,
      removedEmptyAlbumFavorite,
      favoriteRemoved,
    };
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
    return {
      success: true,
      deletedUserPlaylist: false,
      created: false,
      removed: false,
      removedFavoriteSongIds: [],
      removedEmptyAlbumId: '',
      removedEmptyAlbumFavorite: false,
      favoriteRemoved: false,
    };
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
    return {
      success: true,
      deletedUserPlaylist: false,
      created: false,
      removed: false,
      removedFavoriteSongIds: [],
      removedEmptyAlbumId: '',
      removedEmptyAlbumFavorite: false,
      favoriteRemoved: false,
    };
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
            sourceAlbum: { select: albumSummarySelect },
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
        songs: visibleTracks.map(({ song, sourceAlbum }) =>
          this.mapEntityToSummary(song, requesterUserId, true, sourceAlbum),
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
      select: {
        position: true,
        sourceAlbum: { select: albumSummarySelect },
        song: { select: songSummarySelect },
      },
    });
    const hasMore = tracks.length > limit;
    const page = hasMore ? tracks.slice(0, limit) : tracks;

    return {
      songs: page.map(({ song, sourceAlbum }) =>
        this.mapEntityToSummary(song, requesterUserId, true, sourceAlbum),
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

  async addTrackToPlaylist(
    userId: string,
    playlistId: string,
    songId: string,
    sourceAlbumId = '',
  ) {
    if (!playlistId) this.throwInvalidArgument('PLAYLIST_ID_REQUIRED');
    if (!songId) this.throwInvalidArgument('SONG_ID_REQUIRED');
    if (!sourceAlbumId) this.throwInvalidArgument('SOURCE_ALBUM_ID_REQUIRED');

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

        const albumTrack = await tx.albumTrack.findUnique({
          where: { albumId_songId: { albumId: sourceAlbumId, songId } },
          select: { songId: true },
        });
        if (!albumTrack) {
          this.throwInvalidArgument('SOURCE_ALBUM_TRACK_MISMATCH');
        }

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
            sourceAlbumId,
            position: (maxPosition._max.position ?? -1) + 1,
          },
        });
        await this.enqueuePreferenceOutbox(
          tx,
          userId,
          PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_TRACK_ADDED,
          'songs',
          songId,
          PREFERENCE_SIGNAL_WEIGHT.PLAYLIST_TRACK_ADDED,
        );
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

    return { success: true, removed: false };
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

    const removed = await this.prisma.$transaction(async (tx) => {
      const deletion = await tx.userPlaylistTrack.deleteMany({
        where: { playlistId, songId },
      });
      if (deletion.count) {
        await this.enqueuePreferenceOutbox(
          tx,
          userId,
          PreferenceEventType.PREFERENCE_EVENT_TYPE_PLAYLIST_TRACK_REMOVED,
          'songs',
          songId,
          PREFERENCE_SIGNAL_WEIGHT.PLAYLIST_TRACK_REMOVED,
        );
      }
      return deletion.count > 0;
    });

    return { success: true, removed };
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
    const analysisOnly = event.audio_analysis_only === true;
    const updateData: Prisma.SongUpdateManyMutationInput = analysisOnly
      ? {}
      : {
          status: succeeded
            ? SongStatus.SONG_STATUS_READY
            : SongStatus.SONG_STATUS_FAILED,
        };

    if (succeeded && !analysisOnly) {
      updateData.encryptedFilePath =
        event.encrypted_file_path ||
        this.buildProcessedObjectPath(event.song_id);
      updateData.durationSec = Math.max(0, Math.round(event.duration_sec ?? 0));
      updateData.bitrateKbps = event.bitrate_kbps ?? 128;
      updateData.codec = event.codec ?? 'aac';
      updateData.format = event.format ?? 'fmp4';
    }

    if (
      succeeded &&
      Number.isFinite(event.audio_bpm) &&
      Number.isFinite(event.audio_energy) &&
      event.audio_embedding?.length === 512 &&
      event.audio_embedding.every(Number.isFinite) &&
      event.audio_analysis_version?.trim()
    ) {
      updateData.audioAnalysisStatus = 'READY';
      updateData.audioAnalysisVersion = event.audio_analysis_version.trim();
      updateData.audioBpm = Math.max(0, event.audio_bpm ?? 0);
      updateData.audioEnergy = Math.min(
        1,
        Math.max(0, event.audio_energy ?? 0),
      );
      updateData.audioTags = [
        ...new Set(event.audio_tags?.filter(Boolean) ?? []),
      ];
      updateData.audioEmbedding = event.audio_embedding ?? [];
      updateData.audioAnalysisError = '';
      updateData.audioAnalyzedAt = new Date();
    } else if (analysisOnly && event.audio_analysis_error?.trim()) {
      updateData.audioAnalysisStatus = 'FAILED';
      updateData.audioAnalysisError = truncateLibraryMetadata(
        event.audio_analysis_error.trim(),
        2000,
      );
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
    sourceAlbum?: AlbumSummaryEntity | null,
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
    const primaryAlbumTrack = sourceAlbum
      ? entity.albumTracks.find((track) => track.album.id === sourceAlbum.id)
      : entity.albumTracks[0];
    const primaryAlbum = sourceAlbum ?? primaryAlbumTrack?.album;
    const catalogArtistName =
      (primaryAlbum ? albumPrimaryArtistName(primaryAlbum) : '') ||
      entity.artistCredits
        .filter((credit) => credit.isPrimary)
        .map(({ artist }) => artist.name)
        .join(', ') ||
      entity.artistName;

    return {
      id: entity.id,
      title: ownerProfile?.title || entity.catalogTitle,
      artist: entity.isCatalog
        ? catalogArtistName
        : ownerProfile?.artist || catalogArtistName,
      album: ownerProfile?.album || primaryAlbum?.name || entity.albumName,
      coverUrl: this.artworkUrl(primaryAlbum?.artwork ?? null),
      thumbnailCoverSrcSet:
        getArtworkRenditionSrcSet(primaryAlbum?.artwork ?? null, [40, 80]) ||
        this.artworkUrl(primaryAlbum?.artwork ?? null),
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
      releaseTrackId: primaryAlbumTrack?.id || '',
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

  private parseAudioAnalysisCursor(cursor: string | undefined) {
    if (!cursor) return null;
    const [timestampText, id] = cursor.split(':');
    const timestamp = Number(timestampText);
    if (
      !id ||
      !Number.isSafeInteger(timestamp) ||
      Number.isNaN(new Date(timestamp).getTime())
    ) {
      this.throwInvalidArgument('AUDIO_ANALYSIS_CURSOR_INVALID');
    }
    return { analyzedAt: new Date(timestamp), id };
  }

  private buildAudioAnalysisCursor(analyzedAt: Date, id: string): string {
    return `${analyzedAt.getTime()}:${id}`;
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
