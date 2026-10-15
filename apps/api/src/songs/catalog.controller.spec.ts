import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@musical/shared-types';
import { ArtistStudioCatalogController } from './catalog.controller';

describe('ArtistStudioCatalogController lyric drafts', () => {
  const songsService = {
    getSong: jest.fn(),
    getSongLyrics: jest.fn(),
    upsertSongLyrics: jest.fn(),
    getCatalogResources: jest.fn(),
    checkArtistPermission: jest.fn(),
  };
  const controller = new ArtistStudioCatalogController(
    songsService as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('does not expose a public song draft to a different artist', async () => {
    songsService.getSong.mockResolvedValue({
      song: { id: 'song-1', uploaderId: 'owner-1' },
    });
    songsService.getCatalogResources.mockResolvedValue({
      resources: {
        songs: {
          'song-1': {
            relationships: { artists: { data: [{ id: 'artist-1' }] } },
          },
        },
      },
    });
    songsService.checkArtistPermission.mockResolvedValue({ allowed: false });

    await expect(
      controller.getSongLyrics(
        { user: { userId: 'artist-2', role: UserRole.ARTIST } } as never,
        'song-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(songsService.getSongLyrics).not.toHaveBeenCalled();
  });

  it('allows the owner to read their own lyric draft', async () => {
    songsService.getSong.mockResolvedValue({
      song: { id: 'song-1', uploaderId: 'artist-1' },
    });
    songsService.getSongLyrics.mockResolvedValue({ songId: 'song-1' });

    await expect(
      controller.getSongLyrics(
        { user: { userId: 'artist-1', role: UserRole.ARTIST } } as never,
        'song-1',
      ),
    ).resolves.toEqual({ songId: 'song-1' });

    expect(songsService.getSong).toHaveBeenCalledWith({
      songId: 'song-1',
      requesterUserId: 'artist-1',
    });
    expect(songsService.getSongLyrics).toHaveBeenCalledWith({
      songId: 'song-1',
      includeDraft: true,
    });
  });

  it('allows a super admin to save lyrics without a song owner record', async () => {
    songsService.getSong.mockResolvedValue({
      song: { id: 'song-1', uploaderId: 'artist-1' },
    });
    songsService.upsertSongLyrics.mockResolvedValue({ songId: 'song-1' });

    await expect(
      controller.saveSongLyrics(
        { user: { userId: 'admin-1', role: UserRole.SUPER_ADMIN } } as never,
        'song-1',
        { language: 'vi', sourceTtml: '<tt></tt>', publish: false },
      ),
    ).resolves.toEqual({ songId: 'song-1' });

    expect(songsService.upsertSongLyrics).toHaveBeenCalledWith({
      songId: 'song-1',
      language: 'vi',
      sourceTtml: '<tt></tt>',
      publish: false,
      actorUserId: 'admin-1',
      canManageAllSongs: true,
    });
  });
});
