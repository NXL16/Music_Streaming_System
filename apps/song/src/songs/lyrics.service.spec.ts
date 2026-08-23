jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../generated/prisma/client', () => ({
  SongLyricLineKind: { LYRIC: 'LYRIC' },
  SongLyricStatus: { PUBLISHED: 'PUBLISHED' },
  SongLyricSyncMode: { LINE: 'LINE', WORD: 'WORD' },
}));
jest.mock('@musical/shared-proto', () => ({}));

import { SongLyricLineKind } from '../generated/prisma/client';
import { LyricsService } from './lyrics.service';

describe('LyricsService published line persistence', () => {
  it('writes lines in bulk and retains each word-to-line relationship', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    type LineRow = { id: string; lyricId: string; position: number };
    type WordRow = { lineId: string; text: string };
    let lineRows: LineRow[] = [];
    let wordRows: WordRow[] = [];
    const createManyLines = jest.fn((input: { data: LineRow[] }) => {
      lineRows = input.data;
      return Promise.resolve({ count: 2 });
    });
    const createManyWords = jest.fn((input: { data: WordRow[] }) => {
      wordRows = input.data;
      return Promise.resolve({ count: 3 });
    });
    const service = new LyricsService({} as never);

    await service['replacePublishedLines'](
      {
        songLyricLine: { deleteMany, createMany: createManyLines },
        songLyricWord: { createMany: createManyWords },
      } as never,
      'lyric-1',
      [
        {
          position: 0,
          startTimeMs: 0,
          endTimeMs: 1_000,
          text: 'first line',
          kind: SongLyricLineKind.LYRIC,
          words: [
            { position: 0, startTimeMs: 0, endTimeMs: 500, text: 'first' },
            { position: 1, startTimeMs: 500, endTimeMs: 1_000, text: 'line' },
          ],
        },
        {
          position: 1,
          startTimeMs: 1_000,
          endTimeMs: 2_000,
          text: 'second line',
          kind: SongLyricLineKind.LYRIC,
          words: [
            { position: 0, startTimeMs: 1_000, endTimeMs: 2_000, text: 'second' },
          ],
        },
      ],
    );

    expect(deleteMany).toHaveBeenCalledWith({ where: { lyricId: 'lyric-1' } });
    expect(lineRows).toHaveLength(2);
    expect(lineRows.map((line) => line.lyricId)).toEqual(['lyric-1', 'lyric-1']);
    expect(new Set(lineRows.map((line) => line.id)).size).toBe(2);

    expect(wordRows).toHaveLength(3);
    expect(wordRows.filter((word) => word.lineId === lineRows[0].id)).toHaveLength(2);
    expect(wordRows.filter((word) => word.lineId === lineRows[1].id)).toHaveLength(1);
  });
});
