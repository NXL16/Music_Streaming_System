import { Injectable, Logger } from '@nestjs/common';
import {
  ListeningEventType,
  GetListeningAnalyticsRequest,
  ListeningAnalyticsResponse,
  RecordListeningEventRequest,
  RecordListeningEventResponse,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';
import { RECENTLY_PLAYED_CONTEXT_LIMIT } from '@musical/shared-constants';
import { Prisma } from '../generated/prisma/client';

export type TasteProfile = {
  genres: Array<{ name: string; weight: number }>;
  artists: Array<{ name: string; weight: number }>;
  avgCompletionRate: number;
  totalListenTimeSec: number;
  listenedSongIds: Set<string>;
  listenedAlbumIds: Set<string>;
  listenedAlbumNames: Set<string>;
};

type RecentlyPlayedContext = {
  resourceType: 'albums' | 'playlists' | 'stations';
  resourceId: string;
};

const EVENT_TYPE_MAP: Record<number, string> = {
  [ListeningEventType.LISTENING_EVENT_TYPE_PLAY_START]: 'PLAY_START',
  [ListeningEventType.LISTENING_EVENT_TYPE_PLAY_COMPLETE]: 'PLAY_COMPLETE',
  [ListeningEventType.LISTENING_EVENT_TYPE_SKIP]: 'SKIP',
};

const MAX_ID_LENGTH = 128;
const MAX_EVENT_ID_LENGTH = 128;
const MAX_ARTWORK_URL_LENGTH = 1000;
const MAX_ARTWORK_COLOR_LENGTH = 16;
const MAX_METADATA_TEXT_LENGTH = 4096;
const MAX_DURATION_SECONDS = 86_400;
const MAX_ANALYTICS_SONG_IDS = 1_000;

type AggregateCount = bigint | number;

type ListeningAnalyticsSummaryRow = {
  plays: AggregateCount;
  completions: AggregateCount;
  skips: AggregateCount;
  listeners: AggregateCount;
};

type ListeningAnalyticsTrendRow = ListeningAnalyticsSummaryRow & {
  date: string;
};

type ListeningAnalyticsTopSongRow = ListeningAnalyticsSummaryRow & {
  songId: string;
  title: string;
  artistName: string;
};

function normalizeText(value: string | undefined, maxLength: number): string {
  return value?.trim().slice(0, maxLength) ?? '';
}

function normalizeOptionalValue(
  value: string | undefined,
  maxLength: number,
): string {
  const normalized = value?.trim() ?? '';
  return normalized.length <= maxLength ? normalized : '';
}

function isValidDuration(value: number): boolean {
  return (
    Number.isSafeInteger(value) && value >= 0 && value <= MAX_DURATION_SECONDS
  );
}

function normalizeAnalyticsSongIds(songIds: readonly string[]): string[] {
  const normalizedIds = new Set<string>();

  for (const songId of songIds) {
    const normalized = songId.trim();
    if (!normalized || normalized.length > MAX_ID_LENGTH) continue;

    normalizedIds.add(normalized);
    if (normalizedIds.size === MAX_ANALYTICS_SONG_IDS) break;
  }

  return [...normalizedIds];
}

function toCount(value: AggregateCount): number {
  return Number(value);
}

function isListeningEventIdempotencyConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;
  return (
    (Array.isArray(target) &&
      target.length === 2 &&
      target.includes('userId') &&
      target.includes('eventId')) ||
    target === 'listening_events_userId_eventId_key'
  );
}

