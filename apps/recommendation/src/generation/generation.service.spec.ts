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
