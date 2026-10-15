import { Injectable, Logger } from '@nestjs/common';
import { developmentCacheDisabled } from '../common/configs/development-cache';
import { RecommendationCatalogService } from './recommendation-catalog.service';
import { RecommendationsService } from './recommendations.service';
import { AudioVectorSynchronizationService } from '../vector/audio-vector-synchronization.service';
import { PrismaService } from '../database/prisma.service';

const RESOURCE_TYPES = ['albums', 'songs', 'artists', 'playlists'] as const;
const PAGE_SIZE = 100;
const MIN_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CATALOG_ARTIST_HREF_PREFIX = '/catalog/';

export type CatalogSynchronizationResult = {
  totalResources: number;
  resourcesByType: Record<string, number>;
  prunedArtistSnapshots: number;
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
    private readonly audioVectorSynchronizationService: AudioVectorSynchronizationService,
    private readonly prisma: PrismaService,
  ) {}

  async ensureFreshCatalog(): Promise<CatalogSynchronizationResult> {
    // Development can demand immediate catalog correctness after imports or
    // backfills. Production retains the six-hour guard unless explicitly off.
    if (developmentCacheDisabled()) {
      return this.synchronizeCatalog();
    }
    if (
      this.lastResult &&
      Date.now() - this.lastResult.synchronizedAt.getTime() <
        MIN_SYNC_INTERVAL_MS
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
    let prunedArtistSnapshots = 0;

    for (const resourceType of RESOURCE_TYPES) {
      let cursor = '';
      let synced = 0;
      const catalogResourceIds = new Set<string>();

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
        for (const resource of page.resources) {
          if (resource.type === resourceType && resource.id) {
            catalogResourceIds.add(resource.id);
          }
        }
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
      if (resourceType === 'artists') {
        prunedArtistSnapshots = await this.pruneStaleArtistSnapshots(
          storefront,
          catalogResourceIds,
        );
      }
    }

    const result = {
      totalResources: Object.values(resourcesByType).reduce(
        (total, count) => total + count,
        0,
      ),
      resourcesByType,
      prunedArtistSnapshots,
      synchronizedAt: new Date(),
    };
    try {
      await this.audioVectorSynchronizationService.ensureFreshIndex();
    } catch (error) {
      // Vector search is additive. Catalog/Home must remain available while an
      // external Qdrant deployment is starting or temporarily unavailable.
      this.logger.warn(
        `Audio vector index synchronization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.lastResult = result;
    this.logger.log(
      `Synchronized ${result.totalResources} catalog resources from ${storefront}; pruned ${prunedArtistSnapshots} stale artist snapshot(s)`,
    );
    return result;
  }

  /**
   * Catalog sync used to be append-only, leaving renamed, merged, or removed
   * artists in the read model. Artist Stations require exact relationship IDs,
   * so these orphan snapshots must not survive a complete artist sync.
   */
  private async pruneStaleArtistSnapshots(
    storefront: string,
    canonicalArtistIds: ReadonlySet<string>,
  ): Promise<number> {
    // Do not prune after an empty response: it may be a transient upstream
    // failure represented as an empty final page.
    if (canonicalArtistIds.size === 0) return 0;

    const staleArtists =
      await this.prisma.recommendationResourceSnapshot.findMany({
        where: {
          resourceType: 'artists',
          href: {
            contains: `${CATALOG_ARTIST_HREF_PREFIX}${storefront}/artists/`,
          },
          resourceId: { notIn: [...canonicalArtistIds] },
        },
        select: { resourceId: true },
      });
    if (!staleArtists.length) return 0;

    const staleArtistIds = staleArtists.map((artist) => artist.resourceId);
    await this.prisma.$transaction([
      this.prisma.recommendationPageResource.deleteMany({
        where: { resourceType: 'artists', resourceId: { in: staleArtistIds } },
      }),
      this.prisma.recommendationSectionItem.deleteMany({
        where: { resourceType: 'artists', resourceId: { in: staleArtistIds } },
      }),
      this.prisma.recommendationResourceSnapshot.deleteMany({
        where: { resourceType: 'artists', resourceId: { in: staleArtistIds } },
      }),
    ]);
    return staleArtistIds.length;
  }
}
