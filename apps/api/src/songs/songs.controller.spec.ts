import { SongsController } from './songs.controller';

describe('SongsController lyrics visibility', () => {
  it('checks public song visibility before returning published lyrics', async () => {
    const getSong = jest.fn().mockResolvedValue({ song: { id: 'song-1' } });
    const getSongLyrics = jest.fn().mockResolvedValue({ songId: 'song-1' });
    const controller = new SongsController(
      { getSong, getSongLyrics } as never,
      {} as never,
      {} as never,
    );

    await expect(controller.getLyrics('song-1')).resolves.toEqual({
      songId: 'song-1',
    });

    expect(getSong).toHaveBeenCalledWith({
      songId: 'song-1',
      requesterUserId: '',
    });
    expect(getSongLyrics).toHaveBeenCalledWith({
      songId: 'song-1',
      includeDraft: false,
    });
  });

  it('does not query lyrics when public visibility is denied', async () => {
    const getSong = jest
      .fn()
      .mockRejectedValue(new Error('SONG_ACCESS_DENIED'));
    const getSongLyrics = jest.fn();
    const controller = new SongsController(
      { getSong, getSongLyrics } as never,
      {} as never,
      {} as never,
    );

    await expect(controller.getLyrics('private-song')).rejects.toThrow(
      'SONG_ACCESS_DENIED',
    );
    expect(getSongLyrics).not.toHaveBeenCalled();
  });
});
