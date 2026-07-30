import { RpcException } from '@nestjs/microservices';
import type { PrismaService } from '../database/prisma.service';
import { LyricsService } from './lyrics.service';

jest.mock('../generated/prisma/client', () => ({
  SongLyricStatus: { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' },
  SongLyricSyncMode: { LINE: 'LINE', WORD: 'WORD' },
}));

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('LyricsService timing validation', () => {
  const service = new LyricsService({} as PrismaService);

  it('parses and orders valid LRC timestamps', () => {
    const lines = service['parse'](
      '[00:02.50] second\n[00:01.25] first',
      5_000,
    );

    expect(lines).toEqual([
      {
        position: 0,
        startTimeMs: 1_250,
        endTimeMs: 2_500,
        text: 'first',
        words: [],
      },
      {
        position: 1,
        startTimeMs: 2_500,
        endTimeMs: 5_000,
        text: 'second',
        words: [],
      },
    ]);
  });

  it('rejects invalid LRC seconds', () => {
    expect(() => service['parse']('[00:60.00] invalid', 70_000)).toThrow(
      RpcException,
    );
  });

  it('rejects overlapping line timings', () => {
    expect(() =>
      service['validateLines'](
        [
          {
            position: 0,
            startTimeMs: 0,
            endTimeMs: 2_000,
            text: 'first',
            words: [],
          },
          {
            position: 1,
            startTimeMs: 1_999,
            endTimeMs: 3_000,
            text: 'second',
            words: [],
          },
        ],
        5_000,
        'LINE' as never,
      ),
    ).toThrow(RpcException);
  });

  it('requires complete word timings in word mode', () => {
    expect(() =>
      service['validateLines'](
        [
          {
            position: 0,
            startTimeMs: 0,
            endTimeMs: 2_000,
            text: 'first line',
            words: [],
          },
        ],
        5_000,
        'WORD' as never,
      ),
    ).toThrow(RpcException);
  });
});
