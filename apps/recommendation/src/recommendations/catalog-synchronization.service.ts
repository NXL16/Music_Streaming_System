import { Injectable, Logger } from '@nestjs/common';
import { RecommendationCatalogService } from './recommendation-catalog.service';
import { RecommendationsService } from './recommendations.service';

const RESOURCE_TYPES = ['albums', 'songs', 'artists', 'playlists'] as const;
const PAGE_SIZE = 100;
const MIN_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

function homeCacheDisabled(): boolean {
  return process.env.HOME_CACHE_MODE?.trim().toLowerCase() === 'off';
}

export type CatalogSynchronizationResult = {
  totalResources: number;
  resourcesByType: Record<string, number>;
  synchronizedAt: Date;
};

@Injectable()
export class CatalogSynchronizationService {
  private readonly logger = new Logger(CatalogSynchronizationService.name);
  private inFlight: Promise<CatalogSynchronizationResult> | null = null;
  private lastResult: CatalogSynchronizationResult | null = null;

  constructor(
    private readonly catalogService: RecommendationCatalogService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  async ensureFreshCatalog(): Promise<CatalogSynchronizationResult> {
    // Development can demand immediate catalog correctness after imports or
    // backfills. Production retains the six-hour guard unless explicitly off.
    if (homeCacheDisabled()) {
      return this.synchronizeCatalog();
    }
    if (
      this.lastResult &&
      Date.now() - this.lastResult.synchronizedAt.getTime() < MIN_SYNC_INTERVAL_MS
    ) {
      return this.lastResult;
    }

    return this.synchronizeCatalog();
  }

  async synchronizeCatalog(
    storefront = 'vn',
  ): Promise<CatalogSynchronizationResult> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.runSynchronization(storefront).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runSynchronization(
    storefront: string,
  ): Promise<CatalogSynchronizationResult> {
    const resourcesByType: Record<string, number> = {};

    for (const resourceType of RESOURCE_TYPES) {
      let cursor = '';
      let synced = 0;

      do {
        const page = await this.catalogService.browsePage(
          resourceType,
          PAGE_SIZE,
          'sync',
          storefront,
          cursor,
        );

        synced += await this.recommendationsService.upsertCatalogResources(
          page.resources,
        );
        cursor = page.nextCursor;

        if (page.hasMore && !cursor) {
          throw new Error(
            `Catalog ${resourceType} page reported more data without a cursor`,
          );
        }

        if (!page.resources.length && page.hasMore) {
          throw new Error(
            `Catalog ${resourceType} page is empty before the final cursor`,
          );
        }
      } while (cursor);

      resourcesByType[resourceType] = synced;
    }

    const result = {
      totalResources: Object.values(resourcesByType).reduce(
        (total, count) => total + count,
        0,
      ),
      resourcesByType,
      synchronizedAt: new Date(),
    };
    this.lastResult = result;
    this.logger.log(
      `Synchronized ${result.totalResources} catalog resources from ${storefront}`,
    );
    return result;
  }
}
