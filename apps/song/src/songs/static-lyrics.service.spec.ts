jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@grpc/grpc-js', () => ({ status: { INVALID_ARGUMENT: 3, NOT_FOUND: 5 } }));
jest.mock('@musical/shared-proto', () => ({}));

import { StaticLyricsService } from './static-lyrics.service';

describe('StaticLyricsService', () => {
  it('preserves lyric lines in their original order', () => {
    const service = new StaticLyricsService({} as never);

    expect(
      service['lines']([
        { text: ' Verse one\nsecond visual line ', vocalistType: 'PRIMARY' },
        { text: 'Answer', vocalistType: 'SECONDARY' },
      ]),
    ).toEqual([
      { text: 'Verse one\nsecond visual line', vocalistType: 'PRIMARY' },
      { text: 'Answer', vocalistType: 'SECONDARY' },
    ]);
  });

  it('rejects an empty static lyric payload', () => {
    const service = new StaticLyricsService({} as never);

    expect(() => service['lines']([])).toThrow('STATIC_LYRIC_LINES_INVALID');
  });
});
