import type { GetRecommendationQualityAnalyticsRequest } from '@musical/shared-proto';
import type { PrismaService } from '../database/prisma.service';
import { RecommendationsService } from './recommendations.service';

jest.mock('@musical/shared-constants', () => ({
  HOME_SHELF_PREVIEW_LIMIT: 6,
  RECENTLY_PLAYED_CONTEXT_LIMIT: 20,
}));

jest.mock('@musical/shared-proto', () => ({
  RecommendationInteractionType: {
    RECOMMENDATION_INTERACTION_TYPE_IMPRESSION: 1,
    RECOMMENDATION_INTERACTION_TYPE_OPEN: 2,
    RECOMMENDATION_INTERACTION_TYPE_PLAY: 3,
    RECOMMENDATION_INTERACTION_TYPE_DISMISS: 4,
  },
  RecommendationPresentationMode: {
    RECOMMENDATION_PRESENTATION_MODE_FIXED: 1,
  },
}));

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () => ({
  Prisma: {
    DbNull: {},
    empty: { values: [] },
    join: (values: unknown[]) => ({ values }),
    raw: (value: string) => ({ value }),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
  },
  RecommendationInteractionType: {
    IMPRESSION: 'IMPRESSION',
    OPEN: 'OPEN',
    PLAY: 'PLAY',
    DISMISS: 'DISMISS',
  },
  RecommendationPageScope: { GLOBAL: 'GLOBAL', USER: 'USER' },
  RecommendationPageStatus: {
    ARCHIVED: 'ARCHIVED',
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
  },
  RecommendationPresentationMode: { AUTO: 'AUTO', FIXED: 'FIXED' },
}));

jest.mock('./recommendation-catalog.service', () => ({
  RecommendationCatalogService: class RecommendationCatalogService {},
}));

function queryRawCalls(mock: jest.Mock): unknown[][] {
  return mock.mock.calls as unknown[][];
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isSqlFragment(
  value: unknown,
): value is { values: readonly unknown[] } {
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

describe('RecommendationsService bounded analytics', () => {
  it('aggregates recommendation quality in PostgreSQL without materializing users', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          impressions: 10n,
          opens: 4n,
          plays: 3n,
          dismisses: 1n,
          users: 5n,
        },
      ])
      .mockResolvedValueOnce([
        {
          sectionId: 'for-you',
          modelVersion: 4,
          impressions: 8n,
          opens: 3n,
          plays: 2n,
          dismisses: 1n,
          users: 4n,
        },
      ]);
    const service = new RecommendationsService(
      { $queryRaw: queryRaw } as unknown as PrismaService,
      {} as never,
    );

    await expect(
      service.getRecommendationQualityAnalytics(qualityRequest()),
    ).resolves.toMatchObject({
      summary: {
        sectionId: 'all',
        modelVersion: 0,
        impressions: 10,
        opens: 4,
        plays: 3,
        dismisses: 1,
        users: 5,
        openRate: 0.4,
        playRate: 0.3,
        dismissRate: 0.1,
      },
      sections: [
        {
          sectionId: 'for-you',
          modelVersion: 4,
          impressions: 8,
          opens: 3,
          plays: 2,
          dismisses: 1,
          users: 4,
        },
      ],
    });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    const queryText = queryRawCalls(queryRaw)
      .map((call) => sqlQueryText(call))
      .join('\n');
    expect(queryText).toContain('COUNT(DISTINCT "userId")');
    expect(queryText).toContain('GROUP BY "sectionId", "modelVersion"');
    expect(queryText).toContain('LIMIT');
  });
});

describe('RecommendationsService Home preview reads', () => {
  it('limits every Home shelf relation query to the preview size', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new RecommendationsService(
      {
        recommendationPage: { findFirst },
      } as unknown as PrismaService,
      {} as never,
    );

    await expect(
      service.getHomeRecommendations({
        userId: '',
        name: 'listen-now',
        locale: 'en-GB',
        timezone: '+07:00',
        platform: 'web',
      }),
    ).resolves.toMatchObject({ data: [] });

    expect(findFirst).toHaveBeenCalledTimes(1);
    const calls = findFirst.mock.calls as unknown[][];
    const [queryInput] = calls[0] ?? [];
    const query = queryInput as {
      include: { sections: { include: { items: { take: number } } } };
    };
    expect(query.include.sections.include.items.take).toBe(6);
  });

  it('hydrates referenced artists so Home cards can link their credits', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      name: 'listen-now',
      locale: 'en-GB',
      sections: [
        {
          externalId: 'for-you',
          title: 'For You',
          titleWithoutName: '',
          presentationMode: 'FIXED',
          displayKind: 'MusicCoverShelf',
          displayDecorations: [],
          sectionKind: 'default',
          resourceTypes: ['albums'],
          hasSeeAll: false,
          isGroupRecommendation: false,
          nextUpdateAt: null,
          version: 1,
          attributes: null,
          items: [
            {
              resourceType: 'albums',
              resourceId: 'album-1',
              sortOrder: 0,
              isPrimary: false,
              resource: {
                name: 'Album',
                href: '/catalog/vn/albums/album-1',
                externalUrl: 'album',
                raw: {
                  relationships: {
                    artists: { data: [{ id: 'artist-1', type: 'artists' }] },
                  },
                },
              },
            },
          ],
        },
      ],
      resourceLinks: [],
    });
    const findMany = jest.fn().mockResolvedValue([
      {
        resourceType: 'artists',
        resourceId: 'artist-1',
        name: 'Artist',
        externalUrl: 'artist',
      },
    ]);
    const service = new RecommendationsService(
      {
        recommendationPage: { findFirst },
        recommendationResourceSnapshot: { findMany },
      } as unknown as PrismaService,
      {} as never,
    );

    const response = await service.getHomeRecommendations({
      userId: '',
      name: 'listen-now',
      locale: 'en-GB',
      timezone: '+07:00',
      platform: 'web',
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        resourceType: 'artists',
        resourceId: { in: ['artist-1'] },
      },
    });
    expect(response.resources?.artists['artist-1']).toMatchObject({
      id: 'artist-1',
      type: 'artists',
      attributes: {
        fields: {
          name: { stringValue: 'Artist' },
          url: { stringValue: 'artist' },
        },
      },
    });
  });
});

