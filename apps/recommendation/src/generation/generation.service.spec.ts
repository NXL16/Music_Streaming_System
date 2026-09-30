import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { GENERATION_LEASE_LOST_MESSAGE } from './generation-lease.types';
import {
  GenerationService,
  isGenerationLeaseLostError,
} from './generation.service';

jest.mock(
  '@grpc/grpc-js',
  () => ({ status: { ABORTED: 10 } }),
  { virtual: true },
);
jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../listening/listening.service', () => ({
  ListeningService: class ListeningService {},
}));
jest.mock('../recommendations/recommendations.service', () => ({
  RecommendationsService: class RecommendationsService {},
}));
jest.mock('../recommendations/recommendation-catalog.service', () => ({
  RecommendationCatalogService: class RecommendationCatalogService {},
}));
jest.mock('../recommendations/catalog-synchronization.service', () => ({
  CatalogSynchronizationService: class CatalogSynchronizationService {},
}));
jest.mock('../recommendations/system-station-artwork.service', () => ({
  SystemStationArtworkService: class SystemStationArtworkService {},
}));
jest.mock('./recommendation-engine.service', () => ({
  PERSONALIZATION_MODEL_VERSION: 1,
  RecommendationEngineService: class RecommendationEngineService {},
}));
jest.mock('./generation-lease.service', () => ({
  GenerationLeaseService: class GenerationLeaseService {},
}));
jest.mock('../stations/artist-station.service', () => ({
  ArtistStationService: class ArtistStationService {},
}));

const ABORTED_STATUS = 10;

describe('GenerationService lease cancellation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('recognizes only the fenced lease-loss abort', () => {
    expect(
      isGenerationLeaseLostError(
        new RpcException({
          code: ABORTED_STATUS,
          message: GENERATION_LEASE_LOST_MESSAGE,
        }),
      ),
    ).toBe(true);
    expect(
      isGenerationLeaseLostError(
        new RpcException({ code: ABORTED_STATUS, message: 'another abort' }),
      ),
    ).toBe(false);
  });

  it('treats a lazy lease-loss as a safe cancellation instead of a failure', async () => {
    const service = new GenerationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const generateWithLease = jest
      .spyOn(
        service as unknown as {
          generateWithLease: (request: unknown) => Promise<null>;
        },
        'generateWithLease',
      )
      .mockRejectedValue(
        new RpcException({
          code: ABORTED_STATUS,
          message: GENERATION_LEASE_LOST_MESSAGE,
        }),
      );
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      service.tryLazyGenerateGlobal('listen-now', 'en-GB', '+07:00', 'web'),
    ).resolves.toBeNull();

    expect(generateWithLease).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(
      '[generation] lazy global refresh canceled after lease ownership changed',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('releases a generation lease only after the generation settles', async () => {
    const lease = { leaseKey: 'home-key', leaseToken: 'lease-token' };
    const release = jest.fn().mockResolvedValue(undefined);
    const service = new GenerationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        acquire: jest.fn().mockResolvedValue(lease),
        renew: jest.fn(),
        isHeld: jest.fn(),
        release,
        renewIntervalMs: 60_000,
      } as never,
      {} as never,
    );
    const internals = service as unknown as {
      generateGlobal: jest.Mock;
      generateWithLease: (request: unknown) => Promise<unknown>;
    };
    let resolveGeneration: (value: unknown) => void = () => undefined;
    const generation = new Promise<unknown>((resolve) => {
      resolveGeneration = resolve;
    });
    internals.generateGlobal = jest.fn().mockReturnValue(generation);

    const pending = internals.generateWithLease({});
    await Promise.resolve();

    expect(release).not.toHaveBeenCalled();

    resolveGeneration({});
    await pending;

    expect(release).toHaveBeenCalledWith(lease);
  });
});

describe('GenerationService Top Picks composition', () => {
  const createService = () =>
    new GenerationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  const topPicksSection = (albumIds: string[]) =>
    ({
      id: 'user-top-picks',
      attributes: { resourceTypes: ['albums'] },
      relationships: {
        contents: {
          href: '',
          data: albumIds.map((id) => ({ id, type: 'albums', href: '' })),
        },
      },
    }) as never;

  it('places Listen Again before the selected New Release albums', () => {
    const service = createService();
    const internals = service as unknown as {
      composeRankedTopPicks: (
        section: unknown,
        items: Array<{ id: string; type: 'albums' | 'playlists' | 'stations' }>,
        listenAgainAlbumId: string,
      ) => {
        attributes: { listenAgainAlbumId?: string };
        relationships: { contents: { data: Array<{ id: string }> } };
      };
    };

    const result = internals.composeRankedTopPicks(
      topPicksSection(['ranked-1', 'ranked-2']),
      [
        { id: 'station-1', type: 'stations' },
        { id: 'playlist-1', type: 'playlists' },
        { id: 'listen-again-1', type: 'albums' },
        { id: 'release-1', type: 'albums' },
        { id: 'release-2', type: 'albums' },
        { id: 'release-3', type: 'albums' },
      ],
      'listen-again-1',
    );

    expect(result.relationships.contents.data.map((item) => item.id)).toEqual([
      'station-1',
      'playlist-1',
      'listen-again-1',
      'release-1',
      'release-2',
      'release-3',
    ]);
    expect(result.attributes.listenAgainAlbumId).toBe('listen-again-1');
  });

  it('uses the supplied Global Top Picks ranking without prepending a card type', () => {
    const service = createService();
    const internals = service as unknown as {
      composeGlobalTopPicks: (
        section: unknown,
        items: Array<{ id: string; type: 'albums' | 'playlists' | 'stations' }>,
      ) => { relationships: { contents: { data: Array<{ id: string }> } } };
    };

    const result = internals.composeGlobalTopPicks(
      topPicksSection(['editorial-1', 'editorial-2']),
      [
        { id: 'editorial-2', type: 'albums' },
        { id: 'playlist-1', type: 'playlists' },
        { id: 'editorial-1', type: 'albums' },
      ],
    );

    expect(result.relationships.contents.data.map((item) => item.id)).toEqual([
      'editorial-2',
      'playlist-1',
      'editorial-1',
    ]);
  });
});

describe('GenerationService Top Picks ranking', () => {
  it('ranks Listen Again, fresh releases, and refreshed playlists above lower-relevance stations', async () => {
    const now = Date.now();
    const service = new GenerationService(
      {
        recommendationResourceSnapshot: {
          findMany: jest.fn().mockResolvedValue([
            {
              resourceId: 'release-1',
              releaseDate: new Date(now).toISOString(),
            },
          ]),
        },
        systemPlaylistRefreshState: {
          findMany: jest.fn().mockResolvedValue([
            { refreshedAt: new Date(now) },
          ]),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      rankUserTopPickItems: (input: unknown) => Promise<Array<{ id: string }>>;
    };

    const result = await internals.rankUserTopPickItems({
      systemPlaylist: {
        id: 'playlist-1',
        type: 'playlists',
        refreshedAt: new Date(now),
      },
      moodStation: undefined,
      personalizedStations: [{ id: 'personal-1', type: 'stations' }],
      artistStations: [],
      listenAgainAlbum: {
        id: 'listen-again-1',
        type: 'albums',
        lastPlayedAt: new Date(now - 31 * 86_400_000),
      },
      newReleaseAlbums: [{ id: 'release-1', type: 'albums' }],
    });

    expect(result.map((item) => item.id)).toEqual([
      'listen-again-1',
      'release-1',
      'playlist-1',
      'personal-1',
    ]);
  });
});
