import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import {
  GetSongLyricsRequest,
  SongLyricsResponse,
  UpsertSongLyricsRequest,
} from '@musical/shared-proto';
import { SongLyricStatus } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

const MAX_TTML_SOURCE_LENGTH = 2_000_000;

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
          sourceTtml: draft.sourceTtml,
          published: false,
        });
      }
    }

    const lyric = await this.prisma.songLyric.findUnique({
      where: { songId: request.songId },
    });
    if (!lyric || lyric.status !== SongLyricStatus.PUBLISHED) {
      throw this.notFound('LYRICS_NOT_FOUND');
    }
    return this.response({
      songId: lyric.songId,
      language: lyric.language,
      sourceTtml: lyric.sourceTtml,
      published: true,
    });
  }

  async upsert(request: UpsertSongLyricsRequest): Promise<SongLyricsResponse> {
    const song = await this.prisma.song.findUnique({
      where: { id: request.songId },
      select: { id: true },
    });
    if (!song) throw this.notFound('SONG_NOT_FOUND');
    await this.requirePermission(request, song.id);

    const language = this.language(request.language);
    const sourceTtml = this.ttmlSource(request.sourceTtml);

    if (!request.publish) {
      await this.prisma.songLyricDraft.upsert({
        where: { songId: song.id },
        create: { songId: song.id, language, sourceTtml },
        update: { language, sourceTtml },
      });
      return this.get({ songId: song.id, includeDraft: true });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.songLyric.upsert({
        where: { songId: song.id },
        create: {
          songId: song.id,
          language,
          sourceTtml,
          status: SongLyricStatus.PUBLISHED,
        },
        update: { language, sourceTtml, status: SongLyricStatus.PUBLISHED },
      });
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
    sourceTtml: string;
    published: boolean;
  }): SongLyricsResponse {
    return data;
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

  private ttmlSource(value: string): string {
    const source = value ?? '';
    if (
      source.length > MAX_TTML_SOURCE_LENGTH ||
      !/^\s*<tt(?:\s|>)/.test(source) ||
      !/<\/tt>\s*$/.test(source)
    ) {
      throw this.invalid('LYRIC_TTML_INVALID');
    }
    return source;
  }

  private invalid(message: string): RpcException {
    return new RpcException({ code: status.INVALID_ARGUMENT, message });
  }

  private notFound(message: string): RpcException {
    return new RpcException({ code: status.NOT_FOUND, message });
  }
}
