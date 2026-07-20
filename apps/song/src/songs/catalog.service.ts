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
  GetCatalogResourcesRequest,
  GetCatalogArtistAlbumsRequest,
  GetCatalogArtistSongsRequest,
  GetCatalogArtistSongsResponse,
  ProtobufStruct,
  SearchCatalogRequest,
  SearchCatalogResponse,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

const songCatalogInclude = {
  artistCredits: {
    include: { artist: true },
    orderBy: [{ role: 'asc' }, { position: 'asc' }],
  },
  albumTracks: {
    include: { album: { select: { id: true } } },
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
type CatalogAlbumEntity = Prisma.AlbumGetPayload<{
  include: typeof albumCatalogInclude;
}>;
type CatalogAlbumBrowseEntity = Prisma.AlbumGetPayload<{
  include: typeof albumCatalogBrowseInclude;
}>;
// Accepts either the full album (with tracks) or the lighter browse album.
// The `tracks` relation is optional so the mapper can tolerate its absence.
type AlbumResourceInput = CatalogAlbumBrowseEntity & {
  tracks?: CatalogAlbumEntity['tracks'];
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
const ARTIST_SONG_PAGE_DEFAULT = 20;
const ARTIST_SONG_PAGE_MAX = 50;
// Ceiling for offset-based browse pagination. Offset degrades linearly at
// depth; keyset would require encoding the sort column into the cursor
// (a cursor-format/proto change), so deep offsets are rejected instead.
const MAX_BROWSE_OFFSET = 10_000;
const BATCH_RESOURCE_TYPES = new Set([
  'albums',
  'playlists',
  'songs',
  'artists',
]);

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) { }

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

    return this.albumResponse(album, storefront);
  }

  async getPlaylist(
    request: GetCatalogPlaylistRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const playlistId = this.required(
      request.playlistId,
      'PLAYLIST_ID_REQUIRED',
    );
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, storefront, isPublic: true },
      include: playlistCatalogInclude,
    });

    if (!playlist) {
      this.throwNotFound('PLAYLIST_NOT_FOUND');
    }

    return this.playlistResponse(playlist, storefront, true);
  }

  async getPlaylistTracks(
    request: GetCatalogPlaylistRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const playlistId = this.required(
      request.playlistId,
      'PLAYLIST_ID_REQUIRED',
    );
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, storefront, isPublic: true },
      include: playlistCatalogInclude,
    });

    if (!playlist) {
      this.throwNotFound('PLAYLIST_NOT_FOUND');
    }

    return this.playlistResponse(playlist, storefront, false);
  }

  async getArtistAlbums(
    request: GetCatalogArtistAlbumsRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    const artistId = this.required(request.artistId, 'ARTIST_ID_REQUIRED');

    const artistExists = await this.prisma.artist.findFirst({
      where: { id: artistId, storefront },
    });
    if (!artistExists) {
      this.throwNotFound('ARTIST_NOT_FOUND');
    }

    const albums = await this.prisma.album.findMany({
      where: {
        storefront,
        artistCredits: {
          some: { artistId },
        },
      },
      include: albumCatalogBrowseInclude,
      // The current contract has no album cursor, so return the complete
      // discography instead of silently truncating artists above a fixed cap.
      orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
    });

    const albumResources = Object.fromEntries(
      albums.map((album) => [
        album.id,
        this.albumResource(album, storefront),
      ]),
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
        some: { artistId },
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
      songs.map((song) => [
        song.id,
        this.songResource(song, storefront),
      ]),
    );
    const albumIds = [
      ...new Set(
        songs.flatMap((song) =>
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
    const albumResources = Object.fromEntries(
      albums.map((album) => [
        album.id,
        this.albumResource(album, storefront),
      ]),
    );
    const artistResources = {
      ...this.collectArtists(songs, [artistExists], storefront),
      ...this.collectAlbumArtists(albums, storefront),
    };

    return {
      catalog: {
        data: songs.map((song) =>
          this.reference(song.id, 'songs', storefront),
        ),
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

  async getResources(
    request: GetCatalogResourcesRequest,
  ): Promise<CatalogResponse> {
    const storefront = this.storefront(request.storefront);
    if (request.resources.length > MAX_BATCH_RESOURCES) {
      this.throwInvalidArgument('CATALOG_RESOURCE_BATCH_TOO_LARGE');
    }

    const identifiers = request.resources.map((resource) => {
      const type = this.required(resource.type, 'CATALOG_RESOURCE_TYPE_REQUIRED');
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
      uniqueSongs.map((song) => [
        song.id,
        this.songResource(song, storefront),
      ]),
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
  ): CatalogResponse {
    const songs = Object.fromEntries(
      album.tracks.map(({ song }) => [
        song.id,
        this.songResource(song, storefront),
      ]),
    );
    const artists = this.collectArtists(
      album.tracks.map(({ song }) => song),
      album.artistCredits.map(({ artist }) => artist),
      storefront,
    );
    const albumResource = this.albumResource(album, storefront);

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

  private playlistResponse(
    playlist: CatalogPlaylistEntity,
    storefront: string,
    includePlaylist: boolean,
  ): CatalogResponse {
    const songs = Object.fromEntries(
      playlist.tracks.map(({ song }) => [
        song.id,
        this.songResource(song, storefront),
      ]),
    );
    const artists = this.collectArtists(
      playlist.tracks.map(({ song }) => song),
      [],
      storefront,
    );
    const trackData = playlist.tracks.map(({ song }) =>
      this.reference(song.id, 'songs', storefront),
    );

    return {
      data: includePlaylist
        ? [this.reference(playlist.id, 'playlists', storefront)]
        : trackData,
      resources: {
        albums: {},
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
  ): CatalogAlbumResource {
    const tracks = album.tracks ?? [];
    const artistData = album.artistCredits.map(({ artist }) =>
      this.reference(artist.id, 'artists', storefront),
    );
    const trackData = tracks.map(({ song, popularity }) => ({
      ...this.reference(song.id, 'songs', storefront),
      meta:
        popularity === null
          ? undefined
          : {
            popularity,
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
        contentRating: album.contentRating,
        copyright: album.copyright,
        genreNames: album.genreNames,
        isCompilation: album.isCompilation,
        isComplete: album.isComplete,
        isStudioMastered: album.isStudioMastered,
        isPrerelease: album.isPrerelease,
        isSingle: album.isSingle,
        name: album.name,
        playParams: { id: album.id, kind: 'album', versionHash: '' },
        recordLabel: album.recordLabel,
        releaseDate: this.dateOnly(album.releaseDate),
        trackCount: album.trackCount || tracks.length,
        upc: album.upc,
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
  ): CatalogSongResource {
    const artistCredits = song.artistCredits.filter(
      (credit) => credit.role !== 'composer',
    );
    const composerCredits = song.artistCredits.filter(
      (credit) => credit.role === 'composer',
    );

    return {
      id: song.id,
      type: 'songs',
      href: this.href(storefront, 'songs', song.id),
      attributes: {
        albumName: song.albumName,
        artistName: song.artistName,
        artworkAssetId: song.artworkAssetId,
        editorialArtworkAssetId: song.editorialArtworkAssetId,
        artwork: this.artwork(song.artwork),
        editorialArtwork: this.optionalObject(song.editorialArtwork),
        extendedAssetUrls: this.optionalObject(song.extendedAssetUrls),
        offers: this.toStructArray(song.offers),
        audioLocale: song.audioLocale,
        audioTraits: song.audioTraits,
        composerName: song.composerName,
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
          data: song.albumTracks.map(({ album }) =>
            this.reference(album.id, 'albums', storefront),
          ),
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
    albums: CatalogAlbumBrowseEntity[],
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

  private protobufStructList(value: Prisma.JsonValue | null): ProtobufStruct[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      const struct = this.protobufStruct(item);
      return struct ? [struct] : [];
    });
  }

  private protobufValue(
    value: unknown,
  ): Record<string, unknown> {
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
    artist: CatalogAlbumEntity['artistCredits'][number]['artist'],
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
    };
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

  private optionalDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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
      sort === 'name' ? { name: 'asc' as const } : { createdAt: 'desc' as const };
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
            ? page[page.length - 1]?.id ?? ''
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
        include: albumCatalogBrowseInclude,
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
            page.map((a) => [a.id, this.albumResource(a, storefront)]),
          ),
          playlists: {},
          songs: {},
          artists: {},
        },
        nextCursor: hasMore
          ? syncById
            ? page[page.length - 1]?.id ?? ''
            : String(offset + page.length)
          : '',
        hasMore,
      };
    }

    if (resourceType === 'playlists') {
      const playlists = await this.prisma.playlist.findMany({
        where: { storefront, isPublic: true },
        include: playlistCatalogBrowseInclude,
        orderBy: syncById ? { id: 'asc' } : orderBy,
        cursor: syncById && request.cursor ? { id: request.cursor } : undefined,
        skip: syncById && request.cursor ? 1 : offset,
        take: limit + 1,
      });
      const hasMore = playlists.length > limit;
      const page = playlists.slice(0, limit);

      return {
        data: page.map((p) =>
          this.reference(p.id, 'playlists', storefront),
        ),
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
            ? page[page.length - 1]?.id ?? ''
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
          ? page[page.length - 1]?.id ?? ''
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
      : ['songs', 'artists', 'albums'];
    const wanted = new Set(requestedTypes);

    // Short-circuit on an empty query: LIKE '%%' would scan every row and
    // return an arbitrary page rather than a relevant match set.
    if (!query) {
      return {
        data: [],
        resources: { albums: {}, playlists: {}, songs: {}, artists: {} },
      };
    }

    const [songs, artists, albums] = await Promise.all([
      wanted.has('songs')
        ? this.prisma.song.findMany({
            where: {
              storefront,
              isCatalog: true,
              catalogTitle: { contains: query, mode: 'insensitive' },
            },
            include: songCatalogInclude,
            orderBy: { catalogTitle: 'asc' },
            take: limit,
          })
        : Promise.resolve([]),
      wanted.has('artists')
        ? this.prisma.artist.findMany({
            where: {
              storefront,
              name: { contains: query, mode: 'insensitive' },
            },
            orderBy: { name: 'asc' },
            take: limit,
          })
        : Promise.resolve([]),
      wanted.has('albums')
        ? this.prisma.album.findMany({
            where: {
              storefront,
              name: { contains: query, mode: 'insensitive' },
            },
            include: albumCatalogBrowseInclude,
            orderBy: { name: 'asc' },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    return {
      data: [
        ...songs.map((s) => this.reference(s.id, 'songs', storefront)),
        ...artists.map((a) => this.reference(a.id, 'artists', storefront)),
        ...albums.map((a) => this.reference(a.id, 'albums', storefront)),
      ],
      resources: {
        albums: Object.fromEntries(
          albums.map((a) => [a.id, this.albumResource(a, storefront)]),
        ),
        playlists: {},
        songs: Object.fromEntries(
          songs.map((s) => [s.id, this.songResource(s, storefront)]),
        ),
        artists: Object.fromEntries(
          artists.map((a) => [a.id, this.artistResource(a, storefront)]),
        ),
      },
    };
  }
}
