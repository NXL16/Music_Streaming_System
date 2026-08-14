import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../generated/prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: class {} },
  PrismaClient: class {},
}));

import { SongsService } from './songs.service';

type Track = { position: number; song: { id: string } };

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
    expect(findMany).toHaveBeenCalled();
  });

  it.each([
    ['missing playlist', null, 'owner', status.NOT_FOUND],
    [
      'private playlist owned by another user',
      { userId: 'owner', isPublic: false },
      'listener',
      status.PERMISSION_DENIED,
    ],
  ])('rejects %s', async (_label, playlist, requesterUserId, code) => {
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
  });

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
