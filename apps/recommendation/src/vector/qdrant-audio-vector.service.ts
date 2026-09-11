import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const AUDIO_EMBEDDING_DIMENSION = 512;

export type AudioVectorPoint = {
  songId: string;
  embedding: number[];
  payload: {
    albumId: string;
    artistIds: string[];
    genreNames: string[];
    audioTags: string[];
    storefront: string;
    analysisVersion: string;
    bpm: number;
    energy: number;
    analyzedAt: number;
  };
};

export type AudioVectorNeighbour = {
  songId: string;
  albumId: string;
  score: number;
};

/**
 * Thin REST adapter deliberately kept independent from the ranking engine.
 * Qdrant is a rebuildable derived index, never the authoritative catalog.
 */
@Injectable()
export class QdrantAudioVectorService {
  private readonly logger = new Logger(QdrantAudioVectorService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly collectionName: string;
  private initialized = false;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('QDRANT_URL') ?? '').replace(/\/$/, '');
    this.apiKey = config.get<string>('QDRANT_API_KEY') ?? '';
    this.collectionName =
      config.get<string>('QDRANT_AUDIO_COLLECTION')?.trim() ||
      'song_audio_embeddings_v1';
  }

  isEnabled(): boolean {
    return Boolean(this.baseUrl);
  }

  /** Returns true only when this process created a fresh collection. */
  async ensureCollection(): Promise<boolean> {
    if (!this.isEnabled()) return false;
    if (this.initialized) return false;

    const existing = await fetch(
      this.url(`/collections/${this.collectionName}`),
      {
        headers: this.headers(),
      },
    );
    if (existing.ok) {
      this.initialized = true;
      await this.ensurePayloadIndexes();
      return false;
    }
    if (existing.status !== 404) {
      throw await this.requestError('read collection', existing);
    }

    const created = await fetch(
      this.url(`/collections/${this.collectionName}`),
      {
        method: 'PUT',
        headers: this.headers(true),
        body: JSON.stringify({
          vectors: { size: AUDIO_EMBEDDING_DIMENSION, distance: 'Cosine' },
        }),
      },
    );
    // Another pod may create it between the GET and PUT; either result is safe.
    if (!created.ok && created.status !== 409) {
      throw await this.requestError('create collection', created);
    }
    this.initialized = true;
    await this.ensurePayloadIndexes();
    this.logger.log(`Audio vector collection ${this.collectionName} is ready`);
    return true;
  }

  async upsert(points: AudioVectorPoint[]): Promise<void> {
    if (!this.isEnabled() || points.length === 0) return;
    await this.ensureCollection();
    for (const point of points) this.assertPoint(point);

    const response = await fetch(
      this.url(`/collections/${this.collectionName}/points?wait=true`),
      {
        method: 'PUT',
        headers: this.headers(true),
        body: JSON.stringify({
          points: points.map((point) => ({
            id: point.songId,
            vector: point.embedding,
            payload: {
              song_id: point.songId,
              album_id: point.payload.albumId,
              artist_ids: point.payload.artistIds,
              genre_names: point.payload.genreNames,
              audio_tags: point.payload.audioTags,
              storefront: point.payload.storefront,
              analysis_version: point.payload.analysisVersion,
              bpm: point.payload.bpm,
              energy: point.payload.energy,
              analyzed_at: point.payload.analyzedAt,
            },
          })),
        }),
      },
    );
    if (!response.ok)
      throw await this.requestError('upsert audio vectors', response);
  }

  async findNeighboursBySongIds(
    seedSongIds: readonly string[],
    limitPerSeed: number,
  ): Promise<AudioVectorNeighbour[]> {
    if (!this.isEnabled() || seedSongIds.length === 0) return [];
    await this.ensureCollection();
    const seeds = [...new Set(seedSongIds.filter(Boolean))].slice(0, 12);
    const vectors = await this.readVectors(seeds);
    const responses = await Promise.all(
      [...vectors.entries()].map(async ([songId, vector]) => {
        try {
          const response = await fetch(
            this.url(`/collections/${this.collectionName}/points/query`),
            {
              method: 'POST',
              headers: this.headers(true),
              body: JSON.stringify({
                query: vector,
                limit: limitPerSeed + 1,
                with_payload: ['song_id', 'album_id'],
              }),
            },
          );
          // A played song may not be analyzed yet. Ignore only that seed;
          // other analyzed seeds must still contribute recommendations.
          if (!response.ok) return [];
          const body = (await response.json()) as {
            result?: {
              points?: Array<{
                id?: string;
                score?: number;
                payload?: Record<string, unknown>;
              }>;
            };
          };
          return (body.result?.points ?? [])
            .map((point): AudioVectorNeighbour | null => {
              const candidateSongId =
                this.stringValue(point.payload?.song_id) ?? point.id ?? '';
              const albumId = this.stringValue(point.payload?.album_id) ?? '';
              const score = Number(point.score);
              if (
                !candidateSongId ||
                candidateSongId === songId ||
                !albumId ||
                !Number.isFinite(score)
              ) {
                return null;
              }
              return { songId: candidateSongId, albumId, score };
            })
            .filter((point): point is AudioVectorNeighbour => point !== null);
        } catch {
          return [];
        }
      }),
    );
    return responses.flat();
  }

  private async readVectors(
    songIds: readonly string[],
  ): Promise<Map<string, number[]>> {
    const response = await fetch(
      this.url(`/collections/${this.collectionName}/points`),
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify({
          ids: songIds,
          with_payload: false,
          with_vector: true,
        }),
      },
    );
    if (!response.ok) return new Map();
    const body = (await response.json()) as {
      result?: Array<{ id?: string; vector?: unknown }>;
    };
    const vectors = new Map<string, number[]>();
    for (const point of body.result ?? []) {
      const vector = point.vector;
      if (typeof point.id !== 'string' || !Array.isArray(vector)) continue;
      const numericVector = vector.filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value),
      );
      if (
        numericVector.length !== AUDIO_EMBEDDING_DIMENSION ||
        numericVector.length !== vector.length
      ) {
        continue;
      }
      vectors.set(point.id, numericVector);
    }
    return vectors;
  }

  private async ensurePayloadIndexes(): Promise<void> {
    await Promise.all(
      ['storefront', 'album_id', 'artist_ids', 'genre_names', 'audio_tags'].map(
        async (fieldName) => {
          const response = await fetch(
            this.url(`/collections/${this.collectionName}/index?wait=true`),
            {
              method: 'PUT',
              headers: this.headers(true),
              body: JSON.stringify({
                field_name: fieldName,
                field_schema: 'keyword',
              }),
            },
          );
          if (!response.ok && response.status !== 409) {
            throw await this.requestError(
              `create payload index ${fieldName}`,
              response,
            );
          }
        },
      ),
    );
  }

  private assertPoint(point: AudioVectorPoint): void {
    if (
      !point.songId ||
      point.embedding.length !== AUDIO_EMBEDDING_DIMENSION ||
      !point.embedding.every(Number.isFinite)
    ) {
      throw new Error(
        `Invalid ${AUDIO_EMBEDDING_DIMENSION}D audio vector for song ${point.songId}`,
      );
    }
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private headers(json = false): HeadersInit {
    return {
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
    };
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async requestError(
    action: string,
    response: Response,
  ): Promise<Error> {
    const body = (await response.text()).slice(0, 500);
    return new Error(`Qdrant ${action} failed (${response.status}): ${body}`);
  }
}
