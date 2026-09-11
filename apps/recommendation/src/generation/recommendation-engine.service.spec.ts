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
});
