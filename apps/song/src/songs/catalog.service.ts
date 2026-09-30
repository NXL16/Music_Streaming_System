import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import {
  BrowseCatalogRequest,
  BrowseCatalogResponse,
  CatalogAlbumResource,
  CatalogArtistResource,
  CatalogArtwork,
  CatalogPlaylistResource,
  CatalogReference,
  CatalogResponse,
  CatalogSongResource,
  GetCatalogAlbumRequest,
  GetCatalogPlaylistRequest,
  UpsertSystemPlaylistRequest,
  GetCatalogResourcesRequest,
  GetCatalogArtistAlbumsRequest,
  GetCatalogArtistSongsRequest,
  GetCatalogArtistSongsResponse,
  GetCatalogSimilarArtistsRequest,
  GetCatalogSongVideosRequest,
  GetCatalogSongVideosResponse,
  GetCatalogAlbumSongVideosRequest,
  GetCatalogArtistSongVideosRequest,
  GetCatalogSongVideoRequest,
  GetCatalogRelatedSongVideosRequest,
  CatalogSongVideo,
  ResolveMusicVideoPlaybackRequest,
  ResolveMusicVideoPlaybackResponse,
  GetCatalogAlbumRelatedRequest,
  GetCatalogAlbumRelatedResponse,
  ProtobufStruct,
  SearchCatalogRequest,
  SearchCatalogResponse,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { albumPrimaryArtistName } from './album-artist';
import { CatalogAssetsService } from './catalog-assets.service';

const songCatalogInclude = {
  artistCredits: {
    include: { artist: true },
    orderBy: [{ role: 'asc' }, { position: 'asc' }],
  },
  contributorCredits: {
    orderBy: [{ role: 'asc' }, { position: 'asc' }],
  },
  albumTracks: {
    include: {
      album: {
        select: {
          id: true,
          name: true,
          artistName: true,
          artworkAssetId: true,
          artwork: true,
          artistCredits: {
            orderBy: { position: 'asc' },
            select: {
              isPrimary: true,
              position: true,
              artist: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ discNumber: 'asc' }, { position: 'asc' }],
  },
} satisfies Prisma.SongInclude;

const songVideoMetadataInclude = {
  artistCredits: {
    where: { role: 'artist' },
    select: {
      position: true,
      isPrimary: true,
      artist: { select: { id: true, name: true, url: true } },
    },
    orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
  },
  albumTracks: {
    select: {
      id: true,
      album: { select: { artwork: true } },
    },
    orderBy: [{ discNumber: 'asc' }, { position: 'asc' }],
  },
} satisfies Prisma.SongInclude;

const albumCatalogInclude = {
  artistCredits: {
    include: { artist: true },
    orderBy: { position: 'asc' },
  },
  tracks: {
    include: { song: { include: songCatalogInclude } },
    orderBy: [{ discNumber: 'asc' }, { position: 'asc' }],
  },
} satisfies Prisma.AlbumInclude;

// Lighter include for browse/listing cards: no tracks and no per-track credits.
// Only the primary artist credits (cheap) plus the album's own scalar/JSON
// columns (artwork, trackCount, name, ...) are loaded.
const albumCatalogBrowseInclude = {
  artistCredits: {
    include: { artist: true },
    orderBy: { position: 'asc' },
  },
  _count: {
    select: { tracks: true },
  },
} satisfies Prisma.AlbumInclude;

const playlistCatalogInclude = {
  tracks: {
    include: { song: { include: songCatalogInclude } },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.PlaylistInclude;

// Browse responses only expose track references, not the tracks themselves.
// Selecting just `songId` preserves that contract without loading every song
// and its nested artist/album relations for each playlist card.
const playlistCatalogBrowseInclude = {
  tracks: {
    select: { songId: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.PlaylistInclude;

type CatalogSongEntity = Prisma.SongGetPayload<{
  include: typeof songCatalogInclude;
}>;
type CatalogArtistEntity = Prisma.ArtistGetPayload<Prisma.ArtistDefaultArgs>;
type CatalogAlbumEntity = Prisma.AlbumGetPayload<{
  include: typeof albumCatalogInclude;
}>;
type CatalogAlbumBrowseEntity = Prisma.AlbumGetPayload<{
  include: typeof albumCatalogBrowseInclude;
}>;
// Accepts either the full album (with tracks) or the lighter browse album.
// The `tracks` relation is optional so the mapper can tolerate its absence.
type AlbumResourceInput = (CatalogAlbumBrowseEntity | CatalogAlbumEntity) & {
  tracks?: CatalogAlbumEntity['tracks'];
  _count?: { tracks: number };
};
type CatalogPlaylistEntity = Prisma.PlaylistGetPayload<{
  include: typeof playlistCatalogInclude;
}>;
type CatalogPlaylistBrowseEntity = Prisma.PlaylistGetPayload<{
  include: typeof playlistCatalogBrowseInclude;
}>;

type JsonObject = Record<string, unknown>;

const DEFAULT_STOREFRONT = 'vn';
const MAX_BATCH_RESOURCES = 2_000;
const ARTWORK_SIMILARITY_COOLDOWN_MIN = 7;
const ARTWORK_SIMILARITY_COOLDOWN_VARIANCE = 4;
const ARTIST_DIVERSITY_COOLDOWN = 3;
const ARTIST_SONG_PAGE_DEFAULT = 20;
const ARTIST_SONG_PAGE_MAX = 50;
const ARTIST_MUSIC_VIDEO_PAGE_DEFAULT = 12;
const ARTIST_MUSIC_VIDEO_PAGE_MAX = 100;
const RELATED_MUSIC_VIDEO_DEFAULT_LIMIT = 10;
const RELATED_MUSIC_VIDEO_MAX_LIMIT = 30;
const RELATED_SHELF_PREVIEW_LIMIT = 12;
const RELATED_SHELF_DETAIL_PAGE_SIZE = 30;
const RELATED_SHELF_DETAIL_MAX_ITEMS = 60;
const RELATED_SHELF_CANDIDATE_LIMIT = RELATED_SHELF_DETAIL_MAX_ITEMS;
const MUSIC_VIDEO_ASSET_CONCURRENCY = 8;
// Ceiling for offset-based browse pagination. Offset degrades linearly at
// depth; keyset would require encoding the sort column into the cursor
// (a cursor-format/proto change), so deep offsets are rejected instead.
const MAX_BROWSE_OFFSET = 10_000;
const BATCH_RESOURCE_TYPES = new Set([
  'albums',
  'playlists',
  'songs',
  'artists',
  'release-tracks',
]);

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogAssetsService: CatalogAssetsService,
  ) {}

  async getAlbum(request: GetCatalogAlbumRequest): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const albumId = this.required(request.albumId, 'ALBUM_ID_REQUIRED');
    const album = await this.prisma.album.findFirst({
      where: { id: albumId, storefront },
      include: albumCatalogInclude,
    });

    if (!album) {
      this.throwNotFound('ALBUM_NOT_FOUND');
    }

    const relatedShelfHints = await this.albumRelatedShelfHints(
      album,
      storefront,
      request.recommendedAlbumIds,
    );

    return this.albumResponse(album, storefront, relatedShelfHints);
  }

  async getPlaylist(
    request: GetCatalogPlaylistRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const playlistId = this.required(
      request.playlistId,
      'PLAYLIST_ID_REQUIRED',
    );
    const playlist =
      (await this.prisma.playlist.findFirst({
        where: { id: playlistId, storefront, isPublic: true },
        include: playlistCatalogInclude,
      })) ??
      (await this.prisma.playlist.findFirst({
        where: { id: playlistId, isPublic: true },
        include: playlistCatalogInclude,
      }));

    if (!playlist) {
      this.throwNotFound('PLAYLIST_NOT_FOUND');
    }

    return this.playlistResponse(playlist, playlist.storefront, true);
  }

  async getPlaylistTracks(
    request: GetCatalogPlaylistRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const playlistId = this.required(
      request.playlistId,
      'PLAYLIST_ID_REQUIRED',
    );
    const playlist =
      (await this.prisma.playlist.findFirst({
        where: { id: playlistId, storefront, isPublic: true },
        include: playlistCatalogInclude,
      })) ??
      (await this.prisma.playlist.findFirst({
        where: { id: playlistId, isPublic: true },
        include: playlistCatalogInclude,
      }));

    if (!playlist) {
      this.throwNotFound('PLAYLIST_NOT_FOUND');
    }

    return this.playlistResponse(playlist, playlist.storefront, false);
  }

  async upsertSystemPlaylist(
    request: UpsertSystemPlaylistRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const playlistId = this.required(
      request.playlistId,
      'PLAYLIST_ID_REQUIRED',
    );
    const name = this.required(request.name, 'PLAYLIST_NAME_REQUIRED');
    const songIds = [...new Set(request.songIds.filter(Boolean))];
    if (songIds.length === 0)
      this.throwInvalidArgument('PLAYLIST_TRACKS_REQUIRED');
    const artwork = this.systemPlaylistArtwork(request);

    await this.prisma.$transaction(async (tx) => {
      const songCount = await tx.song.count({
        where: { id: { in: songIds }, storefront, isCatalog: true },
      });
      if (songCount !== songIds.length) {
        this.throwInvalidArgument('SYSTEM_PLAYLIST_TRACK_NOT_CATALOG');
      }

      await tx.playlist.upsert({
        where: { id: playlistId },
        create: {
          id: playlistId,
          storefront,
          name,
          curatorName: 'Musical',
          descriptionShort: request.description || '',
          descriptionStandard: request.description || '',
          artwork,
          playlistType: 'system-personalized',
          url: request.url,
          ownerId: 'system',
          isPublic: true,
        },
        update: {
          storefront,
          name,
          curatorName: 'Musical',
          descriptionShort: request.description || '',
          descriptionStandard: request.description || '',
          artwork,
          playlistType: 'system-personalized',
          url: request.url,
          ownerId: 'system',
          isPublic: true,
        },
      });
      await tx.playlistTrack.deleteMany({ where: { playlistId } });
      await tx.playlistTrack.createMany({
        data: songIds.map((songId, position) => ({
          playlistId,
          songId,
          position,
        })),
      });
    });

    return this.getPlaylist({ storefront, playlistId });
  }

  async getArtistAlbums(
    request: GetCatalogArtistAlbumsRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const artistId = this.required(request.artistId, 'ARTIST_ID_REQUIRED');
    const limit = request.limit > 0 ? Math.min(request.limit, 500) : undefined;
    const section = request.section.trim().toLowerCase();
    if (section && section !== 'appears-on') {
      this.throwInvalidArgument('ARTIST_ALBUM_SECTION_INVALID');
    }
    const releaseTypes = [
      ...new Set(
        request.releaseTypes.map((value) => value.trim().toLowerCase()),
      ),
    ].filter(
      (value): value is 'album' | 'ep' | 'single' =>
        value === 'album' || value === 'ep' || value === 'single',
    );

    const artistExists = await this.prisma.artist.findFirst({
      where: { id: artistId, storefront },
    });
    if (!artistExists) {
      this.throwNotFound('ARTIST_NOT_FOUND');
    }

    const albums = await this.prisma.album.findMany({
      where: {
        storefront,
        ...(releaseTypes.length > 0
          ? { releaseType: { in: releaseTypes } }
          : {}),
        ...(section === 'appears-on'
          ? {
              ...this.oneTrackArtistAppearanceWhere([artistId]),
              NOT: { artistCredits: { some: { artistId, isPrimary: true } } },
            }
          : { artistCredits: { some: { artistId, isPrimary: true } } }),
      },
      include: albumCatalogBrowseInclude,
      // A missing limit requests the full section; the Artist page supplies a
      // small preview limit and fetches the full section only on demand.
      orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    const albumResources = Object.fromEntries(
      albums.map((album) => [album.id, this.albumResource(album, storefront)]),
    );
    const artistResources = this.collectAlbumArtists(albums, storefront);

    return {
      data: albums.map((album) =>
        this.reference(album.id, 'albums', storefront),
      ),
      resources: {
        albums: albumResources,
        playlists: {},
        songs: {},
        artists: artistResources,
      },
    };
  }

  async getArtistSongs(
    request: GetCatalogArtistSongsRequest,
  ): Promise<GetCatalogArtistSongsResponse> {
    const storefront = this.storefront(request.storefront);
    const artistId = this.required(request.artistId, 'ARTIST_ID_REQUIRED');
    const limit = Math.min(
      Math.max(request.limit || ARTIST_SONG_PAGE_DEFAULT, 1),
      ARTIST_SONG_PAGE_MAX,
    );
    const cursor = request.cursor.trim() || undefined;

    const artistExists = await this.prisma.artist.findFirst({
      where: { id: artistId, storefront },
    });
    if (!artistExists) {
      this.throwNotFound('ARTIST_NOT_FOUND');
    }

    const where = {
      storefront,
      isCatalog: true,
      artistCredits: {
        some: { artistId, role: 'artist' },
      },
    } satisfies Prisma.SongWhereInput;

    if (cursor) {
      const cursorSong = await this.prisma.song.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      });
      if (!cursorSong) {
        this.throwInvalidArgument('ARTIST_SONG_CURSOR_INVALID');
      }
    }

    const page = await this.prisma.song.findMany({
      where,
      include: songCatalogInclude,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: [
        { releaseDate: { sort: 'desc', nulls: 'last' } },
        { id: 'desc' },
      ],
      take: limit + 1,
    });
    const hasMore = page.length > limit;
    const songs = hasMore ? page.slice(0, limit) : page;

    const songResources = Object.fromEntries(
      songs.map((song) => [song.id, this.songResource(song, storefront)]),
    );
    const albumIds = [
      ...new Set(
        songs.flatMap((song) => song.albumTracks.map(({ album }) => album.id)),
      ),
    ];
    const albums = albumIds.length
      ? await this.prisma.album.findMany({
          where: { id: { in: albumIds }, storefront },
          include: albumCatalogBrowseInclude,
        })
      : [];
    const albumResources = Object.fromEntries(
      albums.map((album) => [album.id, this.albumResource(album, storefront)]),
    );
    const artistResources = {
      ...this.collectArtists(songs, [artistExists], storefront),
      ...this.collectAlbumArtists(albums, storefront),
    };

    return {
      catalog: {
        data: songs.map((song) => this.reference(song.id, 'songs', storefront)),
        resources: {
          albums: albumResources,
          playlists: {},
          songs: songResources,
          artists: artistResources,
        },
      },
      nextCursor: hasMore ? (songs.at(-1)?.id ?? '') : '',
    };
  }

  async getAlbumRelated(
    request: GetCatalogAlbumRelatedRequest,
  ): Promise<GetCatalogAlbumRelatedResponse> {
    const storefront = this.storefront(request.storefront);
    const albumId = this.required(request.albumId, 'ALBUM_ID_REQUIRED');
    const album = await this.prisma.album.findFirst({
      where: { id: albumId, storefront },
      include: albumCatalogInclude,
    });
    if (!album) this.throwNotFound('ALBUM_NOT_FOUND');

    const primaryArtists = this.primaryAlbumArtists(album);
    const primaryArtist = primaryArtists[0];
    const primaryArtistIds = primaryArtists.map(({ id }) => id);
    const sourceSongPrimaryArtistIds = request.sourceSongId
      ? this.primarySongArtistIds(album, request.sourceSongId)
      : primaryArtistIds;
    const moreByArtistIds = sourceSongPrimaryArtistIds.length
      ? sourceSongPrimaryArtistIds
      : primaryArtistIds;
    const albumSongIds = album.tracks.map(({ songId }) => songId);
    const excludedAlbumIds = [album.id];
    const detailSection = request.section;
    const isDetailRequest =
      (this.isMoreBySection(detailSection) ||
        ['featured-on', 'you-might-also-like'].includes(detailSection)) &&
      request.limit > 0;

    if (isDetailRequest) {
      return this.getAlbumRelatedDetailPage({
        storefront,
        album,
        primaryArtists,
        moreByArtistIds,
        albumSongIds,
        excludedAlbumIds,
        section: detailSection,
        cursor: request.cursor,
        limit: request.limit,
        recommendedAlbumIds: request.recommendedAlbumIds,
      });
    }

    const personalizedYouMightAlsoLike = request.recommendedAlbumIds.length
      ? this.recommendedAlbumBrowse(
          request.recommendedAlbumIds,
          excludedAlbumIds,
          storefront,
        )
      : null;

    const [moreBy, exactFeaturedOn, rawYouMightAlsoLike] = await Promise.all([
      primaryArtistIds.length || moreByArtistIds.length
        ? this.prisma.album.findMany({
            where: {
              storefront,
              id: { notIn: excludedAlbumIds },
              ...this.moreByAlbumWhere(primaryArtistIds, moreByArtistIds),
            },
            include: albumCatalogBrowseInclude,
            orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
            take: RELATED_SHELF_CANDIDATE_LIMIT,
          })
        : Promise.resolve([] as CatalogAlbumBrowseEntity[]),
      albumSongIds.length
        ? this.prisma.playlist.findMany({
            where: {
              storefront,
              isPublic: true,
              // Get Up, Chill and New Music are fixed Home products, not
              // editorial placements for an album detail page.
              playlistType: { not: 'system-personalized' },
              tracks: { some: { songId: { in: albumSongIds } } },
            },
            include: playlistCatalogBrowseInclude,
            orderBy: [{ lastModifiedAt: 'desc' }, { id: 'desc' }],
            take: RELATED_SHELF_PREVIEW_LIMIT + 1,
          })
        : Promise.resolve([] as CatalogPlaylistBrowseEntity[]),
      personalizedYouMightAlsoLike ??
        this.prisma.album.findMany({
          where: {
            storefront,
            id: { notIn: excludedAlbumIds },
            ...(album.genreNames.length
              ? { genreNames: { hasSome: album.genreNames } }
              : {}),
            ...(primaryArtistIds.length
              ? {
                  artistCredits: {
                    none: {
                      artistId: { in: primaryArtistIds },
                      isPrimary: true,
                    },
                  },
                }
              : {}),
          },
          include: albumCatalogBrowseInclude,
          orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
          take: RELATED_SHELF_CANDIDATE_LIMIT,
        }),
    ]);

    // Catalog imports do not always include playlist-track membership. When
    // that relation is unavailable, an editorial playlist that explicitly
    // credits the primary artist is still a truthful "Featured On" result.
    const featuredOn =
      exactFeaturedOn.length > 0 || !primaryArtist
        ? exactFeaturedOn
        : await this.prisma.playlist.findMany({
            where: {
              storefront,
              isPublic: true,
              playlistType: 'editorial',
              artistNames: { has: primaryArtist.name },
            },
            include: playlistCatalogBrowseInclude,
            orderBy: [{ lastModifiedAt: 'desc' }, { id: 'desc' }],
            take: RELATED_SHELF_PREVIEW_LIMIT + 1,
          });

    const preview = <T>(items: T[]) => {
      return {
        items: items.slice(0, RELATED_SHELF_PREVIEW_LIMIT),
        hasMore: items.length > RELATED_SHELF_PREVIEW_LIMIT,
      };
    };
    const moreByPreview = preview(this.sequenceMoreByAlbums(moreBy));
    const featuredOnPreview = preview(featuredOn);
    const youMightAlsoLikePreview = preview(
      request.recommendedAlbumIds.length
        ? rawYouMightAlsoLike
        : this.sequenceRelatedAlbums(rawYouMightAlsoLike, album.id),
    );

    return {
      primaryArtistName: album.artistName,
      moreBy: this.albumBrowseResponse(moreByPreview.items, storefront),
      featuredOn: this.playlistBrowseResponse(
        featuredOnPreview.items,
        storefront,
      ),
      youMightAlsoLike: this.albumBrowseResponse(
        youMightAlsoLikePreview.items,
        storefront,
      ),
      moreByHasMore: moreByPreview.hasMore,
      featuredOnHasMore: featuredOnPreview.hasMore,
      youMightAlsoLikeHasMore: youMightAlsoLikePreview.hasMore,
      nextCursor: '',
    };
  }

  private async getAlbumRelatedDetailPage({
    storefront,
    album,
    primaryArtists,
    moreByArtistIds,
    albumSongIds,
    excludedAlbumIds,
    section,
    cursor,
    limit,
    recommendedAlbumIds,
  }: {
    storefront: string;
    album: CatalogAlbumEntity;
    primaryArtists: CatalogArtistEntity[];
    moreByArtistIds: string[];
    albumSongIds: string[];
    excludedAlbumIds: string[];
    section: string;
    cursor: string;
    limit: number;
    recommendedAlbumIds: string[];
  }): Promise<GetCatalogAlbumRelatedResponse> {
    const cursorState = this.relatedShelfCursor(cursor);
    const offset = cursorState.offset;
    const pageSize = Math.min(
      Math.max(1, limit),
      RELATED_SHELF_DETAIL_PAGE_SIZE,
      RELATED_SHELF_DETAIL_MAX_ITEMS - offset,
    );

    if (pageSize <= 0) {
      return this.albumRelatedDetailResponse(section, [], storefront, '');
    }

    const pageOptions = { skip: offset, take: pageSize + 1 };
    let items: CatalogAlbumBrowseEntity[] | CatalogPlaylistBrowseEntity[] = [];
    let usedFeaturedOnFallback = false;

    const primaryArtist = primaryArtists[0];
    const primaryArtistIds = primaryArtists.map(({ id }) => id);
    if (this.isMoreBySection(section)) {
      items =
        primaryArtistIds.length || moreByArtistIds.length
          ? this.sequenceMoreByAlbums(
              await this.prisma.album.findMany({
                where: {
                  storefront,
                  id: { notIn: excludedAlbumIds },
                  ...this.moreByAlbumWhere(primaryArtistIds, moreByArtistIds),
                },
                include: albumCatalogBrowseInclude,
                orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
                take: RELATED_SHELF_CANDIDATE_LIMIT,
              }),
            ).slice(offset, offset + pageSize + 1)
          : [];
    } else if (section === 'featured-on') {
      const editorialWhere = primaryArtist
        ? {
            storefront,
            isPublic: true,
            playlistType: 'editorial' as const,
            artistNames: { has: primaryArtist.name },
          }
        : undefined;
      if (cursorState.featuredOnFallback && editorialWhere) {
        usedFeaturedOnFallback = true;
        items = await this.prisma.playlist.findMany({
          where: editorialWhere,
          include: playlistCatalogBrowseInclude,
          orderBy: [{ lastModifiedAt: 'desc' }, { id: 'desc' }],
          ...pageOptions,
        });
      } else {
        const exact = albumSongIds.length
          ? await this.prisma.playlist.findMany({
              where: {
                storefront,
                isPublic: true,
                playlistType: { not: 'system-personalized' },
                tracks: { some: { songId: { in: albumSongIds } } },
              },
              include: playlistCatalogBrowseInclude,
              orderBy: [{ lastModifiedAt: 'desc' }, { id: 'desc' }],
              ...pageOptions,
            })
          : [];
        items = exact.length > 0 || !editorialWhere ? exact : [];
        if (exact.length === 0 && editorialWhere) {
          usedFeaturedOnFallback = true;
          items = await this.prisma.playlist.findMany({
            where: editorialWhere,
            include: playlistCatalogBrowseInclude,
            orderBy: [{ lastModifiedAt: 'desc' }, { id: 'desc' }],
            ...pageOptions,
          });
        }
      }
    } else if (recommendedAlbumIds.length) {
      items = (
        await this.recommendedAlbumBrowse(
          recommendedAlbumIds,
          excludedAlbumIds,
          storefront,
        )
      ).slice(offset, offset + pageSize + 1);
    } else {
      items = this.sequenceRelatedAlbums(
        await this.prisma.album.findMany({
          where: {
            storefront,
            id: { notIn: excludedAlbumIds },
            ...(album.genreNames.length
              ? { genreNames: { hasSome: album.genreNames } }
              : {}),
            ...(primaryArtistIds.length
              ? {
                  artistCredits: {
                    none: {
                      artistId: { in: primaryArtistIds },
                      isPrimary: true,
                    },
                  },
                }
              : {}),
          },
          include: albumCatalogBrowseInclude,
          orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
          take: RELATED_SHELF_CANDIDATE_LIMIT,
        }),
        album.id,
      ).slice(offset, offset + pageSize + 1);
    }

    const hasMore = items.length > pageSize;
    const page = items.slice(0, pageSize);
    const nextCursor =
      hasMore && offset + page.length < RELATED_SHELF_DETAIL_MAX_ITEMS
        ? `${usedFeaturedOnFallback ? 'editorial:' : ''}${offset + page.length}`
        : '';
    return this.albumRelatedDetailResponse(
      section,
      page,
      storefront,
      nextCursor,
    );
  }

  private albumRelatedDetailResponse(
    section: string,
    items: CatalogAlbumBrowseEntity[] | CatalogPlaylistBrowseEntity[],
    storefront: string,
    nextCursor: string,
  ): GetCatalogAlbumRelatedResponse {
    const albums =
      section === 'featured-on' ? [] : (items as CatalogAlbumBrowseEntity[]);
    const playlists =
      section === 'featured-on' ? (items as CatalogPlaylistBrowseEntity[]) : [];
    return {
      primaryArtistName: '',
      moreBy: this.albumBrowseResponse(
        this.isMoreBySection(section) ? albums : [],
        storefront,
      ),
      featuredOn: this.playlistBrowseResponse(playlists, storefront),
      youMightAlsoLike: this.albumBrowseResponse(
        section === 'you-might-also-like' ? albums : [],
        storefront,
      ),
      moreByHasMore: false,
      featuredOnHasMore: false,
      youMightAlsoLikeHasMore: false,
      nextCursor,
    };
  }

  private primaryAlbumArtists(
    album: CatalogAlbumEntity,
  ): CatalogArtistEntity[] {
    const primaryCredits = album.artistCredits
      .filter(({ isPrimary }) => isPrimary)
      .sort((left, right) => left.position - right.position);
    if (primaryCredits.length) {
      return primaryCredits.map(({ artist }) => artist);
    }

    // Compatibility for catalog rows created before album-credit primary flags
    // existed. Do not infer a collaborator: only accept the explicit album
    // header owner when it names one artist exactly.
    const normalizedAlbumArtistName = album.artistName
      .trim()
      .toLocaleLowerCase();
    const legacyOwner = album.artistCredits.find(
      ({ artist }) =>
        artist.name.trim().toLocaleLowerCase() === normalizedAlbumArtistName,
    )?.artist;
    return legacyOwner ? [legacyOwner] : [];
  }

  /**
   * More By is discovery-oriented on release pages. Song Detail scopes this
   * to the primary artist of its source song; Album Detail uses the album's
   * primary artists. Featured artists of the open song never become a More By
   * source. Artist Detail deliberately does not use this policy.
   */
  private primarySongArtistIds(
    album: CatalogAlbumEntity,
    sourceSongId: string,
  ): string[] {
    const song = album.tracks.find(
      ({ songId }) => songId === sourceSongId,
    )?.song;
    if (!song) return [];

    return [
      ...new Set(
        song.artistCredits
          .filter((credit) => credit.role === 'artist' && credit.isPrimary)
          .map((credit) => credit.artistId),
      ),
    ];
  }

  private moreByAlbumWhere(
    primaryAlbumArtistIds: string[],
    moreByArtistIds: string[],
  ): Prisma.AlbumWhereInput {
    const conditions: Prisma.AlbumWhereInput[] = [];
    if (primaryAlbumArtistIds.length) {
      conditions.push({
        artistCredits: {
          some: {
            artistId: { in: primaryAlbumArtistIds },
            isPrimary: true,
          },
        },
      });
    }
    if (moreByArtistIds.length) {
      conditions.push({
        // Keep guest appearances aligned with Artist Detail > Appears On:
        // only one-track standalone singles qualify. Primary releases above
        // remain eligible regardless of their release type.
        ...this.oneTrackArtistAppearanceWhere(moreByArtistIds),
      });
    }
    return conditions.length ? { OR: conditions } : {};
  }

  private oneTrackArtistAppearanceWhere(
    artistIds: string[],
  ): Prisma.AlbumWhereInput {
    return {
      // A collaboration inside a multi-track release remains discoverable
      // through the artist's song list instead of an album shelf.
      releaseType: 'single',
      trackCount: 1,
      tracks: {
        some: {
          song: {
            artistCredits: {
              some: { artistId: { in: artistIds }, role: 'artist' },
            },
          },
        },
      },
    };
  }

  async getSimilarArtists(
    request: GetCatalogSimilarArtistsRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const artistId = this.required(request.artistId, 'ARTIST_ID_REQUIRED');
    const limit = Math.min(Math.max(request.limit || 10, 1), 500);
    const sourceArtist = await this.prisma.artist.findFirst({
      where: { id: artistId, storefront },
    });
    if (!sourceArtist) this.throwNotFound('ARTIST_NOT_FOUND');

    const sourceGenres = sourceArtist.genreNames
      .map((genre) => genre.trim())
      .filter(Boolean);
    const normalizedGenres = new Set(
      sourceGenres.map((genre) => genre.toLocaleLowerCase()),
    );
    if (normalizedGenres.size === 0) {
      return {
        data: [],
        resources: { albums: {}, playlists: {}, songs: {}, artists: {} },
      };
    }

    const candidates = await this.prisma.artist.findMany({
      where: {
        storefront,
        id: { not: artistId },
        genreNames: { hasSome: sourceGenres },
      },
    });
    const similarArtists = candidates
      .map((candidate) => ({
        candidate,
        overlap: candidate.genreNames.filter((genre) =>
          normalizedGenres.has(genre.trim().toLocaleLowerCase()),
        ).length,
        tieBreaker: this.similarArtistTieBreaker(artistId, candidate.id),
      }))
      .filter(({ overlap }) => overlap > 0)
      .sort(
        (left, right) =>
          right.overlap - left.overlap ||
          left.tieBreaker - right.tieBreaker ||
          left.candidate.id.localeCompare(right.candidate.id),
      )
      .slice(0, limit)
      .map(({ candidate }) => candidate);

    return {
      data: similarArtists.map((candidate) =>
        this.reference(candidate.id, 'artists', storefront),
      ),
      resources: {
        albums: {},
        playlists: {},
        songs: {},
        artists: Object.fromEntries(
          similarArtists.map((candidate) => [
            candidate.id,
            this.artistResource(candidate, storefront),
          ]),
        ),
      },
    };
  }

  /**
   * Genre overlap is the actual similarity signal currently available in the
   * catalog. Use a deterministic per-source tie-breaker when candidates have
   * the same score, so every Artist Detail page is stable without all of them
   * falling back to the same alphabetical order.
   */
  private similarArtistTieBreaker(
    sourceArtistId: string,
    candidateArtistId: string,
  ) {
    let hash = 2_166_136_261;
    const key = `${sourceArtistId}:${candidateArtistId}`;

    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }

    return hash >>> 0;
  }

  async getSongVideos(
    request: GetCatalogSongVideosRequest,
  ): Promise<GetCatalogSongVideosResponse> {
    const storefront = this.storefront(request.storefront);
    const songId = this.required(request.songId, 'SONG_ID_REQUIRED');
    const song = await this.prisma.song.findFirst({
      where: { id: songId, storefront, isCatalog: true },
      include: songVideoMetadataInclude,
    });
    if (!song) this.throwNotFound('SONG_NOT_FOUND');

    const videos = await this.prisma.songVideo.findMany({
      where: { songId },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    return {
      videos: await this.mapWithConcurrency(
        videos,
        MUSIC_VIDEO_ASSET_CONCURRENCY,
        (video) => this.catalogSongVideo(video, song),
      ),
      nextCursor: '',
    };
  }

  async getSongVideo(
    request: GetCatalogSongVideoRequest,
  ): Promise<CatalogSongVideo> {
    const storefront = this.storefront(request.storefront);
    const songVideoId = this.required(
      request.songVideoId,
      'SONG_VIDEO_ID_REQUIRED',
    );
    const video = await this.prisma.songVideo.findFirst({
      where: {
        id: songVideoId,
        song: { storefront, isCatalog: true },
      },
      select: {
        id: true,
        songId: true,
        videoAssetId: true,
        kind: true,
        publishedAt: true,
        song: { include: songVideoMetadataInclude },
      },
    });
    if (!video) this.throwNotFound('MUSIC_VIDEO_NOT_FOUND');
    return this.catalogSongVideo(video, video.song);
  }

  async getRelatedSongVideos(
    request: GetCatalogRelatedSongVideosRequest,
  ): Promise<GetCatalogSongVideosResponse> {
    const storefront = this.storefront(request.storefront);
    const songVideoId = this.required(
      request.songVideoId,
      'SONG_VIDEO_ID_REQUIRED',
    );
    const limit = Math.min(
      Math.max(request.limit || RELATED_MUSIC_VIDEO_DEFAULT_LIMIT, 1),
      RELATED_MUSIC_VIDEO_MAX_LIMIT,
    );
    const source = await this.prisma.songVideo.findFirst({
      where: {
        id: songVideoId,
        song: { storefront, isCatalog: true },
      },
      select: {
        id: true,
        song: {
          select: {
            genreNames: true,
            artistCredits: {
              where: { role: 'artist' },
              select: { artistId: true, isPrimary: true, position: true },
              orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
            },
          },
        },
      },
    });
    if (!source) this.throwNotFound('MUSIC_VIDEO_NOT_FOUND');

    const primaryArtistId =
      source.song.artistCredits.find((credit) => credit.isPrimary)?.artistId ??
      source.song.artistCredits[0]?.artistId;
    const collaboratorIds = source.song.artistCredits
      .filter((credit) => credit.artistId !== primaryArtistId)
      .map((credit) => credit.artistId);
    const candidateSongWhere = {
      storefront,
      isCatalog: true,
      ...(primaryArtistId
        ? {
            artistCredits: {
              none: { artistId: primaryArtistId, role: 'artist' },
            },
          }
        : {}),
    } satisfies Prisma.SongWhereInput;
    const select = {
      id: true,
      songId: true,
      videoAssetId: true,
      kind: true,
      publishedAt: true,
      song: { include: songVideoMetadataInclude },
    } satisfies Prisma.SongVideoSelect;
    const videos: Prisma.SongVideoGetPayload<{ select: typeof select }>[] = [];
    const fillFrom = async (song: Prisma.SongWhereInput) => {
      if (videos.length === limit) return;
      const candidates = await this.prisma.songVideo.findMany({
        where: {
          id: { notIn: [source.id, ...videos.map((video) => video.id)] },
          song,
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: limit - videos.length,
        select,
      });
      videos.push(...candidates);
    };

    if (collaboratorIds.length) {
      await fillFrom({
        AND: [
          candidateSongWhere,
          {
            artistCredits: {
              some: { artistId: { in: collaboratorIds }, role: 'artist' },
            },
          },
        ],
      });
    }
    if (source.song.genreNames.length) {
      await fillFrom({
        AND: [
          candidateSongWhere,
          { genreNames: { hasSome: source.song.genreNames } },
        ],
      });
    }
    await fillFrom(candidateSongWhere);

    return {
      videos: await this.mapWithConcurrency(
        videos,
        MUSIC_VIDEO_ASSET_CONCURRENCY,
        (video) => this.catalogSongVideo(video, video.song),
      ),
      nextCursor: '',
    };
  }

  async getAlbumSongVideos(
    request: GetCatalogAlbumSongVideosRequest,
  ): Promise<GetCatalogSongVideosResponse> {
    const storefront = this.storefront(request.storefront);
    const albumId = this.required(request.albumId, 'ALBUM_ID_REQUIRED');
    const album = await this.prisma.album.findFirst({
      where: { id: albumId, storefront },
      select: {
        tracks: {
          orderBy: [{ discNumber: 'asc' }, { position: 'asc' }],
          select: {
            song: {
              include: {
                ...songVideoMetadataInclude,
                videos: { orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] },
              },
            },
          },
        },
      },
    });
    if (!album) this.throwNotFound('ALBUM_NOT_FOUND');

    const entries = album.tracks.flatMap(({ song }) =>
      song.videos.map((video) => ({ song, video })),
    );
    const seenVideoIds = new Set<string>();
    const uniqueEntries = entries.filter(({ video }) => {
      if (seenVideoIds.has(video.id)) return false;
      seenVideoIds.add(video.id);
      return true;
    });
    return {
      videos: await this.mapWithConcurrency(
        uniqueEntries,
        MUSIC_VIDEO_ASSET_CONCURRENCY,
        ({ song, video }) => this.catalogSongVideo(video, song),
      ),
      nextCursor: '',
    };
  }

  async getArtistSongVideos(
    request: GetCatalogArtistSongVideosRequest,
  ): Promise<GetCatalogSongVideosResponse> {
    const storefront = this.storefront(request.storefront);
    const artistId = this.required(request.artistId, 'ARTIST_ID_REQUIRED');
    const artist = await this.prisma.artist.findFirst({
      where: { id: artistId, storefront },
      select: { id: true },
    });
    if (!artist) this.throwNotFound('ARTIST_NOT_FOUND');

    const limit = Math.min(
      Math.max(request.limit || ARTIST_MUSIC_VIDEO_PAGE_DEFAULT, 1),
      ARTIST_MUSIC_VIDEO_PAGE_MAX,
    );
    const cursor = this.artistMusicVideoCursor(request.cursor);

    const videos = await this.prisma.songVideo.findMany({
      where: {
        song: {
          storefront,
          isCatalog: true,
          artistCredits: { some: { artistId, role: 'artist' } },
        },
        ...(cursor
          ? {
              OR: [
                { publishedAt: { lt: cursor.publishedAt } },
                {
                  publishedAt: cursor.publishedAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        songId: true,
        videoAssetId: true,
        kind: true,
        publishedAt: true,
        song: { include: songVideoMetadataInclude },
      },
    });
    const page = videos.slice(0, limit);
    return {
      videos: await this.mapWithConcurrency(
        page,
        MUSIC_VIDEO_ASSET_CONCURRENCY,
        (video) => this.catalogSongVideo(video, video.song),
      ),
      nextCursor:
        videos.length > limit && page.length
          ? this.encodeArtistMusicVideoCursor(page.at(-1)!)
          : '',
    };
  }

  private artistMusicVideoCursor(cursor: string):
    | {
        publishedAt: Date;
        id: string;
      }
    | undefined {
    if (!cursor) return undefined;
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { publishedAt?: unknown; id?: unknown };
      const publishedAt = new Date(
        typeof parsed.publishedAt === 'string' ? parsed.publishedAt : '',
      );
      if (
        !Number.isFinite(publishedAt.getTime()) ||
        typeof parsed.id !== 'string' ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(parsed.id)
      ) {
        throw new Error('invalid cursor');
      }
      return { publishedAt, id: parsed.id };
    } catch {
      this.throwInvalidArgument('ARTIST_MUSIC_VIDEO_CURSOR_INVALID');
    }
  }

  private encodeArtistMusicVideoCursor(video: {
    publishedAt: Date;
    id: string;
  }): string {
    return Buffer.from(
      JSON.stringify({
        publishedAt: video.publishedAt.toISOString(),
        id: video.id,
      }),
    ).toString('base64url');
  }

  private async catalogSongVideo(
    video: {
      id: string;
      songId: string;
      videoAssetId: string;
      kind: string;
      publishedAt: Date;
    },
    song: {
      catalogTitle: string;
      artistName: string;
      albumName: string;
      releaseDate: Date | null;
      contentRating: string;
      genreNames: string[];
      artistCredits: Array<{
        position: number;
        isPrimary: boolean;
        artist: { id: string; name: string; url: string };
      }>;
      albumTracks: Array<{
        id: string;
        album: { artwork: Prisma.JsonValue | null };
      }>;
    },
  ): Promise<CatalogSongVideo> {
    const asset = await this.catalogAssetsService.getMusicVideoAsset(
      video.videoAssetId,
    );
    return {
      id: video.id,
      songId: video.songId,
      videoAssetId: video.videoAssetId,
      kind: video.kind.toLowerCase(),
      posterUrl: asset.posterUrl,
      posterSrcSet: asset.posterSrcSet,
      durationMillis: asset.durationMillis,
      width: asset.width,
      height: asset.height,
      publishedAt: video.publishedAt.toISOString(),
      songTitle: song.catalogTitle,
      artistName: song.artistName,
      songArtwork: this.artwork(song.albumTracks[0]?.album.artwork),
      albumName: song.albumName,
      releaseDate: this.dateOnly(song.releaseDate),
      contentRating: song.contentRating,
      genreNames: song.genreNames,
      releaseTrackId: song.albumTracks[0]?.id ?? '',
      artists: song.artistCredits.map((credit) => ({
        artistId: credit.artist.id,
        name: credit.artist.name,
        url: credit.artist.url,
        role: 'artist',
        position: credit.position,
        isPrimary: credit.isPrimary,
      })),
    };
  }

  private async mapWithConcurrency<Input, Output>(
    items: readonly Input[],
    concurrency: number,
    mapper: (item: Input) => Promise<Output>,
  ): Promise<Output[]> {
    const output = new Array<Output>(items.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        output[index] = await mapper(items[index]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );
    return output;
  }

  async resolveMusicVideoPlayback(
    request: ResolveMusicVideoPlaybackRequest,
  ): Promise<ResolveMusicVideoPlaybackResponse> {
    const videoAssetId = this.required(
      request.videoAssetId,
      'VIDEO_ASSET_ID_REQUIRED',
    );
    const video = await this.prisma.songVideo.findUnique({
      where: { videoAssetId },
      select: {
        songId: true,
        song: { select: { id: true, isCatalog: true } },
      },
    });
    if (!video?.song.isCatalog) this.throwNotFound('MUSIC_VIDEO_NOT_FOUND');
    return { songId: video.songId };
  }

  private isMoreBySection(section: string) {
    return section === 'more-by';
  }

  private relatedShelfCursor(cursor: string): {
    offset: number;
    featuredOnFallback: boolean;
  } {
    if (!cursor) return { offset: 0, featuredOnFallback: false };
    const featuredOnFallback = cursor.startsWith('editorial:');
    const offset = Number(
      featuredOnFallback ? cursor.slice('editorial:'.length) : cursor,
    );
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset >= RELATED_SHELF_DETAIL_MAX_ITEMS
    ) {
      this.throwInvalidArgument('CATALOG_RELATED_SHELF_CURSOR_INVALID');
    }
    return { offset, featuredOnFallback };
  }

  private async recommendedAlbumBrowse(
    rankedAlbumIds: string[],
    excludedAlbumIds: string[],
    storefront: string,
  ): Promise<CatalogAlbumBrowseEntity[]> {
    const albumIds = [...new Set(rankedAlbumIds)].filter(
      (id) => !excludedAlbumIds.includes(id),
    );
    if (!albumIds.length) return [];

    const albums = await this.prisma.album.findMany({
      where: { storefront, id: { in: albumIds } },
      include: albumCatalogBrowseInclude,
    });
    const rank = new Map(albumIds.map((id, index) => [id, index]));
    const ranked = albums.sort(
      (left, right) =>
        (rank.get(left.id) ?? Infinity) - (rank.get(right.id) ?? Infinity),
    );
    return this.sequenceRelatedAlbums(ranked);
  }

  private sequenceRelatedAlbums(albums: CatalogAlbumBrowseEntity[], seed = '') {
    const remaining = seed
      ? albums
          .map((album, index) => ({
            album,
            // Keep newer candidates favoured, but let each source album
            // explore a different part of the same relevant candidate pool.
            score: -index / 24 + this.stableNoise(`${seed}:${album.id}`) * 0.7,
          }))
          .sort((left, right) => right.score - left.score)
          .map(({ album }) => album)
      : [...albums];
    const ordered: CatalogAlbumBrowseEntity[] = [];

    while (remaining.length > 0) {
      const recentArtists = new Set(
        ordered
          .slice(-ARTIST_DIVERSITY_COOLDOWN)
          .map((album) => this.albumArtistName(album)),
      );
      const nextIndex = remaining.findIndex(
        (album) => !recentArtists.has(this.albumArtistName(album)),
      );
      const [next] = remaining.splice(nextIndex >= 0 ? nextIndex : 0, 1);
      ordered.push(next);
    }

    return this.sequenceMoreByAlbums(ordered);
  }

  private albumArtistName(album: CatalogAlbumBrowseEntity): string {
    return albumPrimaryArtistName(album);
  }

  private stableNoise(value: string) {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0) / 4_294_967_295;
  }

  private sequenceMoreByAlbums(albums: CatalogAlbumBrowseEntity[]) {
    const remaining = [...albums];
    const ordered: CatalogAlbumBrowseEntity[] = [];
    const artworkCooldowns: Array<{
      album: CatalogAlbumBrowseEntity;
      untilIndex: number;
    }> = [];

    while (remaining.length > 0) {
      const position = ordered.length;
      for (let index = artworkCooldowns.length - 1; index >= 0; index -= 1) {
        if (position > artworkCooldowns[index].untilIndex) {
          artworkCooldowns.splice(index, 1);
        }
      }
      const nextIndex = remaining.findIndex((album) =>
        artworkCooldowns.every(
          ({ album: recentAlbum, untilIndex }) =>
            position > untilIndex ||
            !this.artworksVisuallySimilar(album, recentAlbum),
        ),
      );
      const [next] = remaining.splice(nextIndex >= 0 ? nextIndex : 0, 1);
      ordered.push(next);
      artworkCooldowns.push({
        album: next,
        untilIndex: position + this.artworkSimilarityCooldown(next, position),
      });
    }

    return ordered;
  }

  private artworkSimilarityCooldown(
    album: CatalogAlbumBrowseEntity,
    position: number,
  ) {
    return (
      ARTWORK_SIMILARITY_COOLDOWN_MIN +
      Math.floor(
        this.stableNoise(`${album.id}:${position}:artwork-cooldown`) *
          ARTWORK_SIMILARITY_COOLDOWN_VARIANCE,
      )
    );
  }

  private albumArtworkKey(album: CatalogAlbumBrowseEntity) {
    const artwork = this.optionalObject(album.artwork);
    const checksum = this.string(artwork?.checksum);
    if (checksum) return `checksum:${checksum}`;

    const urlChecksum = this.artworkChecksumFromUrl(this.string(artwork?.url));
    if (urlChecksum) return `checksum:${urlChecksum}`;

    return album.artworkAssetId || `album:${album.id}`;
  }

  private artworksVisuallySimilar(
    left: CatalogAlbumBrowseEntity,
    right: CatalogAlbumBrowseEntity,
  ) {
    const leftArtwork = this.optionalObject(left.artwork);
    const rightArtwork = this.optionalObject(right.artwork);
    const leftHash = this.string(leftArtwork?.perceptualHash);
    const rightHash = this.string(rightArtwork?.perceptualHash);
    if (leftHash && rightHash) {
      return this.perceptualHashDistance(leftHash, rightHash) <= 8;
    }
    return this.albumArtworkKey(left) === this.albumArtworkKey(right);
  }

  private perceptualHashDistance(left: string, right: string) {
    if (!/^[a-f0-9]{16}$/i.test(left) || !/^[a-f0-9]{16}$/i.test(right)) {
      return Number.POSITIVE_INFINITY;
    }
    let distance = 0;
    for (let index = 0; index < left.length; index += 1) {
      let difference =
        Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
      while (difference > 0) {
        distance += difference & 1;
        difference >>>= 1;
      }
    }
    return distance;
  }

  private artworkChecksumFromUrl(url: string) {
    return (
      url.match(/(?:^|\/)([a-f0-9]{64})(?:\/|$)/i)?.[1]?.toLowerCase() ?? ''
    );
  }

  async getResources(
    request: GetCatalogResourcesRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    if (request.resources.length > MAX_BATCH_RESOURCES) {
      this.throwInvalidArgument('CATALOG_RESOURCE_BATCH_TOO_LARGE');
    }

    const identifiers = request.resources.map((resource) => {
      const type = this.required(
        resource.type,
        'CATALOG_RESOURCE_TYPE_REQUIRED',
      );
      const id = this.required(resource.id, 'CATALOG_RESOURCE_ID_REQUIRED');
      if (!BATCH_RESOURCE_TYPES.has(type)) {
        this.throwInvalidArgument('CATALOG_RESOURCE_TYPE_UNSUPPORTED');
      }
      return { type, id };
    });
    const uniqueIdentifiers = [
      ...new Map(
        identifiers.map((resource) => [
          `${resource.type}:${resource.id}`,
          resource,
        ]),
      ).values(),
    ];
    if (!uniqueIdentifiers.length) {
      return {
        data: [],
        resources: { albums: {}, playlists: {}, songs: {}, artists: {} },
      };
    }

    const idsByType = Object.fromEntries(
      [...BATCH_RESOURCE_TYPES].map((type) => [
        type,
        uniqueIdentifiers
          .filter((resource) => resource.type === type)
          .map((resource) => resource.id),
      ]),
    ) as Record<string, string[]>;
    const albumIds = idsByType.albums;
    const playlistIds = idsByType.playlists;
    const songIds = idsByType.songs;
    const artistIds = idsByType.artists;
    const releaseTrackIds = idsByType['release-tracks'];

    // A public song URL names an album_tracks row, not the reusable audio
    // record. Keep this resolver behind the catalog resource boundary so the
    // browser receives the selected album context without any query string or
    // client-side session state.
    if (releaseTrackIds.length) {
      if (uniqueIdentifiers.length !== 1 || releaseTrackIds.length !== 1) {
        this.throwInvalidArgument('RELEASE_TRACK_RESOLUTION_MUST_BE_SINGLE');
      }
      const releaseTrack = await this.prisma.albumTrack.findFirst({
        where: { id: releaseTrackIds[0], album: { storefront } },
        include: { album: { include: albumCatalogInclude } },
      });
      if (!releaseTrack) this.throwNotFound('RELEASE_TRACK_NOT_FOUND');
      return this.albumResponse(releaseTrack.album, storefront);
    }

    const [albums, playlists, songs, artists] = await Promise.all([
      albumIds.length
        ? this.prisma.album.findMany({
            where: { id: { in: albumIds }, storefront },
            include: albumCatalogInclude,
          })
        : Promise.resolve([] as CatalogAlbumEntity[]),
      playlistIds.length
        ? this.prisma.playlist.findMany({
            where: {
              id: { in: playlistIds },
              storefront,
              isPublic: true,
            },
            include: playlistCatalogInclude,
          })
        : Promise.resolve([] as CatalogPlaylistEntity[]),
      songIds.length
        ? this.prisma.song.findMany({
            where: {
              id: { in: songIds },
              storefront,
              isCatalog: true,
            },
            include: songCatalogInclude,
          })
        : Promise.resolve([] as CatalogSongEntity[]),
      artistIds.length
        ? this.prisma.artist.findMany({
            where: { id: { in: artistIds }, storefront },
          })
        : Promise.resolve([]),
    ]);

    const relatedSongs = [
      ...songs,
      ...albums.flatMap((album) => album.tracks.map(({ song }) => song)),
      ...playlists.flatMap((playlist) =>
        playlist.tracks.map(({ song }) => song),
      ),
    ];
    const uniqueSongs = [
      ...new Map(relatedSongs.map((song) => [song.id, song])).values(),
    ];
    const loadedAlbumIds = new Set(albums.map((album) => album.id));
    const relatedAlbumIds = [
      ...new Set(
        uniqueSongs.flatMap((song) =>
          song.albumTracks
            .map(({ album }) => album.id)
            .filter((albumId) => !loadedAlbumIds.has(albumId)),
        ),
      ),
    ];
    const relatedAlbums = relatedAlbumIds.length
      ? await this.prisma.album.findMany({
          where: { id: { in: relatedAlbumIds }, storefront },
          include: albumCatalogBrowseInclude,
        })
      : [];
    const allAlbums: AlbumResourceInput[] = [...relatedAlbums, ...albums];
    const albumResources = Object.fromEntries(
      allAlbums.map((album) => [
        album.id,
        this.albumResource(album, storefront),
      ]),
    );
    const playlistResources = Object.fromEntries(
      playlists.map((playlist) => [
        playlist.id,
        this.playlistResource(
          playlist,
          storefront,
          playlist.tracks.map(({ song }) =>
            this.reference(song.id, 'songs', storefront),
          ),
        ),
      ]),
    );
    const songResources = Object.fromEntries(
      uniqueSongs.map((song) => [song.id, this.songResource(song, storefront)]),
    );
    const artistResources = {
      ...this.collectArtists(uniqueSongs, artists, storefront),
      ...this.collectAlbumArtists(allAlbums, storefront),
    };
    const found = new Set([
      ...Object.keys(albumResources).map((id) => `albums:${id}`),
      ...Object.keys(playlistResources).map((id) => `playlists:${id}`),
      ...Object.keys(songResources).map((id) => `songs:${id}`),
      ...Object.keys(artistResources).map((id) => `artists:${id}`),
    ]);

    return {
      data: uniqueIdentifiers
        .filter((resource) => found.has(`${resource.type}:${resource.id}`))
        .map((resource) =>
          this.reference(resource.id, resource.type, storefront),
        ),
      resources: {
        albums: albumResources,
        playlists: playlistResources,
        songs: songResources,
        artists: artistResources,
      },
    };
  }

  private albumResponse(
    album: CatalogAlbumEntity,
    storefront: string,
    relatedShelfHints?: {
      moreBy: boolean;
      featuredOn: boolean;
      youMightAlsoLike: boolean;
    },
  ): CatalogResponse {
    const songs = Object.fromEntries(
      album.tracks.map(({ song }) => [
        song.id,
        this.songResource(song, storefront, album.id),
      ]),
    );
    const artists = this.collectArtists(
      album.tracks.map(({ song }) => song),
      album.artistCredits.map(({ artist }) => artist),
      storefront,
    );
    const albumResource = this.albumResource(
      album,
      storefront,
      relatedShelfHints,
    );

    return {
      data: [this.reference(album.id, 'albums', storefront)],
      resources: {
        albums: { [album.id]: albumResource },
        playlists: {},
        songs,
        artists,
      },
    };
  }

  private albumBrowseResponse(
    albums: CatalogAlbumBrowseEntity[],
    storefront: string,
  ): CatalogResponse {
    return {
      data: albums.map((album) =>
        this.reference(album.id, 'albums', storefront),
      ),
      resources: {
        albums: Object.fromEntries(
          albums.map((album) => [
            album.id,
            this.albumResource(album, storefront),
          ]),
        ),
        playlists: {},
        songs: {},
        artists: this.collectAlbumArtists(albums, storefront),
      },
    };
  }

  private playlistBrowseResponse(
    playlists: CatalogPlaylistBrowseEntity[],
    storefront: string,
  ): CatalogResponse {
    return {
      data: playlists.map((playlist) =>
        this.reference(playlist.id, 'playlists', storefront),
      ),
      resources: {
        albums: {},
        playlists: Object.fromEntries(
          playlists.map((playlist) => [
            playlist.id,
            this.playlistResource(
              playlist,
              storefront,
              playlist.tracks.map(({ songId }) =>
                this.reference(songId, 'songs', storefront),
              ),
            ),
          ]),
        ),
        songs: {},
        artists: {},
      },
    };
  }

  private async playlistResponse(
    playlist: CatalogPlaylistEntity,
    storefront: string,
    includePlaylist: boolean,
  ): Promise<CatalogResponse> {
    const albumIds = [
      ...new Set(
        playlist.tracks.flatMap(({ song }) =>
          song.albumTracks.map(({ album }) => album.id),
        ),
      ),
    ];
    const albums = albumIds.length
      ? await this.prisma.album.findMany({
          where: { id: { in: albumIds }, storefront },
          include: albumCatalogBrowseInclude,
        })
      : [];
    const songs = Object.fromEntries(
      playlist.tracks.map(({ song }) => [
        song.id,
        this.songResource(song, storefront),
      ]),
    );
    const artists = {
      ...this.collectArtists(
        playlist.tracks.map(({ song }) => song),
        [],
        storefront,
      ),
      ...this.collectAlbumArtists(albums, storefront),
    };
    const trackData = playlist.tracks.map(({ song }) =>
      this.reference(song.id, 'songs', storefront),
    );

    return {
      data: includePlaylist
        ? [this.reference(playlist.id, 'playlists', storefront)]
        : trackData,
      resources: {
        albums: Object.fromEntries(
          albums.map((album) => [
            album.id,
            this.albumResource(album, storefront),
          ]),
        ),
        playlists: includePlaylist
          ? {
              [playlist.id]: this.playlistResource(
                playlist,
                storefront,
                trackData,
              ),
            }
          : {},
        songs,
        artists,
      },
    };
  }

  private albumResource(
    album: AlbumResourceInput,
    storefront: string,
    relatedShelfHints?: {
      moreBy: boolean;
      featuredOn: boolean;
      youMightAlsoLike: boolean;
    },
  ): CatalogAlbumResource {
    const tracks = album.tracks ?? [];
    const analyzedTracks = tracks.filter(
      ({ song }) =>
        song.audioAnalysisStatus === 'READY' &&
        typeof song.audioBpm === 'number' &&
        Number.isFinite(song.audioBpm) &&
        typeof song.audioEnergy === 'number' &&
        Number.isFinite(song.audioEnergy),
    );
    const audioTags = [
      ...new Set(analyzedTracks.flatMap(({ song }) => song.audioTags)),
    ];
    const audioBpm = analyzedTracks.length
      ? analyzedTracks.reduce((sum, { song }) => sum + (song.audioBpm ?? 0), 0) /
        analyzedTracks.length
      : 0;
    const audioEnergy = analyzedTracks.length
      ? analyzedTracks.reduce(
          (sum, { song }) => sum + (song.audioEnergy ?? 0),
          0,
        ) / analyzedTracks.length
      : 0;
    const artistData = album.artistCredits.map(({ artist }) =>
      this.reference(artist.id, 'artists', storefront),
    );
    const trackData = tracks.map(({ id, song, popularity }) => ({
      ...this.reference(song.id, 'songs', storefront),
      meta: {
        popularity: popularity ?? 0,
        releaseTrackId: id,
      },
    }));

    return {
      id: album.id,
      type: 'albums',
      href: this.href(storefront, 'albums', album.id),
      attributes: {
        artistName: album.artistName,
        artworkAssetId: album.artworkAssetId,
        editorialArtworkAssetId: album.editorialArtworkAssetId,
        editorialVideoAssetId: album.editorialVideoAssetId,
        artwork: this.artwork(album.artwork),
        audioTraits: album.audioTraits,
        // Album cards are the main Home surface. Aggregate the AI features of
        // their analysed tracks so album ranking can use the same sound
        // signals as Daily Mix without storing a second source of truth.
        audioAnalysisCoverage: tracks.length
          ? analyzedTracks.length / tracks.length
          : 0,
        audioBpm,
        audioEnergy,
        audioTags,
        contentRating: album.contentRating,
        copyright: album.copyright,
        genreNames: album.genreNames,
        isCompilation: album.isCompilation,
        isComplete: album.isComplete,
        isStudioMastered: album.isStudioMastered,
        isPrerelease: album.isPrerelease,
        releaseType: album.releaseType,
        name: album.name,
        playParams: { id: album.id, kind: 'album', versionHash: '' },
        recordLabel: album.recordLabel,
        releaseDate: this.dateOnly(album.releaseDate),
        trackCount: tracks.length || album._count?.tracks || album.trackCount,
        upc: album.upc,
        canonicalReleaseId: album.canonicalReleaseId || album.id,
        relatedShelfHints,
        url: album.url,
        editorialArtwork: this.optionalObject(album.editorialArtwork),
        editorialNotes: this.optionalObject(album.editorialNotes),
        editorialVideo: this.optionalObject(album.editorialVideo),
        offers: this.toStructArray(album.offers),
      },
      relationships: {
        artists: {
          href: `${this.href(storefront, 'albums', album.id)}/artists`,
          data: artistData,
        },
        tracks: {
          href: `${this.href(storefront, 'albums', album.id)}/tracks`,
          data: trackData,
        },
      },
    };
  }

  private async albumRelatedShelfHints(
    album: CatalogAlbumEntity,
    storefront: string,
    recommendedAlbumIds: string[] = [],
  ) {
    const primaryArtists = this.primaryAlbumArtists(album);
    const primaryArtistIds = primaryArtists.map(({ id }) => id);
    return this.albumRelatedShelfAvailability(
      album,
      storefront,
      primaryArtistIds,
      recommendedAlbumIds,
    );
  }

  private async albumRelatedShelfAvailability(
    album: CatalogAlbumEntity,
    storefront: string,
    moreByArtistIds: string[],
    recommendedAlbumIds: string[],
  ) {
    const primaryArtists = this.primaryAlbumArtists(album);
    const primaryArtist = primaryArtists[0];
    const primaryArtistIds = primaryArtists.map(({ id }) => id);
    const albumSongIds = album.tracks.map(({ songId }) => songId);
    const excludedAlbumIds = [album.id];
    const personalizedYouMightAlsoLike = recommendedAlbumIds.length
      ? this.recommendedAlbumBrowse(
          recommendedAlbumIds,
          excludedAlbumIds,
          storefront,
        )
      : null;
    const [moreBy, exactFeaturedOn, genericYouMightAlsoLike] =
      await Promise.all([
        primaryArtistIds.length || moreByArtistIds.length
          ? this.prisma.album.findFirst({
              where: {
                storefront,
                id: { notIn: excludedAlbumIds },
                ...this.moreByAlbumWhere(primaryArtistIds, moreByArtistIds),
              },
              select: { id: true },
            })
          : null,
        albumSongIds.length
          ? this.prisma.playlist.findFirst({
              where: {
                storefront,
                isPublic: true,
                playlistType: { not: 'system-personalized' },
                tracks: { some: { songId: { in: albumSongIds } } },
              },
              select: { id: true },
            })
          : null,
        personalizedYouMightAlsoLike ??
          this.prisma.album.findFirst({
            where: {
              storefront,
              id: { notIn: excludedAlbumIds },
              ...(album.genreNames.length
                ? { genreNames: { hasSome: album.genreNames } }
                : {}),
              ...(primaryArtistIds.length
                ? {
                    artistCredits: {
                      none: {
                        artistId: { in: primaryArtistIds },
                        isPrimary: true,
                      },
                    },
                  }
                : {}),
            },
            select: { id: true },
          }),
      ]);
    const featuredOn =
      exactFeaturedOn ??
      (primaryArtist
        ? await this.prisma.playlist.findFirst({
            where: {
              storefront,
              isPublic: true,
              playlistType: 'editorial',
              artistNames: { has: primaryArtist.name },
            },
            select: { id: true },
          })
        : null);
    return {
      moreBy: Boolean(moreBy),
      featuredOn: Boolean(featuredOn),
      youMightAlsoLike: Boolean(
        Array.isArray(genericYouMightAlsoLike)
          ? genericYouMightAlsoLike.length
          : genericYouMightAlsoLike,
      ),
    };
  }

  private playlistResource(
    playlist: CatalogPlaylistEntity | CatalogPlaylistBrowseEntity,
    storefront: string,
    trackData: CatalogReference[],
  ): CatalogPlaylistResource {
    return {
      id: playlist.id,
      type: 'playlists',
      href: this.href(storefront, 'playlists', playlist.id),
      attributes: {
        artworkAssetId: playlist.artworkAssetId,
        editorialArtworkAssetId: playlist.editorialArtworkAssetId,
        editorialVideoAssetId: playlist.editorialVideoAssetId,
        artwork: this.artwork(playlist.artwork),
        artistNames: playlist.artistNames,
        audioTraits: playlist.audioTraits,
        curatorName: playlist.curatorName,
        descriptionShort: playlist.descriptionShort,
        descriptionStandard: playlist.descriptionStandard,
        name: playlist.name,
        playParams: {
          id: playlist.id,
          kind: 'playlist',
          versionHash: playlist.versionHash,
        },
        playlistType: playlist.playlistType,
        lastModifiedDate: playlist.lastModifiedAt?.toISOString() ?? '',
        url: playlist.url,
        editorialArtwork: this.optionalObject(playlist.editorialArtwork),
        editorialNotes: this.optionalObject(playlist.editorialNotes),
        editorialVideo: this.optionalObject(playlist.editorialVideo),
        plainEditorialCard: this.optionalObject(playlist.plainEditorialCard),
        plainEditorialNotes: this.optionalObject(playlist.plainEditorialNotes),
        editorialPlaylistKind: playlist.editorialPlaylistKind,
        hasCollaboration: playlist.hasCollaboration,
        isChart: playlist.isChart,
        supportsSing: playlist.supportsSing,
      },
      relationships: {
        tracks: {
          href: `${this.href(storefront, 'playlists', playlist.id)}/tracks`,
          data: trackData,
        },
      },
    };
  }

  private songResource(
    song: CatalogSongEntity,
    storefront: string,
    sourceAlbumId?: string,
  ): CatalogSongResource {
    const sourceAlbum =
      song.albumTracks.find((track) => track.album.id === sourceAlbumId)
        ?.album ?? song.albumTracks[0]?.album;
    const artistCredits = song.artistCredits.filter(
      (credit) => credit.role === 'artist',
    );
    const composerCredits = song.artistCredits.filter(
      (credit) => credit.role === 'composer',
    );
    return {
      id: song.id,
      type: 'songs',
      href: this.href(storefront, 'songs', song.id),
      attributes: {
        albumName: sourceAlbum?.name || song.albumName,
        // The scalar is the source display credit supplied during seeding.
        // Keep it verbatim; primary-credit flags model roles, not the text
        // that must be shown for a song.
        artistName: song.artistName,
        // Recommendation uses this denormalized set to locate an artist's
        // recordings without confusing artists that share a display name.
        artistNames: artistCredits.map((credit) => credit.artist.name),
        artwork: this.artwork(sourceAlbum?.artwork),
        extendedAssetUrls: this.optionalObject(song.extendedAssetUrls),
        offers: this.toStructArray(song.offers),
        audioLocale: song.audioLocale,
        audioTraits: song.audioTraits,
        moodTags: song.moodTags,
        // These values are produced once by the upload-time audio analysis.
        // They travel with the catalog snapshot so Recommendation can build a
        // listener's audio taste without ever calling the GPU service on Home.
        audioAnalysisStatus: song.audioAnalysisStatus,
        audioAnalysisVersion: song.audioAnalysisVersion,
        audioBpm: song.audioBpm ?? 0,
        audioEnergy: song.audioEnergy ?? 0,
        audioTags: song.audioTags,
        composerName: song.composerName,
        credits: song.artistCredits.map((credit) => ({
          artistId: credit.artist.id,
          name: credit.artist.name,
          url: credit.artist.url,
          role: credit.role,
          position: credit.position,
          isPrimary: credit.isPrimary,
        })),
        contributorCredits: song.contributorCredits.map((credit) => ({
          name: credit.name,
          role: credit.role,
          position: credit.position,
        })),
        contentRating: song.contentRating,
        discNumber: song.discNumber,
        durationInMillis:
          song.durationInMillis || Math.max(0, song.durationSec * 1000),
        genreNames: song.genreNames,
        hasLyrics: song.hasLyrics,
        hasTimeSyncedLyrics: song.hasTimeSyncedLyrics,
        isHighResolutionMaster: song.isHighResolutionMaster,
        isStudioMastered: song.isStudioMastered,
        isVocalAttenuationAllowed: song.isVocalAttenuationAllowed,
        isrc: song.isrc ?? '',
        name: song.catalogTitle,
        playParams: { id: song.id, kind: 'song', versionHash: '' },
        previews: song.previewUrl ? [{ url: song.previewUrl }] : [],
        releaseDate: this.dateOnly(song.releaseDate),
        trackNumber: song.trackNumber,
        url: song.catalogUrl,
      },
      relationships: {
        albums: {
          href: `${this.href(storefront, 'songs', song.id)}/albums`,
          data: song.albumTracks.map(({ id, album }) => ({
            ...this.reference(album.id, 'albums', storefront),
            meta: { popularity: 0, releaseTrackId: id },
          })),
        },
        artists: {
          href: `${this.href(storefront, 'songs', song.id)}/artists`,
          data: artistCredits.map(({ artist }) =>
            this.reference(artist.id, 'artists', storefront),
          ),
        },
        composers: {
          href: `${this.href(storefront, 'songs', song.id)}/composers`,
          data: composerCredits.map(({ artist }) =>
            this.reference(artist.id, 'artists', storefront),
          ),
        },
      },
    };
  }

  private collectArtists(
    songs: CatalogSongEntity[],
    additional: CatalogAlbumEntity['artistCredits'][number]['artist'][],
    storefront: string,
  ): Record<string, CatalogArtistResource> {
    const artists = new Map(
      additional.map((artist) => [artist.id, artist] as const),
    );
    for (const song of songs) {
      for (const { artist } of song.artistCredits) {
        artists.set(artist.id, artist);
      }
    }

    return Object.fromEntries(
      [...artists.values()].map((artist) => [
        artist.id,
        this.artistResource(artist, storefront),
      ]),
    );
  }

  private collectAlbumArtists(
    albums: AlbumResourceInput[],
    storefront: string,
  ): Record<string, CatalogArtistResource> {
    return Object.fromEntries(
      albums.flatMap((album) =>
        album.artistCredits.map(({ artist }) => [
          artist.id,
          this.artistResource(artist, storefront),
        ]),
      ),
    );
  }

  private protobufStruct(value: unknown): ProtobufStruct | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return {
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.protobufValue(item),
        ]),
      ),
    };
  }

  private protobufValue(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) {
      return {
        nullValue: 0,
        numberValue: undefined,
        stringValue: undefined,
        boolValue: undefined,
        structValue: undefined,
        listValue: undefined,
      };
    }
    if (Array.isArray(value)) {
      return {
        nullValue: undefined,
        numberValue: undefined,
        stringValue: undefined,
        boolValue: undefined,
        structValue: undefined,
        listValue: {
          values: value.map((item) => this.protobufValue(item)),
        },
      };
    }
    if (typeof value === 'object') {
      return {
        nullValue: undefined,
        numberValue: undefined,
        stringValue: undefined,
        boolValue: undefined,
        structValue: this.protobufStruct(value),
        listValue: undefined,
      };
    }

    return {
      nullValue: undefined,
      numberValue: typeof value === 'number' ? value : undefined,
      stringValue: typeof value === 'string' ? value : undefined,
      boolValue: typeof value === 'boolean' ? value : undefined,
      structValue: undefined,
      listValue: undefined,
    };
  }

  private artistResource(
    artist: CatalogArtistEntity,
    storefront: string,
  ): CatalogArtistResource {
    return {
      id: artist.id,
      type: 'artists',
      href: this.href(storefront, 'artists', artist.id),
      attributes: {
        name: artist.name,
        url: artist.url,
        artworkAssetId: artist.artworkAssetId,
        artwork: this.artwork(artist.artwork),
        genreNames: artist.genreNames,
        origin: artist.origin ?? '',
        birthDate: this.dateOnly(artist.birthDate),
        biography: artist.biography ?? '',
        biographySourceUrl: artist.biographySourceUrl ?? '',
        editorialVideoAssetId: artist.editorialVideoAssetId,
        editorialVideo: this.optionalObject(artist.editorialVideo),
      },
    };
  }

  private reference(
    id: string,
    type: string,
    storefront: string,
  ): CatalogReference {
    return { id, type, href: this.href(storefront, type, id), meta: undefined };
  }

  private href(storefront: string, type: string, id: string): string {
    return `/v1/catalog/${storefront}/${type}/${id}`;
  }

  private artwork(value: Prisma.JsonValue | null): CatalogArtwork | undefined {
    const artwork = this.optionalObject(value);
    if (!artwork) return undefined;
    return {
      url: this.string(artwork.url),
      bgColor: this.string(artwork.bgColor ?? artwork.bg_color),
      textColor1: this.string(artwork.textColor1 ?? artwork.text_color1),
      textColor2: this.string(artwork.textColor2 ?? artwork.text_color2),
      textColor3: this.string(artwork.textColor3 ?? artwork.text_color3),
      textColor4: this.string(artwork.textColor4 ?? artwork.text_color4),
      width: this.integer(artwork.width),
      height: this.integer(artwork.height),
      hasP3: this.boolean(artwork.hasP3 ?? artwork.has_p3),
      variants: this.optionalObject(artwork.variants),
      perceptualHash: this.string(artwork.perceptualHash),
    };
  }

  private systemPlaylistArtwork(
    request: UpsertSystemPlaylistRequest,
  ): Prisma.InputJsonObject | undefined {
    if (!request.artworkUrl) return undefined;

    const variants = this.parseJsonObject(request.artworkVariantsJson);
    return {
      url: request.artworkUrl,
      bgColor: request.artworkBgColor || '2c2c2e',
      ...(request.artworkWidth > 0 ? { width: request.artworkWidth } : {}),
      ...(request.artworkHeight > 0 ? { height: request.artworkHeight } : {}),
      ...(variants && Object.keys(variants).length > 0 ? { variants } : {}),
    } as Prisma.InputJsonObject;
  }

  private parseJsonObject(value: string): JsonObject | undefined {
    if (!value) return undefined;
    try {
      return this.optionalObject(JSON.parse(value));
    } catch {
      return undefined;
    }
  }

  private storefront(value: string): string {
    const storefront = value.trim().toLowerCase() || DEFAULT_STOREFRONT;
    if (!/^[a-z]{2}$/.test(storefront)) {
      this.throwInvalidArgument('STOREFRONT_INVALID');
    }
    return storefront;
  }

  private optionalObject(value: unknown): JsonObject | undefined {
    return this.isObject(value) ? value : undefined;
  }

  private toStructArray(value: unknown): JsonObject[] {
    if (!Array.isArray(value)) return [];
    return value.filter(this.isObject);
  }

  private readonly isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  private string(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private integer(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.trunc(value)
      : fallback;
  }

  private boolean(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private dateOnly(value: Date | null): string {
    return value?.toISOString().slice(0, 10) ?? '';
  }

  private required(value: string, message: string): string {
    const result = value.trim();
    if (!result) this.throwInvalidArgument(message);
    return result;
  }

  private throwInvalidArgument(message: string): never {
    throw new RpcException({ code: status.INVALID_ARGUMENT, message });
  }

  private throwNotFound(message: string): never {
    throw new RpcException({ code: status.NOT_FOUND, message });
  }

  private browseOffset(cursor: string): number {
    if (!cursor) return 0;
    if (!/^\d+$/.test(cursor)) {
      this.throwInvalidArgument('CATALOG_CURSOR_INVALID');
    }

    const offset = Number(cursor);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      this.throwInvalidArgument('CATALOG_CURSOR_INVALID');
    }
    if (offset > MAX_BROWSE_OFFSET) {
      // Guard against unbounded deep offset scans. Beyond this depth, callers
      // should switch to sync (id keyset) pagination.
      this.throwInvalidArgument('CATALOG_CURSOR_TOO_DEEP');
    }
    return offset;
  }

  async browseCatalog(
    request: BrowseCatalogRequest,
  ): Promise<BrowseCatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const resourceType = request.resourceType || 'songs';
    const limit = Math.min(Math.max(request.limit || 20, 1), 100);
    const sort = request.sort || 'latest';
    const syncById = sort === 'sync';
    const offset = syncById ? 0 : this.browseOffset(request.cursor);

    const orderBy =
      sort === 'name'
        ? { name: 'asc' as const }
        : { createdAt: 'desc' as const };
    const songOrderBy =
      sort === 'name'
        ? { catalogTitle: 'asc' as const }
        : { createdAt: 'desc' as const };

    if (resourceType === 'artists') {
      const artists = await this.prisma.artist.findMany({
        where: { storefront },
        orderBy: syncById ? { id: 'asc' } : orderBy,
        cursor: syncById && request.cursor ? { id: request.cursor } : undefined,
        skip: syncById && request.cursor ? 1 : offset,
        take: limit + 1,
      });
      const hasMore = artists.length > limit;
      const page = artists.slice(0, limit);

      return {
        data: page.map((a) => this.reference(a.id, 'artists', storefront)),
        resources: {
          albums: {},
          playlists: {},
          songs: {},
          artists: Object.fromEntries(
            page.map((a) => [a.id, this.artistResource(a, storefront)]),
          ),
        },
        nextCursor: hasMore
          ? syncById
            ? (page[page.length - 1]?.id ?? '')
            : String(offset + page.length)
          : '',
        hasMore,
      };
    }

    if (resourceType === 'albums') {
      const albumOrderBy =
        sort === 'name'
          ? { name: 'asc' as const }
          : { releaseDate: 'desc' as const };

      const albums = await this.prisma.album.findMany({
        where: { storefront },
        // Recommendation's sync feed needs track-level AI metadata to derive
        // a compact album audio profile. Public browse remains lightweight.
        include: syncById ? albumCatalogInclude : albumCatalogBrowseInclude,
        orderBy: syncById ? { id: 'asc' } : albumOrderBy,
        cursor: syncById && request.cursor ? { id: request.cursor } : undefined,
        skip: syncById && request.cursor ? 1 : offset,
        take: limit + 1,
      });
      const hasMore = albums.length > limit;
      const page = albums.slice(0, limit);

      return {
        data: page.map((a) => this.reference(a.id, 'albums', storefront)),
        resources: {
          albums: Object.fromEntries(
            page.map((a) => [
              a.id,
              this.albumResource(a as AlbumResourceInput, storefront),
            ]),
          ),
          playlists: {},
          songs: {},
          artists: {},
        },
        nextCursor: hasMore
          ? syncById
            ? (page[page.length - 1]?.id ?? '')
            : String(offset + page.length)
          : '',
        hasMore,
      };
    }

    if (resourceType === 'playlists') {
      const playlists = await this.prisma.playlist.findMany({
        where: {
          storefront,
          isPublic: true,
          playlistType: { not: 'system-personalized' },
        },
        include: playlistCatalogBrowseInclude,
        orderBy: syncById ? { id: 'asc' } : orderBy,
        cursor: syncById && request.cursor ? { id: request.cursor } : undefined,
        skip: syncById && request.cursor ? 1 : offset,
        take: limit + 1,
      });
      const hasMore = playlists.length > limit;
      const page = playlists.slice(0, limit);

      return {
        data: page.map((p) => this.reference(p.id, 'playlists', storefront)),
        resources: {
          albums: {},
          playlists: Object.fromEntries(
            page.map((p) => [
              p.id,
              this.playlistResource(
                p,
                storefront,
                p.tracks.map(({ songId }) =>
                  this.reference(songId, 'songs', storefront),
                ),
              ),
            ]),
          ),
          songs: {},
          artists: {},
        },
        nextCursor: hasMore
          ? syncById
            ? (page[page.length - 1]?.id ?? '')
            : String(offset + page.length)
          : '',
        hasMore,
      };
    }

    const songs = await this.prisma.song.findMany({
      where: { storefront, isCatalog: true },
      include: songCatalogInclude,
      orderBy: syncById ? { id: 'asc' } : songOrderBy,
      cursor: syncById && request.cursor ? { id: request.cursor } : undefined,
      skip: syncById && request.cursor ? 1 : offset,
      take: limit + 1,
    });
    const hasMore = songs.length > limit;
    const page = songs.slice(0, limit);

    return {
      data: page.map((s) => this.reference(s.id, 'songs', storefront)),
      resources: {
        albums: {},
        playlists: {},
        songs: Object.fromEntries(
          page.map((s) => [s.id, this.songResource(s, storefront)]),
        ),
        artists: {},
      },
      nextCursor: hasMore
        ? syncById
          ? (page[page.length - 1]?.id ?? '')
          : String(offset + page.length)
        : '',
      hasMore,
    };
  }

  async searchCatalog(
    request: SearchCatalogRequest,
  ): Promise<SearchCatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const query = request.query.trim();
    const limit = Math.min(Math.max(request.limit || 20, 1), 50);

    const requestedTypes = request.types?.length
      ? request.types
      : ['songs', 'artists', 'albums', 'playlists'];
    const wanted = new Set(requestedTypes);

    // Short-circuit on an empty query: LIKE '%%' would scan every row and
    // return an arbitrary page rather than a relevant match set.
    if (!query) {
      return {
        data: [],
        resources: { albums: {}, playlists: {}, songs: {}, artists: {} },
      };
    }

    const [songs, artists, albums, playlists] = await Promise.all([
      wanted.has('songs')
        ? this.prisma.song.findMany({
            where: {
              storefront,
              isCatalog: true,
              OR: [
                { catalogTitle: { contains: query, mode: 'insensitive' } },
                {
                  artistCredits: {
                    some: {
                      role: 'artist',
                      artist: {
                        name: { contains: query, mode: 'insensitive' },
                      },
                    },
                  },
                },
                {
                  albumTracks: {
                    some: {
                      album: {
                        name: { contains: query, mode: 'insensitive' },
                      },
                    },
                  },
                },
              ],
            },
            include: songCatalogInclude,
            orderBy: { catalogTitle: 'asc' },
            take: limit,
          })
        : Promise.resolve([] as CatalogSongEntity[]),
      wanted.has('artists')
        ? this.prisma.artist.findMany({
            where: {
              storefront,
              name: { contains: query, mode: 'insensitive' },
            },
            orderBy: { name: 'asc' },
            take: limit,
          })
        : Promise.resolve([] as CatalogArtistEntity[]),
      wanted.has('albums')
        ? this.prisma.album.findMany({
            where: {
              storefront,
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                {
                  artistName: { contains: query, mode: 'insensitive' },
                },
                {
                  artistCredits: {
                    some: {
                      artist: {
                        name: { contains: query, mode: 'insensitive' },
                      },
                    },
                  },
                },
              ],
            },
            include: albumCatalogBrowseInclude,
            orderBy: { name: 'asc' },
            take: limit,
          })
        : Promise.resolve([] as CatalogAlbumBrowseEntity[]),
      wanted.has('playlists')
        ? this.prisma.playlist.findMany({
            where: {
              storefront,
              isPublic: true,
              name: { contains: query, mode: 'insensitive' },
            },
            include: playlistCatalogBrowseInclude,
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: limit,
          })
        : Promise.resolve([] as CatalogPlaylistBrowseEntity[]),
    ]);
    // Search cards need linked artist resources even when the artist itself
    // does not match the query. Without these, a song/album result loses its
    // clickable artist metadata despite the relation already being loaded.
    const searchArtists = new Map(
      [
        ...artists,
        ...songs.flatMap((song) =>
          song.artistCredits.map((credit) => credit.artist),
        ),
        ...albums.flatMap((album) =>
          album.artistCredits.map((credit) => credit.artist),
        ),
      ].map((artist) => [artist.id, artist] as const),
    );

    return {
      data: [
        ...songs.map((s) => this.reference(s.id, 'songs', storefront)),
        ...artists.map((a) => this.reference(a.id, 'artists', storefront)),
        ...albums.map((a) => this.reference(a.id, 'albums', storefront)),
        ...playlists.map((p) => this.reference(p.id, 'playlists', storefront)),
      ],
      resources: {
        albums: Object.fromEntries(
          albums.map((a) => [a.id, this.albumResource(a, storefront)]),
        ),
        playlists: Object.fromEntries(
          playlists.map((p) => [
            p.id,
            this.playlistResource(
              p,
              storefront,
              p.tracks.map((track) =>
                this.reference(track.songId, 'songs', storefront),
              ),
            ),
          ]),
        ),
        songs: Object.fromEntries(
          songs.map((s) => [s.id, this.songResource(s, storefront)]),
        ),
        artists: Object.fromEntries(
          [...searchArtists.values()].map((artist) => [
            artist.id,
            this.artistResource(artist, storefront),
          ]),
        ),
      },
    };
  }
}
