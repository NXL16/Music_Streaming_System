import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../generated/prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class {},
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
  },
  PrismaClient: class {},
}));
jest.mock('@musical/shared-proto', () => ({
  AudioMode: {
    AUDIO_MODE_SING: 2,
    AUDIO_MODE_STANDARD: 1,
  },
  SongStatus: {
    SONG_STATUS_READY: 3,
  },
  PreferenceEventType: {
    PREFERENCE_EVENT_TYPE_PLAYLIST_TRACK_ADDED: 7,
  },
}));
jest.mock('@musical/shared-constants', () => ({
  PREFERENCE_SIGNAL_WEIGHT: {
    PLAYLIST_TRACK_ADDED: 1,
  },
}));
jest.mock('@musical/shared-types', () => ({
  getArtworkRenditionSrcSet: jest.fn(),
}));

import { SongsService } from './songs.service';

type Track = { position: number; song: { id: string } };
type PlaylistAccessCase = [
  label: string,
  playlist: { userId: string; isPublic: boolean } | null,
  requesterUserId: string,
  code: number,
];

const playlistAccessCases: PlaylistAccessCase[] = [
  ['missing playlist', null, 'owner', status.NOT_FOUND],
  [
    'private playlist owned by another user',
    { userId: 'owner', isPublic: false },
    'listener',
    status.PERMISSION_DENIED,
  ],
];

async function expectRpcCode(request: Promise<unknown>, code: number) {
  try {
    await request;
    throw new Error('EXPECTED_RPC_EXCEPTION');
  } catch (error) {
    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toMatchObject({ code });
  }
}

function createService(options?: {
  playlist?: { userId: string; isPublic: boolean } | null;
  tracks?: Track[];
}) {
  const findUnique = jest
    .fn()
    .mockResolvedValue(
      options?.playlist === undefined
        ? { userId: 'owner', isPublic: false }
        : options.playlist,
    );
  const findMany = jest.fn().mockResolvedValue(options?.tracks ?? []);
  const service = Object.create(SongsService.prototype) as SongsService;

  Object.assign(service as object, {
    prisma: {
      userPlaylist: { findUnique },
      userPlaylistTrack: { findMany },
    },
    mapEntityToSummary: jest.fn((song: { id: string }) => ({ id: song.id })),
  });

  return { service, findUnique, findMany };
}

function createAddTrackService(options?: {
  playlist?: { userId: string; isPublic: boolean } | null;
  song?: {
    id: string;
    status: number;
    isCatalog: boolean;
    owners: { userId: string; isPublic: boolean }[];
  } | null;
  existingTrack?: { songId: string } | null;
  maxPosition?: number | null;
}) {
  const create = jest.fn().mockResolvedValue({});
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    userPlaylist: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options?.playlist ?? { userId: 'owner', isPublic: false },
        ),
    },
    song: {
      findUnique: jest.fn().mockResolvedValue(
        options?.song ?? {
          id: 'song',
          status: 3,
          isCatalog: false,
          owners: [{ userId: 'owner', isPublic: false }],
        },
      ),
    },
    albumTrack: {
      findUnique: jest.fn().mockResolvedValue({ songId: 'song' }),
    },
    userPlaylistTrack: {
      findUnique: jest.fn().mockResolvedValue(options?.existingTrack ?? null),
      aggregate: jest.fn().mockResolvedValue({
        _max: { position: options?.maxPosition ?? null },
      }),
      create,
    },
    preferenceOutbox: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const service = Object.create(SongsService.prototype) as SongsService;
  Object.assign(service as object, {
    prisma: {
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    },
  });

  return { create, service, tx };
}

