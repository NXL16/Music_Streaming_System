import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import {
  GetSongLyricsRequest,
  SongLyricsResponse,
  UpsertSongLyricsRequest,
} from '@musical/shared-proto';
import {
  Prisma,
  SongLyricStatus,
  SongLyricSyncMode,
} from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

const TIMESTAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const MAX_LINES = 2_000;
const MAX_WORDS_PER_LINE = 100;
const MAX_SOURCE_LENGTH = 200_000;
const MAX_LINE_TEXT_LENGTH = 4_000;
const MAX_WORD_TEXT_LENGTH = 500;

type PreparedWord = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
};

type PreparedLine = {
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  words: PreparedWord[];
};

@Injectable()
export class LyricsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(request: GetSongLyricsRequest): Promise<SongLyricsResponse> {
    if (request.includeDraft) {
      const draft = await this.prisma.songLyricDraft.findUnique({
        where: { songId: request.songId },
      });
      if (draft) {
        return this.response({
          songId: draft.songId,
          language: draft.language,
          plainText: draft.plainText,
          syncMode: draft.syncMode,
          lines: draft.lines as unknown as PreparedLine[],
          published: false,
        });
      }
    }

    const lyric = await this.prisma.songLyric.findUnique({
      where: { songId: request.songId },
      include: {
        lines: {
          orderBy: { position: 'asc' },
          include: { words: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!lyric || lyric.status !== SongLyricStatus.PUBLISHED) {
      throw this.notFound('LYRICS_NOT_FOUND');
    }
    return this.response({
      songId: lyric.songId,
      language: lyric.language,
      plainText: lyric.plainText,
      syncMode: lyric.syncMode,
      published: true,
      lines: lyric.lines.map((line) => ({
        position: line.position,
        startTimeMs: line.startTimeMs,
        endTimeMs: line.endTimeMs,
        text: line.text,
        words: line.words.map((word) => ({
          position: word.position,
          startTimeMs: word.startTimeMs,
          endTimeMs: word.endTimeMs,
          text: word.text,
        })),
      })),
    });
  }

  async upsert(request: UpsertSongLyricsRequest): Promise<SongLyricsResponse> {
    const song = await this.prisma.song.findUnique({
      where: { id: request.songId },
      select: { id: true, durationInMillis: true },
    });
    if (!song) throw this.notFound('SONG_NOT_FOUND');
    await this.requirePermission(request, song.id);

    const language = this.language(request.language);
    const sourceLrc = this.source(request.sourceLrc);
    const syncMode =
      request.syncMode === SongLyricSyncMode.WORD
        ? SongLyricSyncMode.WORD
        : SongLyricSyncMode.LINE;
    const lines = request.lines.length
      ? this.validateLines(request.lines, song.durationInMillis, syncMode)
      : this.parse(sourceLrc, song.durationInMillis);
    const plainText = lines.map((line) => line.text).join('\n');

    if (!request.publish) {
      await this.prisma.songLyricDraft.upsert({
        where: { songId: song.id },
        create: {
          songId: song.id,
          language,
          sourceLrc,
          plainText,
          syncMode,
          lines: lines as unknown as Prisma.InputJsonValue,
        },
        update: {
          language,
          sourceLrc,
          plainText,
          syncMode,
          lines: lines as unknown as Prisma.InputJsonValue,
        },
      });
      return this.get({ songId: song.id, includeDraft: true });
    }

    await this.prisma.$transaction(async (tx) => {
      const lyric = await tx.songLyric.upsert({
        where: { songId: song.id },
        create: {
          songId: song.id,
          language,
          sourceLrc,
          plainText,
          syncMode,
          status: SongLyricStatus.PUBLISHED,
        },
        update: {
          language,
          sourceLrc,
          plainText,
          syncMode,
          status: SongLyricStatus.PUBLISHED,
        },
      });
      await tx.songLyricLine.deleteMany({ where: { lyricId: lyric.id } });
      for (const line of lines) {
        const createdLine = await tx.songLyricLine.create({
          data: {
            lyricId: lyric.id,
            position: line.position,
            startTimeMs: line.startTimeMs,
            endTimeMs: line.endTimeMs,
            text: line.text,
          },
        });
        if (line.words.length) {
          await tx.songLyricWord.createMany({
            data: line.words.map((word) => ({
              lineId: createdLine.id,
              ...word,
            })),
          });
        }
      }
      await tx.song.update({
        where: { id: song.id },
        data: { hasLyrics: true, hasTimeSyncedLyrics: true },
      });
      await tx.songLyricDraft.deleteMany({ where: { songId: song.id } });
    });
    return this.get({ songId: song.id, includeDraft: false });
  }

  private async requirePermission(
    request: UpsertSongLyricsRequest,
    songId: string,
  ): Promise<void> {
    if (request.canManageAllSongs) return;
    const actorUserId = request.actorUserId.trim();
    if (!actorUserId || actorUserId.length > 128) {
      throw this.invalid('LYRIC_ACTOR_INVALID');
    }
    const owner = await this.prisma.songOwner.findUnique({
      where: { songId_userId: { songId, userId: actorUserId } },
      select: { songId: true },
    });
    if (!owner) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'SONG_FORBIDDEN',
      });
    }
  }