@Injectable()
export class ListeningService {
  private readonly logger = new Logger(ListeningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async cleanupPlaylistHistory(userId: string, playlistId: string) {
    await this.prisma.$transaction([
      this.prisma.listeningEvent.deleteMany({ where: { userId, playlistId } }),
      this.prisma.userListeningStats.updateMany({
        where: { userId, playlistId },
        data: {
          playlistId: '',
          playlistName: '',
          playlistArtworkUrl: '',
          playlistArtworkBgColor: '',
        },
      }),
      this.prisma.userRecentlyPlayedContext.deleteMany({
        where: { userId, resourceType: 'playlists', resourceId: playlistId },
      }),
    ]);
  }

  private resolveRecentlyPlayedContext({
    stationId,
    playlistId,
    albumId,
  }: {
    stationId: string;
    playlistId: string;
    albumId: string;
  }): RecentlyPlayedContext | null {
    if (stationId) return { resourceType: 'stations', resourceId: stationId };
    if (playlistId)
      return { resourceType: 'playlists', resourceId: playlistId };
    if (albumId) return { resourceType: 'albums', resourceId: albumId };

    return null;
  }

  private async trimRecentlyPlayedContexts(userId: string) {
    const excessContexts = await this.prisma.userRecentlyPlayedContext.findMany(
      {
        where: { userId },
        orderBy: [{ lastPlayedAt: 'desc' }, { id: 'desc' }],
        skip: RECENTLY_PLAYED_CONTEXT_LIMIT,
        select: { id: true },
      },
    );

    if (excessContexts.length === 0) return;

    await this.prisma.userRecentlyPlayedContext.deleteMany({
      where: {
        id: {
          in: excessContexts.map((context) => context.id),
        },
      },
    });
  }

  async recordEvent(
    request: RecordListeningEventRequest,
  ): Promise<RecordListeningEventResponse> {
    const userId = request.userId?.trim() ?? '';
    const songId = request.songId?.trim() ?? '';
    const eventId = request.eventId?.trim() ?? '';
    if (
      !userId ||
      !songId ||
      userId.length > MAX_ID_LENGTH ||
      songId.length > MAX_ID_LENGTH
    ) {
      this.logger.warn(
        'Ignoring listening event with an invalid user or song ID',
      );
      return { success: false };
    }
    if (eventId.length > MAX_EVENT_ID_LENGTH) {
      this.logger.warn('Ignoring listening event with an oversized event ID');
      return { success: false };
    }

    const eventType = EVENT_TYPE_MAP[request.eventType];
    const durationSec = request.durationSec ?? 0;
    const totalSec = request.totalSec ?? 0;
    if (
      !eventType ||
      !isValidDuration(durationSec) ||
      !isValidDuration(totalSec)
    ) {
      this.logger.warn(
        'Ignoring listening event with an invalid type or duration',
      );
      return { success: false };
    }
    if (totalSec > 0 && durationSec > totalSec) {
      this.logger.warn(
        'Ignoring listening event with duration above total duration',
      );
      return { success: false };
    }
    const songTitle = normalizeText(
      request.songTitle,
      MAX_METADATA_TEXT_LENGTH,
    );
    const artistName = normalizeText(
      request.artistName,
      MAX_METADATA_TEXT_LENGTH,
    );
    const albumName = normalizeText(
      request.albumName,
      MAX_METADATA_TEXT_LENGTH,
    );
    const albumId = normalizeOptionalValue(request.albumId, MAX_ID_LENGTH);
    const playlistId = normalizeOptionalValue(
      request.playlistId,
      MAX_ID_LENGTH,
    );
    const playlistName = normalizeText(
      request.playlistName,
      MAX_METADATA_TEXT_LENGTH,
    );
    const playlistCuratorName = normalizeText(
      request.playlistCuratorName,
      MAX_METADATA_TEXT_LENGTH,
    );
    const playlistArtworkUrl = normalizeOptionalValue(
      request.playlistArtworkUrl,
      MAX_ARTWORK_URL_LENGTH,
    );
    const playlistArtworkBgColor = normalizeOptionalValue(
      request.playlistArtworkBgColor,
      MAX_ARTWORK_COLOR_LENGTH,
    );
    const stationId = normalizeOptionalValue(request.stationId, MAX_ID_LENGTH);
    const stationName = normalizeText(
      request.stationName,
      MAX_METADATA_TEXT_LENGTH,
    );
    const stationArtworkUrl = normalizeOptionalValue(
      request.stationArtworkUrl,
      MAX_ARTWORK_URL_LENGTH,
    );
    const stationArtworkBgColor = normalizeOptionalValue(
      request.stationArtworkBgColor,
      MAX_ARTWORK_COLOR_LENGTH,
    );

    try {
      const isPlayStart = eventType === 'PLAY_START';
      const isComplete = eventType === 'PLAY_COMPLETE';
      const isSkip = eventType === 'SKIP';
      const context = isPlayStart
        ? this.resolveRecentlyPlayedContext({
            stationId,
            playlistId,
            albumId,
          })
        : null;

      await this.prisma.$transaction(async (tx) => {
        await tx.listeningEvent.create({
          data: {
            userId,
            songId,
            eventId: eventId || null,
            eventType,
            durationSec,
            totalSec,
            songTitle,
            artistName,
            albumName,
            albumId,
            playlistId,
            playlistName,
            playlistCuratorName,
            playlistArtworkUrl,
            playlistArtworkBgColor,
            stationId,
            stationName,
            stationArtworkUrl,
            stationArtworkBgColor,
          },
        });

        await tx.userListeningStats.upsert({
          where: { userId_songId: { userId, songId } },
          create: {
            userId,
            songId,
            playCount: isPlayStart ? 1 : 0,
            completionCount: isComplete ? 1 : 0,
            skipCount: isSkip ? 1 : 0,
            totalListenSec: durationSec,
            lastPlayedAt: new Date(),
            songTitle,
            artistName,
            albumName,
            albumId,
            playlistId,
            playlistName,
            playlistCuratorName,
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
            totalListenSec: { increment: durationSec },
            lastPlayedAt: new Date(),
            songTitle,
            artistName,
            albumName,
            ...(albumId && { albumId }),
            playlistId,
            playlistName,
            playlistCuratorName,
            playlistArtworkUrl,
            playlistArtworkBgColor,
            stationId,
            stationName,
            stationArtworkUrl,
            stationArtworkBgColor,
          },
        });

        if (context) {
          await tx.userRecentlyPlayedContext.upsert({
            where: {
              userId_resourceType_resourceId: {
                userId,
                resourceType: context.resourceType,
                resourceId: context.resourceId,
              },
            },
            create: {
              userId,
              resourceType: context.resourceType,
              resourceId: context.resourceId,
              lastPlayedAt: new Date(),
            },
            update: {
              lastPlayedAt: new Date(),
            },
          });
        }
      });

      if (context) {
        await this.trimRecentlyPlayedContexts(userId).catch((trimError) => {
          this.logger.warn(
            `Unable to trim recently played contexts: ${trimError instanceof Error ? trimError.message : String(trimError)}`,
          );
        });
      }

      return { success: true };
    } catch (error) {
      // The event insert occurs before aggregates in the same transaction. A
      // duplicate key therefore rolls back before any counter can be changed.
      if (eventId && isListeningEventIdempotencyConflict(error)) {
        return { success: true };
      }
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
    const snapshots =
      songIds.length > 0
        ? await this.prisma.recommendationResourceSnapshot.findMany({
            where: { resourceType: 'songs', resourceId: { in: songIds } },
            select: { resourceId: true, genreNames: true },
          })
        : [];
    const songGenres = new Map(
      snapshots.map((s) => [s.resourceId, s.genreNames]),
    );

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

      const skipPenalty =
        stat.playCount > 0
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

  async hasListeningHistory(userId: string, minEvents = 3): Promise<boolean> {
    const count = await this.prisma.userListeningStats.count({
      where: { userId },
    });
    return count >= minEvents;
  }

  async getRecentlyPlayed(
    userId: string,
    limit = 20,
  ): Promise<
    Array<{
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
    }>
  > {
    // `UserListeningStats` is an aggregate keyed by user and song. A later
    // standalone play of the same song overwrites its station context, so it
    // cannot represent a reliable Recently Played history. Use immutable play
    // events and retain the original source station/playlist metadata.
    const events = await this.prisma.listeningEvent.findMany({
      where: { userId, eventType: 'PLAY_START' },
      orderBy: { createdAt: 'desc' },
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
        createdAt: true,
      },
    });
    return events.map((event) => ({
      ...event,
      lastPlayedAt: event.createdAt,
    }));
  }

  async getTopArtistsForUser(
    userId: string,
    limit = 5,
  ): Promise<
    Array<{ artistName: string; _sum: { playCount: number | null } }>
  > {
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
    return this.prisma.$queryRaw<Array<{ songId: string; totalPlays: bigint }>>`
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
  ): Promise<
    Array<{ albumId: string | null; albumName: string; totalPlays: bigint }>
  > {
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

  async getListeningAnalytics(
    request: GetListeningAnalyticsRequest,
  ): Promise<ListeningAnalyticsResponse> {
    const days = Math.min(90, Math.max(1, request.days || 28));
    const since = new Date(Date.now() - days * 86_400_000);
    const songIds = normalizeAnalyticsSongIds(request.songIds);
    const songIdFilter = songIds.length
      ? Prisma.sql`AND "songId" IN (${Prisma.join(songIds)})`
      : Prisma.empty;

    // Keep the three response dimensions in the database: each query returns
    // at most one row, 90 daily rows, or ten songs. `AT TIME ZONE 'UTC'`
    // matches the previous `Date#toISOString()` day bucketing exactly.
    const [summaryRows, trendRows, topSongRows] = await Promise.all([
      this.prisma.$queryRaw<ListeningAnalyticsSummaryRow[]>`
        SELECT
          COUNT(*) FILTER (WHERE "eventType" = 'PLAY_START') AS "plays",
          COUNT(*) FILTER (WHERE "eventType" = 'PLAY_COMPLETE') AS "completions",
          COUNT(*) FILTER (WHERE "eventType" = 'SKIP') AS "skips",
          COUNT(DISTINCT "userId") AS "listeners"
        FROM listening_events
        WHERE "createdAt" >= ${since}
        ${songIdFilter}
      `,
      this.prisma.$queryRaw<ListeningAnalyticsTrendRow[]>`
        SELECT
          TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "date",
          COUNT(*) FILTER (WHERE "eventType" = 'PLAY_START') AS "plays",
          COUNT(*) FILTER (WHERE "eventType" = 'PLAY_COMPLETE') AS "completions",
          COUNT(*) FILTER (WHERE "eventType" = 'SKIP') AS "skips",
          COUNT(DISTINCT "userId") AS "listeners"
        FROM listening_events
        WHERE "createdAt" >= ${since}
        ${songIdFilter}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      this.prisma.$queryRaw<ListeningAnalyticsTopSongRow[]>`
        WITH top_songs AS (
          SELECT
            "songId",
            COUNT(*) FILTER (WHERE "eventType" = 'PLAY_START') AS "plays",
            COUNT(*) FILTER (WHERE "eventType" = 'PLAY_COMPLETE') AS "completions",
            COUNT(*) FILTER (WHERE "eventType" = 'SKIP') AS "skips",
            COUNT(DISTINCT "userId") AS "listeners"
          FROM listening_events
          WHERE "createdAt" >= ${since}
          ${songIdFilter}
          GROUP BY "songId"
          ORDER BY "plays" DESC, "songId" ASC
          LIMIT 10
        )
        SELECT
          top_songs."songId",
          metadata."songTitle" AS "title",
          metadata."artistName" AS "artistName",
          top_songs."plays",
          top_songs."completions",
          top_songs."skips",
          top_songs."listeners"
        FROM top_songs
        JOIN LATERAL (
          SELECT "songTitle", "artistName"
          FROM listening_events
          WHERE "songId" = top_songs."songId"
            AND "createdAt" >= ${since}
          ORDER BY "createdAt" ASC, "id" ASC
          LIMIT 1
        ) AS metadata ON TRUE
        ORDER BY top_songs."plays" DESC, top_songs."songId" ASC
      `,
    ]);

    const summary = summaryRows[0] ?? {
      plays: 0,
      completions: 0,
      skips: 0,
      listeners: 0,
    };

    return {
      plays: toCount(summary.plays),
      completions: toCount(summary.completions),
      skips: toCount(summary.skips),
      listeners: toCount(summary.listeners),
      trend: trendRows.map((row) => ({
        date: row.date,
        plays: toCount(row.plays),
        completions: toCount(row.completions),
        skips: toCount(row.skips),
        listeners: toCount(row.listeners),
      })),
      topSongs: topSongRows.map((row) => ({
        songId: row.songId,
        title: row.title,
        artistName: row.artistName,
        plays: toCount(row.plays),
        completions: toCount(row.completions),
        skips: toCount(row.skips),
        listeners: toCount(row.listeners),
      })),
    };
  }
}
