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
import { audioFeaturesFromAttributes } from '../common/audio-features';

export type TasteProfile = {
  genres: Array<{ name: string; weight: number }>;
  artists: Array<{ name: string; weight: number }>;
  /** Upload-time AI labels, learned only from qualified listening behaviour. */
  audioTags: Array<{ name: string; weight: number }>;
  preferredBpm: number | null;
  bpmTolerance: number | null;
  preferredEnergy: number | null;
  energyTolerance: number | null;
  avgCompletionRate: number;
  totalListenTimeSec: number;
  listenedSongIds: Set<string>;
  /** Ordered audio-vector seeds: explicit positive song preferences first. */
  audioSeedSongIds: Set<string>;
  listenedAlbumIds: Set<string>;
  listenedAlbumNames: Set<string>;
  hiddenResourceIds: Map<string, Set<string>>;
};

type RecentlyPlayedContext = {
  resourceType: 'albums' | 'playlists' | 'stations';
  resourceId: string;
};

const EVENT_TYPE_MAP: Record<number, string> = {
  [ListeningEventType.LISTENING_EVENT_TYPE_PLAY_START]: 'PLAY_START',
  [ListeningEventType.LISTENING_EVENT_TYPE_PLAY_COMPLETE]: 'PLAY_COMPLETE',
  [ListeningEventType.LISTENING_EVENT_TYPE_SKIP]: 'SKIP',
  [ListeningEventType.LISTENING_EVENT_TYPE_PLAY_STOPPED]: 'PLAY_STOPPED',
};

const MAX_ID_LENGTH = 128;
const MAX_EVENT_ID_LENGTH = 128;
const MAX_ARTWORK_URL_LENGTH = 1000;
const MAX_ARTWORK_COLOR_LENGTH = 16;
const MAX_METADATA_TEXT_LENGTH = 4096;
const MAX_DURATION_SECONDS = 86_400;
const MAX_ANALYTICS_SONG_IDS = 1_000;
// Let the profile adapt to a listener's current taste while retaining a
// smaller durable signal from their older history.
const TASTE_AFFINITY_HALF_LIFE_DAYS = 120;
const PROFILE_ACTIVITY_LIMIT = 1_000;
const MAX_PREFERENCE_AUDIO_SEEDS = 12;
const EARLY_SKIP_SECONDS = 3;
const SHORT_LISTEN_RATIO = 0.3;
const ENGAGED_LISTEN_RATIO = 0.7;
const COMPLETION_LISTEN_RATIO = 0.9;
const MAX_REPLAY_AFFINITY = 3;
const AFFINITY_EPSILON = 1e-6;
const HOME_REGENERATION_MIN_INTERVAL_MS = 30 * 60 * 1000;

type WeightedAudioMetric = {
  weight: number;
  sum: number;
  squaredSum: number;
};

function audioMetricValue(
  metric: WeightedAudioMetric,
  minimumTolerance: number,
): { preferred: number | null; tolerance: number | null } {
  if (metric.weight <= AFFINITY_EPSILON) {
    return { preferred: null, tolerance: null };
  }
  // Store a stable public profile value instead of exposing harmless IEEE-754
  // residue such as 120.00000000000001 to ranking, logs, or API consumers.
  const preferred =
    Math.round((metric.sum / metric.weight) * 1_000_000) / 1_000_000;
  const variance = Math.max(
    0,
    metric.squaredSum / metric.weight - preferred * preferred,
  );
  // A tolerance floor prevents a few nearly-identical recent songs from
  // making the profile too narrow and starving discovery candidates.
  return {
    preferred,
    tolerance: Math.max(minimumTolerance, Math.sqrt(variance) * 1.5),
  };
}

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

function listeningQuality({
  totalListenSec,
  totalEligibleSec,
  playCount,
  skipCount,
  earlySkipCount,
}: {
  totalListenSec: number;
  totalEligibleSec: number;
  playCount: number;
  skipCount: number;
  earlySkipCount: number;
}): number {
  if (totalEligibleSec <= 0 || playCount <= 0) return 0;

  const listenedRatio = Math.min(1, totalListenSec / totalEligibleSec);
  const ratioSignal =
    listenedRatio >= COMPLETION_LISTEN_RATIO
      ? 1
      : listenedRatio >= ENGAGED_LISTEN_RATIO
        ? 0.8
        : listenedRatio >= SHORT_LISTEN_RATIO
          ? 0.45
          : 0.1;
  const earlySkipRate = Math.min(1, earlySkipCount / playCount);
  const skipRate = Math.min(1, skipCount / playCount);

  // An early skip is deliberate negative evidence. A later switch has a much
  // smaller penalty because the listener may already have enjoyed most of it.
  return Math.max(0, ratioSignal - earlySkipRate * 0.8 - skipRate * 0.2);
}

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