  private response(data: {
    songId: string;
    language: string;
    plainText: string;
    syncMode: SongLyricSyncMode;
    lines: PreparedLine[];
    published: boolean;
  }): SongLyricsResponse {
    return {
      songId: data.songId,
      language: data.language,
      plainText: data.plainText,
      isTimeSynced: data.lines.length > 0,
      published: data.published,
      syncMode: data.syncMode,
      lines: data.lines,
    };
  }

  private parse(source: string, durationMs: number): PreparedLine[] {
    const entries: PreparedLine[] = [];
    for (const rawLine of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const timestamps = [...rawLine.matchAll(TIMESTAMP)];
      const text = rawLine.replace(TIMESTAMP, '').trim();
      if (!timestamps.length || !text) continue;
      for (const match of timestamps) {
        if (Number(match[2]) >= 60)
          throw this.invalid('LRC_TIMESTAMPS_INVALID');
        const fraction = (match[3] || '').padEnd(3, '0').slice(0, 3);
        entries.push({
          position: 0,
          startTimeMs:
            (Number(match[1]) * 60 + Number(match[2])) * 1000 +
            Number(fraction || 0),
          endTimeMs: 0,
          text,
          words: [],
        });
      }
    }
    entries.sort((left, right) => left.startTimeMs - right.startTimeMs);
    if (
      !entries.length ||
      entries.length > MAX_LINES ||
      entries.some(
        (line, index) =>
          index > 0 && line.startTimeMs === entries[index - 1].startTimeMs,
      )
    ) {
      throw this.invalid('LRC_TIMESTAMPS_INVALID');
    }
    if (
      durationMs > 0 &&
      entries.some((line) => line.startTimeMs >= durationMs)
    ) {
      throw this.invalid('LRC_TIMESTAMP_EXCEEDS_DURATION');
    }
    return entries.map((line, index) => ({
      ...line,
      position: index,
      endTimeMs:
        (entries[index + 1]?.startTimeMs ?? durationMs) ||
        line.startTimeMs + 10_000,
    }));
  }

  private validateLines(
    lines: UpsertSongLyricsRequest['lines'],
    durationMs: number,
    syncMode: SongLyricSyncMode,
  ): PreparedLine[] {
    if (!lines.length || lines.length > MAX_LINES)
      throw this.invalid('LYRIC_LINES_INVALID');
    const normalized = lines.map((line, position) => ({
      position,
      startTimeMs: line.startTimeMs,
      endTimeMs: line.endTimeMs,
      text: line.text.trim(),
      words: line.words.map((word, wordPosition) => ({
        position: wordPosition,
        startTimeMs: word.startTimeMs,
        endTimeMs: word.endTimeMs,
        text: word.text.trim(),
      })),
    }));
    const invalidLine = normalized.some(
      (line, index) =>
        !Number.isSafeInteger(line.startTimeMs) ||
        !Number.isSafeInteger(line.endTimeMs) ||
        !line.text ||
        line.text.length > MAX_LINE_TEXT_LENGTH ||
        line.startTimeMs < 0 ||
        line.endTimeMs <= line.startTimeMs ||
        (index > 0 && line.startTimeMs < normalized[index - 1].endTimeMs) ||
        (durationMs > 0 && line.endTimeMs > durationMs),
    );
    const invalidWords = normalized.some(
      (line) =>
        line.words.length > MAX_WORDS_PER_LINE ||
        line.words.some(
          (word, index) =>
            !Number.isSafeInteger(word.startTimeMs) ||
            !Number.isSafeInteger(word.endTimeMs) ||
            !word.text ||
            word.text.length > MAX_WORD_TEXT_LENGTH ||
            word.startTimeMs < line.startTimeMs ||
            word.endTimeMs <= word.startTimeMs ||
            word.endTimeMs > line.endTimeMs ||
            (index > 0 && word.startTimeMs < line.words[index - 1].endTimeMs),
        ),
    );
    if (
      invalidLine ||
      invalidWords ||
      (syncMode === SongLyricSyncMode.WORD &&
        normalized.some((line) => !line.words.length))
    ) {
      throw this.invalid('LYRIC_TIMINGS_INVALID');
    }
    return normalized;
  }

  private language(value: string): string {
    const language = value.trim().toLowerCase() || 'vi';
    if (
      !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(language) ||
      language.length > 16
    ) {
      throw this.invalid('LYRIC_LANGUAGE_INVALID');
    }
    return language;
  }

  private source(value: string): string {
    const source = value.trim();
    if (source.length > MAX_SOURCE_LENGTH)
      throw this.invalid('LYRIC_SOURCE_TOO_LARGE');
    return source;
  }

  private invalid(message: string): RpcException {
    return new RpcException({ code: status.INVALID_ARGUMENT, message });
  }

  private notFound(message: string): RpcException {
    return new RpcException({ code: status.NOT_FOUND, message });
  }
}
