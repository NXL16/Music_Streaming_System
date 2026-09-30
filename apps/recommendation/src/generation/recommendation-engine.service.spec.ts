import { RecommendationEngineService } from './recommendation-engine.service';
import { PRODUCTION_RECOMMENDATION_POLICY as policy } from './production-recommendation-policy';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../listening/listening.service', () => ({
  ListeningService: class ListeningService {},
}));
jest.mock('../recommendations/recommendation-catalog.service', () => ({
  RecommendationCatalogService: class RecommendationCatalogService {},
}));
jest.mock('../vector/qdrant-audio-vector.service', () => ({
  QdrantAudioVectorService: class QdrantAudioVectorService {},
}));

describe('RecommendationEngineService candidate retrieval', () => {
  it('keeps a bounded, priority-ordered union of retrieval sources', () => {
    const service = new RecommendationEngineService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      candidateIds: (...sources: Array<readonly string[]>) => string[];
    };
    const affinity = ['affinity-1', 'shared'];
    const collaborative = ['collaborative-1', 'shared'];
    const remaining = Array.from(
      { length: policy.candidatePoolLimit },
      (_, index) => `candidate-${index}`,
    );

    const ids = internals.candidateIds(affinity, collaborative, remaining);

    expect(ids).toHaveLength(policy.candidatePoolLimit);
    expect(ids.slice(0, 3)).toEqual([
      'affinity-1',
      'shared',
      'collaborative-1',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('scores popularity from recent qualified events instead of lifetime counters', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      { albumId: 'completed', plays: 10n, completions: 10n, skips: 0n },
      { albumId: 'skipped', plays: 10n, completions: 0n, skips: 10n },
    ]);
    const service = new RecommendationEngineService(
      { $queryRaw: queryRaw } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      popularAlbumScores: () => Promise<Map<string, number>>;
    };

    const scores = await internals.popularAlbumScores();

    expect(scores.get('completed')).toBe(1);
    expect(scores.get('skipped')).toBeLessThan(0.2);
    const [strings] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('')).toContain('FROM "listening_events"');
    expect(strings.join('')).toContain('"createdAt" >= ');
    expect(strings.join('')).toContain("'PLAY_COMPLETE'");
  });

  it('allows a genre shelf to fill its twelve-card preview', () => {
    const service = new RecommendationEngineService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      allocateGlobal: (
        candidates: unknown[],
        allocated: Set<string>,
        previewLimit: number,
        detailLimit: number,
        minimumPreviewItems: number,
        limits: { maxPerGenre?: number },
      ) => Array<{ id: string }>;
    };
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      id: `album-${index}`,
      artistName: `artist-${index}`,
      genreNames: ['Pop'],
    }));

    const selected = internals.allocateGlobal(
      candidates,
      new Set(),
      12,
      48,
      12,
      { maxPerGenre: Number.POSITIVE_INFINITY },
    );

    expect(selected).toHaveLength(12);
  });

  it('does not reserve detail overflow from the next Global preview', () => {
    const service = new RecommendationEngineService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      allocateGlobal: (
        candidates: unknown[],
        allocated: Set<string>,
        previewLimit: number,
        detailLimit: number,
        minimumPreviewItems: number,
        limits: Record<string, never>,
      ) => Array<{ id: string }>;
    };
    const candidates = Array.from({ length: 24 }, (_, index) => ({
      id: `album-${index}`,
      artistName: `artist-${index}`,
      genreNames: [`Genre-${index}`],
    }));
    const previewAllocated = new Set<string>();

    const firstShelf = internals.allocateGlobal(
      candidates,
      previewAllocated,
      12,
      48,
      12,
      {},
    );
    const secondShelf = internals.allocateGlobal(
      candidates,
      previewAllocated,
      12,
      48,
      12,
      {},
    );

    expect(firstShelf).toHaveLength(24);
    expect(secondShelf).toHaveLength(24);
    expect(secondShelf.slice(0, 12).map((item) => item.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `album-${index + 12}`),
    );
    expect(previewAllocated.size).toBe(24);
  });

  it('keeps only same-genre new releases in release-date order', () => {
    const service = new RecommendationEngineService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      generateNewReleasesShelf: (candidates: unknown[]) => {
        items: Array<{ id: string }>;
      } | null;
    };
    const candidate = (id: string, releaseDate: string, overrides = {}) => ({
      id,
      releaseDate,
      freshness: 1,
      artistAffinity: 0,
      genreAffinity: 1,
      contentSimilarity: 0,
      audioSimilarity: 0,
      collaborative: 0,
      ...overrides,
    });

    const shelf = internals.generateNewReleasesShelf([
      candidate('relevant-today', '2026-09-29'),
      candidate('unrelated-today', '2026-09-29', { genreAffinity: 0 }),
      candidate('artist-only', '2026-09-29', {
        genreAffinity: 0,
        artistAffinity: 1,
      }),
      candidate('relevant-yesterday', '2026-09-28'),
      candidate('old-relevant', '2026-01-01', { freshness: 0 }),
    ]);

    expect(shelf?.items.map((item) => item.id)).toEqual([
      'relevant-today',
      'relevant-yesterday',
    ]);
  });
});
