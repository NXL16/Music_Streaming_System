import { PlaylistsController } from './playlists.controller';

describe('PlaylistsController playlist track pagination', () => {
  const songsService = {
    listPlaylistTracks: jest.fn(),
    getPlaylist: jest.fn(),
  };
  const controller = new PlaylistsController(
    songsService as never,
    {} as never,
    {} as never,
  );
  const request = { user: { userId: 'user-1' } } as never;

  beforeEach(() => jest.clearAllMocks());

  it('forwards cursor and explicit limit to the track page contract', async () => {
    songsService.listPlaylistTracks.mockResolvedValue({
      songs: [],
      nextCursor: '',
      hasMore: false,
    });

    await controller.listTracks(request, 'playlist-1', '12', '20');

    expect(songsService.listPlaylistTracks).toHaveBeenCalledWith({
      playlistId: 'playlist-1',
      requesterUserId: 'user-1',
      cursor: '12',
      limit: 20,
    });
  });

  it('uses the safe first-page defaults when pagination query values are absent', async () => {
    songsService.listPlaylistTracks.mockResolvedValue({
      songs: [],
      nextCursor: '',
      hasMore: false,
    });

    await controller.listTracks(request, 'playlist-1', undefined, undefined);

    expect(songsService.listPlaylistTracks).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: '', limit: 40 }),
    );
  });

  it.each([
    ['false', false],
    [undefined, true],
  ])(
    'keeps legacy full-track behaviour unless includeTracks is false',
    async (includeTracks, includeSongs) => {
      songsService.getPlaylist.mockResolvedValue({
        playlist: { id: 'playlist-1' },
      });

      await controller.getOne(request, 'playlist-1', includeTracks);

      expect(songsService.getPlaylist).toHaveBeenCalledWith({
        playlistId: 'playlist-1',
        requesterUserId: 'user-1',
        includeSongs,
      });
    },
  );
});
