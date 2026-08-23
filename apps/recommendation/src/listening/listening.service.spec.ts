import { Logger } from '@nestjs/common';
import type {
  GetListeningAnalyticsRequest,
  RecordListeningEventRequest,
} from '@musical/shared-proto';
import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ListeningService } from './listening.service';

jest.mock('@musical/shared-constants', () => ({
  RECENTLY_PLAYED_CONTEXT_LIMIT: 20,
}));

jest.mock('@musical/shared-proto', () => ({
  ListeningEventType: {
    LISTENING_EVENT_TYPE_PLAY_START: 1,
    LISTENING_EVENT_TYPE_PLAY_COMPLETE: 2,
    LISTENING_EVENT_TYPE_SKIP: 3,
  },
}));

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      readonly code: string;
      readonly meta?: Record<string, unknown>;

      constructor(
        message: string,
        options: { code: string; meta?: Record<string, unknown> },
      ) {
        super(message);
        this.code = options.code;
        this.meta = options.meta;
      }
    },
    empty: { values: [] },
    join: (values: unknown[]) => ({ values }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
  },
}));

function queryRawCalls(mock: jest.Mock): unknown[][] {
  return mock.mock.calls as unknown[][];
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSqlFragment(value: unknown): value is { values: readonly unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'values' in value &&
    Array.isArray(value.values)
  );
}

function sqlQueryText(call: readonly unknown[]): string {
  const [strings] = call;
  if (!isStringArray(strings)) {
    throw new Error('Expected a tagged SQL template call');
  }

  return strings.join('');
}

function joinedSongIds(call: readonly unknown[]): readonly unknown[] {
  const songIdFilter = call[2];
  if (!isSqlFragment(songIdFilter)) {
    throw new Error('Expected an SQL song ID filter');
  }

  const [joinedValues] = songIdFilter.values;
  if (!isSqlFragment(joinedValues)) {
    throw new Error('Expected joined song IDs');
  }

  return joinedValues.values;
}

describe('ListeningService.recordEvent', () => {
  let transaction: jest.Mock;
  let createEvent: jest.Mock;
  let upsertStats: jest.Mock;
  let upsertContext: jest.Mock;
  let findExcessContexts: jest.Mock;
  let service: ListeningService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    transaction = jest.fn();
    createEvent = jest.fn();
    upsertStats = jest.fn();
    upsertContext = jest.fn();
    findExcessContexts = jest.fn().mockResolvedValue([]);

    const tx = {
      listeningEvent: { create: createEvent },
      userListeningStats: { upsert: upsertStats },
      userRecentlyPlayedContext: { upsert: upsertContext },
    };
    transaction.mockImplementation(
      (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    service = new ListeningService({
      $transaction: transaction,
      userRecentlyPlayedContext: {
        findMany: findExcessContexts,
        deleteMany: jest.fn(),
      },
    } as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects an invalid event type before writing telemetry', async () => {
    await expect(
      service.recordEvent(listeningRequest({ eventType: 0 })),
    ).resolves.toEqual({ success: false });

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a duration that cannot describe the reported track', async () => {
    await expect(
      service.recordEvent(
        listeningRequest({ durationSec: 121, totalSec: 120 }),
      ),
    ).resolves.toEqual({ success: false });

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an implausibly long duration before writing telemetry', async () => {
    await expect(
      service.recordEvent(
        listeningRequest({ durationSec: 86_401, totalSec: 86_401 }),
      ),
    ).resolves.toEqual({ success: false });

    expect(transaction).not.toHaveBeenCalled();
  });

  it('commits the event, aggregate and playback context in one transaction', async () => {
    await expect(
      service.recordEvent(
        listeningRequest({
          durationSec: 42,
          totalSec: 180,
          stationId: 'station-1',
        }),
      ),
    ).resolves.toEqual({ success: true });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: null,
          durationSec: 42,
          totalSec: 180,
          eventType: 'PLAY_START',
        }) as unknown,
      }),
    );
    expect(upsertStats).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          playCount: 1,
          totalListenSec: 42,
        }) as unknown,
        update: expect.objectContaining({
          playCount: { increment: 1 },
          totalListenSec: { increment: 42 },
        }) as unknown,
      }),
    );
    expect(upsertContext).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          resourceType: 'stations',
          resourceId: 'station-1',
        }) as unknown,
      }),
    );
    expect(findExcessContexts).toHaveBeenCalledTimes(1);
  });

  it('stores a sanitized client event ID with the event', async () => {
    await expect(
      service.recordEvent(listeningRequest({ eventId: ' event-1 ' })),
    ).resolves.toEqual({ success: true });

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventId: 'event-1' }) as unknown,
      }),
    );
  });

  it('rejects an oversized client event ID before writing telemetry', async () => {
    await expect(
      service.recordEvent(listeningRequest({ eventId: 'x'.repeat(129) })),
    ).resolves.toEqual({ success: false });

    expect(transaction).not.toHaveBeenCalled();
  });

  it('treats a duplicate client event ID as an idempotent success', async () => {
    createEvent.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate event', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['userId', 'eventId'] },
      }),
    );

    await expect(
      service.recordEvent(listeningRequest({ eventId: 'event-1' })),
    ).resolves.toEqual({ success: true });

    expect(upsertStats).not.toHaveBeenCalled();
    expect(upsertContext).not.toHaveBeenCalled();
    expect(findExcessContexts).not.toHaveBeenCalled();
  });

  it('does not hide a different unique-constraint failure as an idempotent replay', async () => {
    createEvent.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('different duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['userId', 'songId'] },
      }),
    );

    await expect(
      service.recordEvent(listeningRequest({ eventId: 'event-1' })),
    ).resolves.toEqual({ success: false });

    expect(upsertStats).not.toHaveBeenCalled();
  });

  it('reports failure when the transaction cannot commit', async () => {
    transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.recordEvent(listeningRequest())).resolves.toEqual({
      success: false,
    });

    expect(findExcessContexts).not.toHaveBeenCalled();
  });
});

