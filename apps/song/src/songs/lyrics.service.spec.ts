jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../generated/prisma/client', () => ({
  SongLyricStatus: { PUBLISHED: 'PUBLISHED' },
}));
jest.mock('@musical/shared-proto', () => ({}));

import { LyricsService } from './lyrics.service';

describe('LyricsService TTML validation', () => {
  it('accepts a complete TTML document without rewriting it', () => {
    const service = new LyricsService({} as never);
    const source = ' \n<tt xmlns="http://www.w3.org/ns/ttml"><body /></tt>\n';

    expect(service['ttmlSource'](source)).toBe(source);
  });

  it('rejects a non-TTML payload', () => {
    const service = new LyricsService({} as never);

    expect(() => service['ttmlSource']('{"lines":[]}')).toThrow(
      'LYRIC_TTML_INVALID',
    );
  });
});
