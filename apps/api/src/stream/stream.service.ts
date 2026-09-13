import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hkdf } from 'crypto';
import { promisify } from 'util';
import { MetadataService } from '../metadata/metadata.service';
import { status } from '@grpc/grpc-js';

const KEY_INFO = 'music-stream:v1:key';
const IV_INFO = 'music-stream:v1:iv';
const KEY_LEN = 32;
const IV_LEN = 16;

class HighRenditionUnavailableError extends Error {
  readonly code = status.NOT_FOUND;

  constructor() {
    super('High-quality playback is not available');
  }
}

// Async HKDF (callback-based) wrapped in a Promise so key derivation runs off
// the event loop instead of blocking it like hkdfSync did.
const hkdfAsync = promisify(hkdf);

@Injectable()
export class StreamService {
  private readonly masterSecret: Buffer;
  private readonly streamWorkerUrl: string;
  private readonly keyCache = new Map<string, { key: string; iv: string }>();
  private static readonly MAX_CACHE_SIZE = 10_000;

  constructor(
    private readonly config: ConfigService,
    private readonly metadata: MetadataService,
  ) {
    this.masterSecret = Buffer.from(
      this.config.getOrThrow<string>('MASTER_SECRET_KEY'),
      'hex',
    );
    this.streamWorkerUrl = this.config
      .getOrThrow<string>('STREAM_WORKER_URL')
      .replace(/\/+$/, '');
  }

  async getStreamUrl(
    songId: string,
    variant = '',
  ): Promise<{
    streamUrl: string;
    key: string;
    iv: string;
  }> {
    const normalizedVariant = normalizeVariant(variant);
    const streamUrl = normalizedVariant
      ? `${this.streamWorkerUrl}/${encodeURIComponent(songId)}/${normalizedVariant}`
      : `${this.streamWorkerUrl}/${encodeURIComponent(songId)}`;
    const cacheKey = `${songId}:${normalizedVariant}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached) return { streamUrl, ...cached };

    // Preserve the legacy single-stream derivation. Stem variants use a
    // distinct asset id, preventing AES-CTR key/IV reuse between stems.
    const salt = Buffer.from(
      normalizedVariant ? `${songId}:${normalizedVariant}` : songId,
      'utf-8',
    );
    const [key, iv] = await Promise.all([
      hkdfAsync('sha256', this.masterSecret, salt, KEY_INFO, KEY_LEN),
      hkdfAsync('sha256', this.masterSecret, salt, IV_INFO, IV_LEN),
    ]);

    const derived = {
      key: Buffer.from(key).toString('hex'),
      iv: Buffer.from(iv).toString('hex'),
    };

    if (this.keyCache.size >= StreamService.MAX_CACHE_SIZE) {
      const firstKey = this.keyCache.keys().next().value!;
      this.keyCache.delete(firstKey);
    }
    this.keyCache.set(cacheKey, derived);

    return { streamUrl, ...derived };
  }

  async getPlaybackManifest(
    songId: string,
    audioMode: 'STANDARD' | 'SING' = 'STANDARD',
  ) {
    if (audioMode === 'STANDARD') {
      const [main, metadata] = await Promise.all([
        this.getStreamUrl(songId),
        this.metadata.getCompactStreamData(songId, '', true),
      ]);
      return {
        mode: 'STANDARD' as const,
        main: { ...main, metadata },
      };
    }

    const [instrumental, vocal, instrumentalMetadata, vocalMetadata] =
      await Promise.all([
        this.getStreamUrl(songId, 'instrumental'),
        this.getStreamUrl(songId, 'vocal'),
        this.metadata.getCompactStreamData(songId, 'instrumental', true),
        this.metadata.getCompactStreamData(songId, 'vocal', true),
      ]);

    return {
      mode: 'SING' as const,
      instrumental: { ...instrumental, metadata: instrumentalMetadata },
      vocal: { ...vocal, metadata: vocalMetadata },
    };
  }

  async getHighPlaybackManifest(
    songId: string,
    audioMode: 'STANDARD' | 'SING' = 'STANDARD',
  ) {
    if (audioMode === 'STANDARD') {
      const [stream, metadata, baselineMetadata] = await Promise.all([
        this.getStreamUrl(songId, 'high'),
        this.metadata.getCompactStreamData(songId, 'high', true),
        this.metadata.getCompactStreamData(songId, '', true),
      ]);
      this.assertHighMetadataIsCurrent(
        metadata.metadataVersion,
        baselineMetadata.metadataVersion,
      );
      return { mode: 'STANDARD' as const, high: { ...stream, metadata } };
    }

    const [
      instrumental,
      vocal,
      instrumentalMetadata,
      vocalMetadata,
      baselineInstrumentalMetadata,
      baselineVocalMetadata,
    ] = await Promise.all([
      this.getStreamUrl(songId, 'instrumental-high'),
      this.getStreamUrl(songId, 'vocal-high'),
      this.metadata.getCompactStreamData(songId, 'instrumental-high', true),
      this.metadata.getCompactStreamData(songId, 'vocal-high', true),
      this.metadata.getCompactStreamData(songId, 'instrumental', true),
      this.metadata.getCompactStreamData(songId, 'vocal', true),
    ]);
    this.assertHighMetadataIsCurrent(
      instrumentalMetadata.metadataVersion,
      baselineInstrumentalMetadata.metadataVersion,
    );
    this.assertHighMetadataIsCurrent(
      vocalMetadata.metadataVersion,
      baselineVocalMetadata.metadataVersion,
    );
    return {
      mode: 'SING' as const,
      high: {
        instrumental: { ...instrumental, metadata: instrumentalMetadata },
        vocal: { ...vocal, metadata: vocalMetadata },
      },
    };
  }

  private assertHighMetadataIsCurrent(
    highVersion: number,
    baselineVersion: number,
  ): void {
    // A lower-quality reprocess intentionally omits a high rendition. The
    // old high metadata may still exist briefly while object cleanup is
    // retried, so never expose it unless it belongs to this same transcode.
    if (highVersion !== baselineVersion) {
      throw new HighRenditionUnavailableError();
    }
  }
}

function normalizeVariant(
  value: string,
): '' | 'high' | 'instrumental' | 'vocal' | 'instrumental-high' | 'vocal-high' {
  if (!value) return '';
  if (
    value === 'high' ||
    value === 'instrumental' ||
    value === 'vocal' ||
    value === 'instrumental-high' ||
    value === 'vocal-high'
  ) {
    return value;
  }
  throw new Error('INVALID_STREAM_VARIANT');
}