describe('SongsService.listPlaylistTracks', () => {
  it('returns an ordered page and uses the final position as the next cursor', async () => {
    const { service, findMany } = createService({
      tracks: [
        { position: 4, song: { id: 'a' } },
        { position: 5, song: { id: 'b' } },
        { position: 6, song: { id: 'c' } },
      ],
    });

    await expect(
      service.listPlaylistTracks({
        playlistId: 'playlist',
        requesterUserId: 'owner',
        cursor: '3',
        limit: 2,
      }),
    ).resolves.toEqual({
      songs: [{ id: 'a' }, { id: 'b' }],
      nextCursor: '5',
      hasMore: true,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playlistId: 'playlist', position: { gt: 3 } },
        orderBy: { position: 'asc' },
        take: 3,
      }),
    );
  });

  it('returns the final page without a next cursor', async () => {
    const { service } = createService({
      tracks: [{ position: 8, song: { id: 'a' } }],
    });

    await expect(
      service.listPlaylistTracks({
        playlistId: 'playlist',
        requesterUserId: 'owner',
        cursor: '',
        limit: 40,
      }),
    ).resolves.toEqual({
      songs: [{ id: 'a' }],
      nextCursor: '',
      hasMore: false,
    });
  });

  it('allows a public playlist for another authenticated user', async () => {
    const { service, findMany } = createService({
      playlist: { userId: 'owner', isPublic: true },
    });

    await expect(
      service.listPlaylistTracks({
        playlistId: 'playlist',
        requesterUserId: 'listener',
        cursor: '',
        limit: 1,
      }),
    ).resolves.toMatchObject({ hasMore: false });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          playlistId: 'playlist',
          song: {
            status: 3,
            OR: [{ isCatalog: true }, { owners: { some: { isPublic: true } } }],
          },
        },
      }),
    );
  });

  it.each(playlistAccessCases)(
    'rejects %s',
    async (
      _label: string,
      playlist: PlaylistAccessCase[1],
      requesterUserId: string,
      code: number,
    ) => {
      const { service, findMany } = createService({ playlist });

      await expectRpcCode(
        service.listPlaylistTracks({
          playlistId: 'playlist',
          requesterUserId,
          cursor: '',
          limit: 1,
        }),
        code,
      );
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it.each(['not-a-number', '-1', '1.5'])(
    'rejects invalid cursor %s',
    async (cursor) => {
      const { service, findMany } = createService();

      await expectRpcCode(
        service.listPlaylistTracks({
          playlistId: 'playlist',
          requesterUserId: 'owner',
          cursor,
          limit: 1,
        }),
        status.INVALID_ARGUMENT,
      );
      expect(findMany).not.toHaveBeenCalled();
    },
  );
});

describe('SongsService.addTrackToPlaylist', () => {
  it('does not expose a private song through a public playlist', async () => {
    const { create, service } = createAddTrackService({
      playlist: { userId: 'owner', isPublic: true },
    });

    await expectRpcCode(
      service.addTrackToPlaylist('owner', 'playlist', 'song', 'album'),
      status.PERMISSION_DENIED,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a song the playlist owner cannot read', async () => {
    const { create, service } = createAddTrackService({
      song: {
        id: 'song',
        status: 3,
        isCatalog: false,
        owners: [{ userId: 'other-user', isPublic: false }],
      },
    });

    await expectRpcCode(
      service.addTrackToPlaylist('owner', 'playlist', 'song', 'album'),
      status.PERMISSION_DENIED,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('locks the playlist before allocating the next track position', async () => {
    const { create, service, tx } = createAddTrackService({ maxPosition: 4 });

    await expect(
      service.addTrackToPlaylist('owner', 'playlist', 'song', 'album'),
    ).resolves.toMatchObject({ success: true });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        playlistId: 'playlist',
        songId: 'song',
        sourceAlbumId: 'album',
        position: 5,
      },
    });
  });
});

describe('SongsService.removeLibraryResource', () => {
  it('reports a removed playlist favourite in the same transaction', async () => {
    const tx = {
      userPlaylist: { findFirst: jest.fn().mockResolvedValue(null) },
      userLibraryResource: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      playlistFavorite: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      preferenceOutbox: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = Object.create(SongsService.prototype) as SongsService;
    Object.assign(service as object, {
      prisma: {
        $transaction: jest.fn(
          (callback: (transaction: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      },
    });

    await expect(
      service.removeLibraryResource({
        userId: 'user',
        resourceType: 'playlists',
        resourceId: 'playlist',
        title: '',
        subtitle: '',
        artworkUrl: '',
        sourceAlbumId: '',
      }),
    ).resolves.toMatchObject({
      removed: true,
      favoriteRemoved: true,
    });
    expect(tx.playlistFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user', playlistId: 'playlist' },
    });
  });
});

describe('SongsService.applyWorkerCompletion', () => {
  it('does not let a stale transcode generation overwrite the current song', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = Object.create(SongsService.prototype) as SongsService;
    Object.assign(service as object, {
      prisma: { song: { updateMany } },
    });

    await expect(
      service.applyWorkerCompletion({
        song_id: 'song-1',
        metadata_version: 4,
        status: 'success',
        encrypted_file_path: 'processed/song-1.m4a',
      }),
    ).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'song-1', transcodeVersion: 4n },
      }),
    );
  });
});