function trackIdsFromRelationships(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const relationships = value as Record<string, unknown>;
  const tracks = relationships.tracks;
  if (!tracks || typeof tracks !== 'object' || Array.isArray(tracks)) return [];
  const data = (tracks as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((track) => {
    if (!track || typeof track !== 'object' || Array.isArray(track)) return [];
    const reference = track as Record<string, unknown>;
    return reference.type === 'songs' && typeof reference.id === 'string'
      ? [reference.id]
      : [];
  });
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

  const meta = error.meta;
  const target = meta?.target;
  if (target === 'listening_events_userId_eventId_key') return true;

  const adapterFields = (
    meta?.driverAdapterError as
      | { cause?: { constraint?: { fields?: unknown } } }
      | undefined
  )?.cause?.constraint?.fields;
  const fields = Array.isArray(target)
    ? target
    : Array.isArray(adapterFields)
      ? adapterFields
      : [];
  const normalizedFields = fields.map((field) =>
    String(field).replaceAll('"', ''),
  );
  return (
    normalizedFields.length === 2 &&
    normalizedFields.includes('userId') &&
    normalizedFields.includes('eventId')
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
      // PLAY_START is intentionally emitted only after a qualified listen.
      // Count an earlier skip as one attempted play as well, otherwise the
      // strongest negative signal would have no denominator in skip rate.
      const isEarlySkip = isSkip && durationSec < EARLY_SKIP_SECONDS;
      // A session contributes its elapsed time only at its terminal event.
      // Adding both the qualified start (3s) and completion previously
      // overstated total listening time for every completed song.
      const terminalListenSec = isPlayStart ? 0 : durationSec;
      const terminalEligibleSec = isPlayStart ? 0 : totalSec;
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
            playCount: isPlayStart || isEarlySkip ? 1 : 0,
            completionCount: isComplete ? 1 : 0,
            skipCount: isSkip ? 1 : 0,
            earlySkipCount: isEarlySkip ? 1 : 0,
            totalListenSec: terminalListenSec,
            totalEligibleSec: terminalEligibleSec,
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
            ...((isPlayStart || isEarlySkip) && {
              playCount: { increment: 1 },
            }),
            ...(isComplete && { completionCount: { increment: 1 } }),
            ...(isSkip && { skipCount: { increment: 1 } }),
            ...(isEarlySkip && { earlySkipCount: { increment: 1 } }),
            totalListenSec: { increment: terminalListenSec },
            totalEligibleSec: { increment: terminalEligibleSec },
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

        // Coalesce listening signals rather than regenerating Home during a
        // listening session. The next Home visit receives a fresh snapshot.
        const now = new Date();
        const refreshEligibleBefore = new Date(
          now.getTime() - HOME_REGENERATION_MIN_INTERVAL_MS,
        );
        await tx.recommendationPage.updateMany({
          where: {
            userId,
            status: 'PUBLISHED',
            publishedAt: { lte: refreshEligibleBefore },
            staleAfter: { gt: now },
          },
          data: { staleAfter: now },
        });
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
      // This query is backed by @@index([userId, lastPlayedAt]). A profile
      // must include a listener's newest signals, not merely their historical
      // favourites with the highest lifetime count.
      orderBy: [{ lastPlayedAt: 'desc' }, { songId: 'asc' }],
      take: PROFILE_ACTIVITY_LIMIT,
      select: {
        songId: true,
        playCount: true,
        completionCount: true,
        skipCount: true,
        earlySkipCount: true,
        totalListenSec: true,
        totalEligibleSec: true,
        lastPlayedAt: true,
        artistName: true,
        albumName: true,
        albumId: true,
      },
    });

    const [preferenceEvents, hiddenPreferences] = await Promise.all([
      this.prisma.userPreferenceEvent.findMany({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
        take: PROFILE_ACTIVITY_LIMIT,
        select: {
          resourceType: true,
          resourceId: true,
          weight: true,
          occurredAt: true,
        },
      }),
      this.prisma.userContentPreference.findMany({
        where: { userId, isHidden: true },
        select: { resourceType: true, resourceId: true },
      }),
    ]);

    const songIds = stats.map((s) => s.songId);
    const snapshotRefs = [
      ...songIds.map((resourceId) => ({ resourceType: 'songs', resourceId })),
      ...preferenceEvents.map(({ resourceType, resourceId }) => ({
        resourceType,
        resourceId,
      })),
    ];
    const snapshots =
      snapshotRefs.length > 0
        ? await this.prisma.recommendationResourceSnapshot.findMany({
            where: { OR: snapshotRefs },
            select: {
              resourceType: true,
              resourceId: true,
              name: true,
              genreNames: true,
              artistName: true,
              attributes: true,
              relationships: true,
            },
          })
        : [];
    const songGenres = new Map(
      snapshots
        .filter((snapshot) => snapshot.resourceType === 'songs')
        .map((snapshot) => [snapshot.resourceId, snapshot.genreNames]),
    );
    const songAudio = new Map(
      snapshots
        .filter((snapshot) => snapshot.resourceType === 'songs')
        .map((snapshot) => [
          snapshot.resourceId,
          audioFeaturesFromAttributes(snapshot.attributes),
        ]),
    );

    const genreScores = new Map<string, number>();
    const artistScores = new Map<string, number>();
    const audioTagScores = new Map<string, number>();
    const bpmMetric: WeightedAudioMetric = { weight: 0, sum: 0, squaredSum: 0 };
    const energyMetric: WeightedAudioMetric = { weight: 0, sum: 0, squaredSum: 0 };
    let totalCompletions = 0;
    let totalPlays = 0;
    let totalListenSec = 0;
    const listenedSongIds = new Set<string>();
    const preferenceSongScores = new Map<string, number>();
    const listenedAlbumIds = new Set<string>();
    const listenedAlbumNames = new Set<string>();

    for (const stat of stats) {
      listenedSongIds.add(stat.songId);
      if (stat.albumId) listenedAlbumIds.add(stat.albumId);
      if (stat.albumName) listenedAlbumNames.add(stat.albumName);

      totalPlays += stat.playCount;
      totalCompletions += stat.completionCount;
      totalListenSec += stat.totalListenSec;

      const quality = listeningQuality({
        totalListenSec: stat.totalListenSec,
        totalEligibleSec: stat.totalEligibleSec,
        playCount: stat.playCount,
        skipCount: stat.skipCount,
        earlySkipCount: stat.earlySkipCount,
      });
      const ageDays =
        Math.max(0, Date.now() - stat.lastPlayedAt.getTime()) / 86_400_000;
      const recencyWeight = Math.pow(
        0.5,
        ageDays / TASTE_AFFINITY_HALF_LIFE_DAYS,
      );
      const engagement =
        Math.min(stat.playCount, MAX_REPLAY_AFFINITY) * quality * recencyWeight;

      // Keep the song in listening history (so it is not immediately served
      // again), but do not let a zero-quality listen create artist/genre
      // affinity in the profile.
      if (engagement <= 0) continue;

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

      const audio = songAudio.get(stat.songId);
      if (audio) {
        for (const tag of audio.tags) {
          audioTagScores.set(tag, (audioTagScores.get(tag) ?? 0) + engagement);
        }
        if (audio.bpm !== undefined) {
          bpmMetric.weight += engagement;
          bpmMetric.sum += audio.bpm * engagement;
          bpmMetric.squaredSum += audio.bpm * audio.bpm * engagement;
        }
        if (audio.energy !== undefined) {
          energyMetric.weight += engagement;
          energyMetric.sum += audio.energy * engagement;
          energyMetric.squaredSum += audio.energy * audio.energy * engagement;
        }
      }
    }

    const snapshotByKey = new Map(
      snapshots.map((snapshot) => [
        `${snapshot.resourceType}:${snapshot.resourceId}`,
        snapshot,
      ]),
    );
    for (const event of preferenceEvents) {
      const snapshot = snapshotByKey.get(
        `${event.resourceType}:${event.resourceId}`,
      );
      if (!snapshot) continue;
      const ageDays =
        Math.max(0, Date.now() - event.occurredAt.getTime()) / 86_400_000;
      const contribution =
        event.weight * Math.pow(0.5, ageDays / TASTE_AFFINITY_HALF_LIFE_DAYS);
      const preferenceSongIds =
        event.resourceType === 'songs'
          ? [event.resourceId]
          : event.resourceType === 'albums' || event.resourceType === 'playlists'
            ? trackIdsFromRelationships(
                snapshotByKey.get(
                  `${event.resourceType}:${event.resourceId}`,
                )?.relationships,
              )
            : [];
      for (const songId of preferenceSongIds) {
        preferenceSongScores.set(
          songId,
          (preferenceSongScores.get(songId) ?? 0) + contribution,
        );
      }
      // Artist resources use `name` as their canonical artist label, whereas
      // songs/albums expose the performer through `artistName`.
      const artistName =
        snapshot.artistName ||
        (snapshot.resourceType === 'artists' ? snapshot.name : '');
      if (artistName) {
        artistScores.set(
          artistName,
          (artistScores.get(artistName) ?? 0) + contribution,
        );
      }
      for (const genre of snapshot.genreNames) {
        genreScores.set(genre, (genreScores.get(genre) ?? 0) + contribution);
      }

      // Explicit actions (Favourite, Queue, Search) should inform the same
      // AI-derived taste dimensions as qualified listening. Negative actions
      // may reduce a tag's affinity, but they never enter a mean/variance
      // calculation where a negative sample weight would be invalid.
      const audio = audioFeaturesFromAttributes(snapshot.attributes);
      for (const tag of audio.tags) {
        audioTagScores.set(
          tag,
          (audioTagScores.get(tag) ?? 0) + contribution,
        );
      }
      if (contribution > AFFINITY_EPSILON) {
        if (audio.bpm !== undefined) {
          bpmMetric.weight += contribution;
          bpmMetric.sum += audio.bpm * contribution;
          bpmMetric.squaredSum += audio.bpm * audio.bpm * contribution;
        }
        if (audio.energy !== undefined) {
          energyMetric.weight += contribution;
          energyMetric.sum += audio.energy * contribution;
          energyMetric.squaredSum += audio.energy * audio.energy * contribution;
        }
      }
    }

    const normalize = (scores: Map<string, number>) => {
      // Negative events cancel an earlier positive affinity. They are not
      // candidates themselves; exclusion is handled separately by rankers.
      const entries = [...scores.entries()]
        // Time-decayed compensating events can leave IEEE-754 rounding dust
        // around zero. Do not turn that numerical residue into a preference.
        .filter(([, score]) => score > AFFINITY_EPSILON)
        .sort((a, b) => b[1] - a[1]);
      const maxScore = entries[0]?.[1] ?? 1;
      return entries.map(([name, score]) => ({
        name,
        weight: maxScore > 0 ? score / maxScore : 0,
      }));
    };

    const hiddenResourceIds = new Map<string, Set<string>>();
    for (const hidden of hiddenPreferences) {
      const ids =
        hiddenResourceIds.get(hidden.resourceType) ?? new Set<string>();
      ids.add(hidden.resourceId);
      hiddenResourceIds.set(hidden.resourceType, ids);
    }

    const bpm = audioMetricValue(bpmMetric, 12);
    const energy = audioMetricValue(energyMetric, 0.12);
    const audioSeedSongIds = new Set([
      ...[...preferenceSongScores.entries()]
        .filter(([, score]) => score > AFFINITY_EPSILON)
        .sort(
          (left, right) =>
            right[1] - left[1] || left[0].localeCompare(right[0]),
        )
        .slice(0, MAX_PREFERENCE_AUDIO_SEEDS)
        .map(([songId]) => songId),
      ...listenedSongIds,
    ]);
    return {
      genres: normalize(genreScores),
      artists: normalize(artistScores),
      audioTags: normalize(audioTagScores),
      preferredBpm: bpm.preferred,
      bpmTolerance: bpm.tolerance,
      preferredEnergy: energy.preferred,
      energyTolerance: energy.tolerance,
      avgCompletionRate: totalPlays > 0 ? totalCompletions / totalPlays : 0,
      totalListenTimeSec: totalListenSec,
      listenedSongIds,
      audioSeedSongIds,
      listenedAlbumIds,
      listenedAlbumNames,
      hiddenResourceIds,
    };
  }

  async hasListeningHistory(userId: string, minEvents = 3): Promise<boolean> {
    const [listeningCount, positivePreference] = await Promise.all([
      this.prisma.userListeningStats.count({ where: { userId } }),
      this.prisma.userPreferenceEvent.aggregate({
        where: { userId, weight: { gt: 0 } },
        _sum: { weight: true },
      }),
    ]);

    // One explicit Favourite (+5) is a stronger cold-start signal than three
    // incidental plays, so it may unlock a personalised Home immediately.
    return (
      listeningCount >= minEvents || (positivePreference._sum.weight ?? 0) >= 5
    );
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
  ): Promise<Array<{ albumId: string; albumName: string; totalPlays: bigint }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.$queryRaw<
      Array<{ albumId: string; albumName: string; totalPlays: bigint }>
    >`
      SELECT
        "albumId",
        MAX("albumName") AS "albumName",
        SUM("playCount")::bigint AS "totalPlays"
      FROM user_listening_stats
      WHERE "lastPlayedAt" >= ${since}
        AND "albumId" != ''
      GROUP BY "albumId"
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
