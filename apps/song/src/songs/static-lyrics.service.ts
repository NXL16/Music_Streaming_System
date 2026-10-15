import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import {
  GetSongStaticLyricsRequest,
  SongStaticLyricsResponse,
  UpsertSongStaticLyricsRequest,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';

const MAX_STATIC_LYRIC_LINES = 2_000;
const MAX_STATIC_LYRIC_LINE_LENGTH = 16_000;
type ValidatedStaticLyricLine = {
  text: string;
  vocalistType: 'PRIMARY' | 'SECONDARY';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class StaticLyricsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    request: GetSongStaticLyricsRequest,
  ): Promise<SongStaticLyricsResponse> {
    const songId = request.songId.trim();
    if (!songId) throw this.invalid('STATIC_LYRIC_SONG_INVALID');

    const lines = await this.prisma.songStaticLyricLine.findMany({
      where: { songId },
      orderBy: { position: 'asc' },
      select: { text: true, vocalistType: true },
    });
    if (!lines.length) throw this.notFound('STATIC_LYRICS_NOT_FOUND');

    return {
      songId,
      lines: lines.map((line) => ({
        text: line.text,
        vocalistType: line.vocalistType,
      })),
    };
  }

  async upsert(
    request: UpsertSongStaticLyricsRequest,
  ): Promise<SongStaticLyricsResponse> {
    const songId = request.songId.trim();
    if (!songId) throw this.invalid('STATIC_LYRIC_SONG_INVALID');
    const lines = this.lines(request.lines);

    const song = await this.prisma.song.findUnique({
      where: { id: songId },
      select: { id: true },
    });
    if (!song) throw this.notFound('SONG_NOT_FOUND');
    await this.requirePermission(request, song.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.songStaticLyricLine.deleteMany({ where: { songId: song.id } });
      await tx.songStaticLyricLine.createMany({
        data: lines.map((line, position) => ({
          songId: song.id,
          position,
          text: line.text,
          vocalistType: line.vocalistType,
        })),
      });
    });

    return { songId: song.id, lines };
  }

  private lines(value: unknown): ValidatedStaticLyricLine[] {
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.length > MAX_STATIC_LYRIC_LINES
    ) {
      throw this.invalid('STATIC_LYRIC_LINES_INVALID');
    }

    return value.map((line) => {
      if (!isRecord(line)) throw this.invalid('STATIC_LYRIC_LINE_INVALID');

      const text = typeof line.text === 'string' ? line.text.trim() : '';
      if (!text || text.length > MAX_STATIC_LYRIC_LINE_LENGTH) {
        throw this.invalid('STATIC_LYRIC_LINE_INVALID');
      }
      const rawVocalistType =
        typeof line.vocalistType === 'string'
          ? line.vocalistType.trim().toUpperCase()
          : 'PRIMARY';
      if (rawVocalistType !== 'PRIMARY' && rawVocalistType !== 'SECONDARY') {
        throw this.invalid('STATIC_LYRIC_VOCALIST_TYPE_INVALID');
      }
      return {
        text,
        vocalistType: rawVocalistType,
      };
    });
  }

  private async requirePermission(
    request: UpsertSongStaticLyricsRequest,
    songId: string,
  ): Promise<void> {
    if (request.canManageAllSongs) return;
    const actorUserId = request.actorUserId.trim();
    if (!actorUserId || actorUserId.length > 128) {
      throw this.invalid('STATIC_LYRIC_ACTOR_INVALID');
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

  private invalid(message: string): RpcException {
    return new RpcException({ code: status.INVALID_ARGUMENT, message });
  }

  private notFound(message: string): RpcException {
    return new RpcException({ code: status.NOT_FOUND, message });
  }
}
