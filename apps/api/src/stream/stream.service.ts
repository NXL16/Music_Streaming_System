import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hkdf } from 'crypto';
import { promisify } from 'util';

const KEY_INFO = 'music-stream:v1:key';
const IV_INFO = 'music-stream:v1:iv';
const KEY_LEN = 32;
const IV_LEN = 16;

// Async HKDF (callback-based) wrapped in a Promise so key derivation runs off
// the event loop instead of blocking it like hkdfSync did.
const hkdfAsync = promisify(hkdf);

@Injectable()
export class StreamService {
  private readonly masterSecret: Buffer;
  private readonly streamWorkerUrl: string;
  private readonly keyCache = new Map<string, { key: string; iv: string }>();
  private static readonly MAX_CACHE_SIZE = 10_000;

  constructor(private readonly config: ConfigService) {
    this.masterSecret = Buffer.from(
      this.config.getOrThrow<string>('MASTER_SECRET_KEY'),
      'hex',
    );
    this.streamWorkerUrl = this.config
      .getOrThrow<string>('STREAM_WORKER_URL')
      .replace(/\/+$/, '');
  }

  async getStreamUrl(songId: string): Promise<{
    streamUrl: string;
    key: string;
    iv: string;
  }> {
    const streamUrl = `${this.streamWorkerUrl}/${encodeURIComponent(songId)}`;
    const cached = this.keyCache.get(songId);
    if (cached) return { streamUrl, ...cached };

    const salt = Buffer.from(songId, 'utf-8');
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
    this.keyCache.set(songId, derived);

    return { streamUrl, ...derived };
  }
}
