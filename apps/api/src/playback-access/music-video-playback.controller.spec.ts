import { MusicVideoPlaybackController } from './music-video-playback.controller';

describe('MusicVideoPlaybackController', () => {
  it('writes the HLS key as raw 16-byte binary, never Buffer JSON', async () => {
    const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const assertMusicVideoAvailable = jest.fn().mockResolvedValue(undefined);
    const getMusicVideoKey = jest.fn().mockResolvedValue({ key });
    const sentKeys: Buffer[] = [];
    const response = {
      status: jest.fn(),
      set: jest.fn(),
      send: jest.fn((value: Buffer) => sentKeys.push(value)),
    };
    response.status.mockReturnValue(response);
    response.set.mockReturnValue(response);

    const controller = new MusicVideoPlaybackController(
      { getMusicVideoKey } as never,
      { assertMusicVideoAvailable } as never,
      {} as never,
    );
    const assetId = 'e7cc4938-1a10-4a83-a366-7ef43c874d1b';

    await controller.getKey(assetId, response as never);

    expect(assertMusicVideoAvailable).toHaveBeenCalledWith(assetId);
    expect(getMusicVideoKey).toHaveBeenCalledWith({ assetId });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.set).toHaveBeenCalledWith({
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    });
    expect(response.send).toHaveBeenCalledWith(key);
    expect(sentKeys[0]).toBeInstanceOf(Buffer);
    expect(sentKeys[0]).toHaveLength(16);
  });
});
