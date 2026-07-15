import { Injectable, Logger } from '@nestjs/common';
import {
  ListeningEventType,
  RecordListeningEventRequest,
  RecordListeningEventResponse,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';

export type TasteProfile = {
  genres: Array<{ name: string; weight: number }>;
  artists: Array<{ name: string; weight: number }>;
  avgCompletionRate: number;
  totalListenTimeSec: number;
  listenedSongIds: Set<string>;
  listenedAlbumIds: Set<string>;
  listenedAlbumNames: Set<string>;
};

const EVENT_TYPE_MAP: Record<number, string> = {
  [ListeningEventType.LISTENING_EVENT_TYPE_PLAY_START]: 'PLAY_START',
  [ListeningEventType.LISTENING_EVENT_TYPE_PLAY_COMPLETE]: 'PLAY_COMPLETE',
  [ListeningEventType.LISTENING_EVENT_TYPE_SKIP]: 'SKIP',
};

@Injectable()
export class ListeningService {
  private readonly logger = new Logger(ListeningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(
    request: RecordListeningEventRequest,
  ): Promise<RecordListeningEventResponse> {
    const userId = request.userId;
    const songId = request.songId;
    if (!userId || !songId) {
      return { success: false };
    }

    const eventType =
      EVENT_TYPE_MAP[request.eventType] ?? 'PLAY_START';
    const albumId = request.albumId?.trim() ?? '';
    const playlistId = request.playlistId?.trim() ?? '';
    const playlistName = request.playlistName?.trim() ?? '';
    const playlistArtworkUrl = request.playlistArtworkUrl?.trim() ?? '';
    const playlistArtworkBgColor =
      request.playlistArtworkBgColor?.trim() ?? '';
    const stationId = request.stationId?.trim() ?? '';
    const stationName = request.stationName?.trim() ?? '';
    const stationArtworkUrl = request.stationArtworkUrl?.trim() ?? '';
    const stationArtworkBgColor =
      request.stationArtworkBgColor?.trim() ?? '';

    try {
      await this.prisma.listeningEvent.create({
        data: {
          userId,
          songId,
          eventType,
          durationSec: request.durationSec || 0,
          totalSec: request.totalSec || 0,
          songTitle: request.songTitle || '',
          artistName: request.artistName || '',
          albumName: request.albumName || '',
          albumId,
          playlistId,
          playlistName,
          playlistArtworkUrl,
          playlistArtworkBgColor,
          stationId,
          stationName,
          stationArtworkUrl,
          stationArtworkBgColor,
        },
      });

      const isPlayStart =
        request.eventType === ListeningEventType.LISTENING_EVENT_TYPE_PLAY_START;
      const isComplete =
        request.eventType === ListeningEventType.LISTENING_EVENT_TYPE_PLAY_COMPLETE;
      const isSkip =
        request.eventType === ListeningEventType.LISTENING_EVENT_TYPE_SKIP;

      await this.prisma.userListeningStats.upsert({
        where: { userId_songId: { userId, songId } },
        create: {
          userId,
          songId,
          playCount: isPlayStart ? 1 : 0,
          completionCount: isComplete ? 1 : 0,
          skipCount: isSkip ? 1 : 0,
          totalListenSec: request.durationSec || 0,
          lastPlayedAt: new Date(),
          songTitle: request.songTitle || '',
          artistName: request.artistName || '',
          albumName: request.albumName || '',
          albumId,
          playlistId,
          playlistName,
          playlistArtworkUrl,
          playlistArtworkBgColor,
          stationId,
          stationName,
          stationArtworkUrl,
          stationArtworkBgColor,
        },
        update: {
          ...(isPlayStart && { playCount: { increment: 1 } }),
          ...(isComplete && { completionCount: { increment: 1 } }),
          ...(isSkip && { skipCount: { increment: 1 } }),
          totalListenSec: { increment: request.durationSec || 0 },
          lastPlayedAt: new Date(),
          songTitle: request.songTitle || '',
          artistName: request.artistName || '',
          albumName: request.albumName || '',
          ...(albumId && { albumId }),
          playlistId,
          playlistName,
          playlistArtworkUrl,
          playlistArtworkBgColor,
          stationId,
          stationName,
          stationArtworkUrl,
          stationArtworkBgColor,
        },
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to record listening event', error);
      return { success: false };
    }
  }

  async getUserTasteProfile(userId: string): Promise<TasteProfile> {
    const stats = await this.prisma.userListeningStats.findMany({
      where: { userId },
      orderBy: { playCount: 'desc' },
      take: 1000,
      select: {
        songId: true,
        playCount: true,
        completionCount: true,
        skipCount: true,
        totalListenSec: true,
        artistName: true,
        albumName: true,
        albumId: true,
      },
    });

    const songIds = stats.map((s) => s.songId);
    const snapshots = songIds.length > 0
      ? await this.prisma.recommendationResourceSnapshot.findMany({
          where: { resourceType: 'songs', resourceId: { in: songIds } },
          select: { resourceId: true, genreNames: true },
        })
      : [];
    const songGenres = new Map(snapshots.map((s) => [s.resourceId, s.genreNames]));

    const genreScores = new Map<string, number>();
    const artistScores = new Map<string, number>();
    let totalCompletions = 0;
    let totalPlays = 0;
    let totalListenSec = 0;
    const listenedSongIds = new Set<string>();
    const listenedAlbumIds = new Set<string>();
    const listenedAlbumNames = new Set<string>();

    for (const stat of stats) {
      listenedSongIds.add(stat.songId);
      if (stat.albumId) listenedAlbumIds.add(stat.albumId);
      if (stat.albumName) listenedAlbumNames.add(stat.albumName);

      totalPlays += stat.playCount;
      totalCompletions += stat.completionCount;
      totalListenSec += stat.totalListenSec;

      const skipPenalty = stat.playCount > 0
        ? Math.max(0, 1 - (stat.skipCount / stat.playCount) * 0.5)
        : 1;
      // A qualified play is meaningful taste input even before a listener
      // finishes a full track. Completions remain the stronger signal.
      const engagement =
        (stat.completionCount + stat.playCount * 0.25) * skipPenalty;

      if (stat.artistName) {
        artistScores.set(
          stat.artistName,
          (artistScores.get(stat.artistName) ?? 0) + engagement,
        );
      }

      const genres = songGenres.get(stat.songId) ?? [];
      for (const genre of genres) {
        genreScores.set(genre, (genreScores.get(genre) ?? 0) + engagement);
      }
    }

    const normalize = (scores: Map<string, number>) => {
      const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
      const maxScore = entries[0]?.[1] ?? 1;
      return entries.map(([name, score]) => ({
        name,
        weight: maxScore > 0 ? score / maxScore : 0,
      }));
    };

    return {
      genres: normalize(genreScores),
      artists: normalize(artistScores),
      avgCompletionRate: totalPlays > 0 ? totalCompletions / totalPlays : 0,
      totalListenTimeSec: totalListenSec,
      listenedSongIds,
      listenedAlbumIds,
      listenedAlbumNames,
    };
  }

  async hasListeningHistory(
    userId: string,
    minEvents = 3,
  ): Promise<boolean> {
    const count = await this.prisma.userListeningStats.count({
      where: { userId },
    });
    return count >= minEvents;
  }

  async getRecentlyPlayed(
    userId: string,
    limit = 20,
  ): Promise<Array<{
    songId: string;
    songTitle: string;
    artistName: string;
    albumName: string;
    albumId: string;
    playlistId: string;
    playlistName: string;
    playlistArtworkUrl: string;
    playlistArtworkBgColor: string;
    stationId: string;
    stationName: string;
    stationArtworkUrl: string;
    stationArtworkBgColor: string;
    lastPlayedAt: Date;
  }>> {
    return this.prisma.userListeningStats.findMany({
      where: { userId },
      orderBy: { lastPlayedAt: 'desc' },
      take: limit,
      select: {
        songId: true,
        songTitle: true,
        artistName: true,
        albumName: true,
        albumId: true,
        playlistId: true,
        playlistName: true,
        playlistArtworkUrl: true,
        playlistArtworkBgColor: true,
        stationId: true,
        stationName: true,
        stationArtworkUrl: true,
        stationArtworkBgColor: true,
        lastPlayedAt: true,
      },
    });
  }

  async getTopArtistsForUser(
    userId: string,
    limit = 5,
  ): Promise<Array<{ artistName: string; _sum: { playCount: number | null } }>> {
    const results = await this.prisma.userListeningStats.groupBy({
      by: ['artistName'],
      where: { userId, artistName: { not: '' } },
      _sum: { playCount: true },
      orderBy: { _sum: { playCount: 'desc' } },
      take: limit,
    });
    return results;
  }

  async getUserSongIds(userId: string): Promise<Set<string>> {
    const songs = await this.prisma.userListeningStats.findMany({
      where: { userId },
      orderBy: { playCount: 'desc' },
      take: 1000,
      select: { songId: true },
    });
    return new Set(songs.map((s) => s.songId));
  }

  async getTrendingSongs(
    days = 7,
    limit = 20,
  ): Promise<Array<{ songId: string; totalPlays: bigint }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.$queryRaw<
      Array<{ songId: string; totalPlays: bigint }>
    >`
      SELECT "songId", SUM("playCount")::bigint AS "totalPlays"
      FROM user_listening_stats
      WHERE "lastPlayedAt" >= ${since}
      GROUP BY "songId"
      ORDER BY "totalPlays" DESC
      LIMIT ${limit}
    `;
  }

  async getTopArtistsGlobal(
    days = 30,
    limit = 20,
  ): Promise<Array<{ artistName: string; totalPlays: bigint }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.$queryRaw<
      Array<{ artistName: string; totalPlays: bigint }>
    >`
      SELECT "artistName", SUM("playCount")::bigint AS "totalPlays"
      FROM user_listening_stats
      WHERE "lastPlayedAt" >= ${since} AND "artistName" != ''
      GROUP BY "artistName"
      ORDER BY "totalPlays" DESC
      LIMIT ${limit}
    `;
  }

  async getTopAlbumsGlobal(
    days = 30,
    limit = 20,
  ): Promise<Array<{ albumId: string | null; albumName: string; totalPlays: bigint }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.$queryRaw<
      Array<{ albumId: string | null; albumName: string; totalPlays: bigint }>
    >`
      SELECT
        MAX(NULLIF("albumId", '')) AS "albumId",
        MAX("albumName") AS "albumName",
        SUM("playCount")::bigint AS "totalPlays"
      FROM user_listening_stats
      WHERE "lastPlayedAt" >= ${since}
        AND ("albumId" != '' OR "albumName" != '')
      GROUP BY COALESCE(NULLIF("albumId", ''), CONCAT('legacy:', "albumName"))
      ORDER BY "totalPlays" DESC
      LIMIT ${limit}
    `;
  }
}