function listeningRequest(
  overrides: Partial<RecordListeningEventRequest> = {},
): RecordListeningEventRequest {
  return {
    userId: 'user-1',
    songId: 'song-1',
    eventType: 1,
    durationSec: 30,
    totalSec: 180,
    ...overrides,
  } as RecordListeningEventRequest;
}

describe('ListeningService.getListeningAnalytics', () => {
  let queryRaw: jest.Mock;
  let service: ListeningService;

  beforeEach(() => {
    queryRaw = jest.fn();
    service = new ListeningService({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  it('returns bounded aggregate rows without loading each listening event', async () => {
    queryRaw
      .mockResolvedValueOnce([
        { plays: 4n, completions: 2n, skips: 1n, listeners: 3n },
      ])
      .mockResolvedValueOnce([
        {
          date: '2026-08-20',
          plays: 3n,
          completions: 1n,
          skips: 1n,
          listeners: 2n,
        },
      ])
      .mockResolvedValueOnce([
        {
          songId: 'song-1',
          title: 'First title',
          artistName: 'Artist',
          plays: 3n,
          completions: 1n,
          skips: 1n,
          listeners: 2n,
        },
      ]);

    await expect(
      service.getListeningAnalytics(
        analyticsRequest({ songIds: [' song-1 ', '', 'song-1', 'song-2'] }),
      ),
    ).resolves.toEqual({
      plays: 4,
      completions: 2,
      skips: 1,
      listeners: 3,
      trend: [
        {
          date: '2026-08-20',
          plays: 3,
          completions: 1,
          skips: 1,
          listeners: 2,
        },
      ],
      topSongs: [
        {
          songId: 'song-1',
          title: 'First title',
          artistName: 'Artist',
          plays: 3,
          completions: 1,
          skips: 1,
          listeners: 2,
        },
      ],
    });

    expect(queryRaw).toHaveBeenCalledTimes(3);
    const queryText = queryRawCalls(queryRaw)
      .map((call) => sqlQueryText(call))
      .join('\n');
    expect(queryText).toContain('COUNT(DISTINCT "userId")');
    expect(queryText).toContain("AT TIME ZONE 'UTC'");
    expect(queryText).toContain('LIMIT 10');

    for (const call of queryRawCalls(queryRaw)) {
      expect(joinedSongIds(call)).toEqual(['song-1', 'song-2']);
    }
  });

  it('caps unique song-id filters at one thousand', async () => {
    queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.getListeningAnalytics(
      analyticsRequest({
        songIds: Array.from({ length: 1_005 }, (_, index) => `song-${index}`),
      }),
    );

    for (const call of queryRawCalls(queryRaw)) {
      expect(joinedSongIds(call)).toHaveLength(1_000);
    }
  });
});

function analyticsRequest(
  overrides: Partial<GetListeningAnalyticsRequest> = {},
): GetListeningAnalyticsRequest {
  return {
    days: 28,
    songIds: [],
    ...overrides,
  };
}
