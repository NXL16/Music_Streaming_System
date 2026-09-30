import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  AudioVectorPoint,
  QdrantAudioVectorService,
} from './qdrant-audio-vector.service';
import { RecommendationCatalogService } from '../recommendations/recommendation-catalog.service';

const INDEX_STATE_ID = 'catalog-song-audio-vectors';
const PAGE_SIZE = 100;
const INCREMENTAL_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const FULL_RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AudioVectorSynchronizationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AudioVectorSynchronizationService.name);
  private inFlight: Promise<number> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: RecommendationCatalogService,
    private readonly qdrant: QdrantAudioVectorService,
  ) {}

  onApplicationBootstrap(): void {
    // A warm Home cache may defer catalog synchronization for hours. Start the
    // derived index independently so enabling Qdrant takes effect immediately
    // after a deployment, without blocking application readiness.
    this.startInitialSynchronization();
    if (this.qdrant.isEnabled()) {
      this.syncTimer = setInterval(() => {
        void this.ensureFreshIndex().catch((error: unknown) => {
          this.logger.warn(
            `Incremental audio vector synchronization failed: ${this.errorMessage(error)}`,
          );
        });
      }, INCREMENTAL_SYNC_INTERVAL_MS);
    }
  }

  onModuleDestroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  async ensureFreshIndex(): Promise<number> {
    if (!this.qdrant.isEnabled()) return 0;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.synchronize().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async synchronize(): Promise<number> {
    const collectionWasCreated = await this.qdrant.ensureCollection();
    const state = await this.prisma.audioVectorIndexState.upsert({
      where: { id: INDEX_STATE_ID },
      update: {},
      create: {
        id: INDEX_STATE_ID,
        collectionName: this.qdrant.collectionName,
      },
    });
    const fullReconciliation =
      collectionWasCreated ||
      state.collectionName !== this.qdrant.collectionName ||
      !state.cursor ||
      !state.synchronizedAt ||
      Date.now() - state.synchronizedAt.getTime() >=
        FULL_RECONCILIATION_INTERVAL_MS;
    const cursor = fullReconciliation ? '' : state.cursor;
    let nextCursor = cursor;
    let indexed = 0;
    const authoritativeSongIds = new Set<string>();

    do {
      const page = await this.catalogService.browseAudioAnalysisPage(
        nextCursor,
        PAGE_SIZE,
      );
      const points = page.songs.map((song): AudioVectorPoint => ({
        songId: song.songId,
        embedding: song.audioEmbedding,
        payload: {
          albumId: song.albumId,
          artistIds: song.artistIds,
          genreNames: song.genreNames,
          audioTags: song.audioTags,
          storefront: song.storefront,
          analysisVersion: song.analysisVersion,
          bpm: song.audioBpm,
          energy: song.audioEnergy,
          analyzedAt: song.analyzedAt,
        },
      }));
      await this.qdrant.upsert(points);
      for (const point of points) authoritativeSongIds.add(point.songId);
      indexed += points.length;
      nextCursor = page.nextCursor;

      if (page.hasMore && !nextCursor) {
        throw new Error(
          'Song audio analysis feed reported more data without a cursor',
        );
      }
      if (!page.songs.length && page.hasMore) {
        throw new Error(
          'Song audio analysis feed returned an empty non-final page',
        );
      }
      if (!page.hasMore) break;
    } while (nextCursor);

    const pruned = fullReconciliation
      ? await this.qdrant.pruneExcept(authoritativeSongIds)
      : 0;

    await this.prisma.audioVectorIndexState.upsert({
      where: { id: INDEX_STATE_ID },
      update: {
        collectionName: this.qdrant.collectionName,
        cursor: nextCursor || cursor,
        synchronizedAt: new Date(),
      },
      create: {
        id: INDEX_STATE_ID,
        collectionName: this.qdrant.collectionName,
        cursor: nextCursor || cursor,
        synchronizedAt: new Date(),
      },
    });
    if (indexed > 0 || pruned > 0)
      this.logger.log(
        `Indexed ${indexed} audio vector(s); pruned ${pruned} stale vector(s) in Qdrant`,
      );
    return indexed;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private startInitialSynchronization(): void {
    void this.ensureFreshIndex().catch((error: unknown) => {
      this.logger.warn(
        `Initial audio vector index synchronization failed: ${this.errorMessage(error)}; retrying in 15s`,
      );
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.startInitialSynchronization();
      }, 15_000);
    });
  }
}