describe('RecommendationsService runtime Recently Played', () => {
  it('loads at most one playback event per missing playlist snapshot', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        playlistId: 'playlist-1',
        playlistName: 'History playlist name',
        playlistCuratorName: 'Owner',
        playlistArtworkUrl: 'https://images.example/playlist-1.jpg',
        playlistArtworkBgColor: '111111',
      },
    ]);
    const findListeningEvents = jest.fn();
    const service = new RecommendationsService(
      {
        $queryRaw: queryRaw,
        listeningEvent: { findMany: findListeningEvents },
        recommendationResourceSnapshot: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        userRecentlyPlayedContext: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'context-1',
              resourceType: 'playlists',
              resourceId: 'playlist-1',
              lastPlayedAt: new Date('2026-08-22T00:00:00.000Z'),
            },
          ]),
        },
      } as unknown as PrismaService,
      {
        getUserPlaylist: jest.fn().mockResolvedValue({
          id: 'playlist-1',
          name: 'Current playlist name',
        }),
      } as never,
    );
    const runtimeService = service as unknown as {
      addRuntimeRecentlyPlayedSection: (
        userId: string,
        pageName: string,
        resources: unknown,
      ) => Promise<{ id: string } | null>;
      emptyResources: () => unknown;
    };
    const resources = runtimeService.emptyResources();

    await expect(
      runtimeService.addRuntimeRecentlyPlayedSection(
        'user-1',
        'listen-now',
        resources,
      ),
    ).resolves.toMatchObject({ id: 'user-recently-played' });

    expect(findListeningEvents).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [strings, userId, playlistIds] = queryRawCalls(queryRaw)[0] ?? [];
    expect(sqlQueryText([strings])).toContain('DISTINCT ON ("playlistId")');
    expect(userId).toBe('user-1');
    expect(isSqlFragment(playlistIds)).toBe(true);
    if (!isSqlFragment(playlistIds)) {
      throw new Error('Expected a joined playlist ID fragment');
    }
    expect(playlistIds.values).toEqual(['playlist-1']);
  });
});

describe('RecommendationsService generation lease fencing', () => {
  it('locks and verifies the current lease token before a page write', async () => {
    const service = new RecommendationsService(
      {} as PrismaService,
      {} as never,
    );
    const guardedService = service as unknown as {
      assertGenerationLease: (
        tx: { $queryRaw: jest.Mock },
        lease: { leaseKey: string; leaseToken: string } | undefined,
      ) => Promise<void>;
    };
    const queryRaw = jest.fn().mockResolvedValue([{ leaseKey: 'home-key' }]);

    await expect(
      guardedService.assertGenerationLease(
        { $queryRaw: queryRaw },
        { leaseKey: 'home-key', leaseToken: 'lease-token' },
      ),
    ).resolves.toBeUndefined();

    const query = sqlQueryText(queryRawCalls(queryRaw)[0] ?? []);
    expect(query).toContain('FOR UPDATE');
    expect(query).toContain('AND "leaseToken" =');
    expect(query).toContain('AND "expiresAt" > clock_timestamp()');
  });

  it('rejects a stale worker before it can replace a page', async () => {
    const service = new RecommendationsService(
      {} as PrismaService,
      {} as never,
    );
    const guardedService = service as unknown as {
      assertGenerationLease: (
        tx: { $queryRaw: jest.Mock },
        lease: { leaseKey: string; leaseToken: string },
      ) => Promise<void>;
    };

    await expect(
      guardedService.assertGenerationLease(
        { $queryRaw: jest.fn().mockResolvedValue([]) },
        { leaseKey: 'home-key', leaseToken: 'stale-token' },
      ),
    ).rejects.toThrow('Recommendation generation lease is no longer held');
  });
});

function qualityRequest(
  overrides: Partial<GetRecommendationQualityAnalyticsRequest> = {},
): GetRecommendationQualityAnalyticsRequest {
  return {
    days: 28,
    limit: 20,
    ...overrides,
  };
}
