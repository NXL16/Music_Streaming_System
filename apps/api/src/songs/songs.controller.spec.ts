import { SongsController } from './songs.controller';

describe('SongsController lyrics visibility', () => {
  it('checks public song visibility before returning published lyrics', async () => {
    const getSong = jest.fn().mockResolvedValue({ song: { id: 'song-1' } });
    const getSongLyrics = jest
      .fn()
      .mockResolvedValue({ language: 'vi', sourceTtml: '<tt></tt>' });
    const controller = new SongsController(
      { getSong, getSongLyrics } as never,
      {} as never,
      {} as never,
    );

    await expect(controller.getLyrics('song-1')).resolves.toEqual({
      data: [
        {
          id: 'song-1',
          type: 'syllable-lyrics',
          attributes: {
            language: 'vi',
            ttmlLocalizations: '<tt></tt>',
          },
        },
      ],
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
