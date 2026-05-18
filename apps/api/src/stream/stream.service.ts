import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class StreamService {
  private readonly prewarmCooldownMs = 2_000;
  private readonly lastPrewarmAt = new Map<string, number>();
  private readonly inFlightPrewarm = new Set<string>();

  constructor(private readonly config: ConfigService) {}

  getStreamUrl(songId: string): { url: string } {
    const url = this.createSignedUrl(songId);
    this.prewarmFirstChunk(url);
    return { url };
  }

  private createSignedUrl(songId: string): string {
    const cdnUrl = this.config.getOrThrow<string>('CDN_URL');
    const signingKey = this.config.getOrThrow<string>('MASTER_SIGNING_KEY');
    const ttlSec = Number(this.config.getOrThrow<string>('STREAM_URL_TTL_SEC'));
    const exp = Math.floor(Date.now() / 1000) + ttlSec;

    const payload = `${songId}~exp=${exp}`;
    const hmac = createHmac('sha256', signingKey).update(payload).digest('hex');

    return `${cdnUrl}/audio/${songId}?__token__=exp=${exp}~hmac=${hmac}`;
  }

  private prewarmFirstChunk(url: string): void {
    const enabled =
      (this.config.get<string>('STREAM_PREWARM_ENABLED') ?? 'true').toLowerCase() !== 'false';
    if (!enabled) return;
    if (!this.shouldPrewarm(url)) return;

    const timeoutMs = Number(this.config.get<string>('STREAM_PREWARM_TIMEOUT_MS') ?? '1000');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 1500);

    void fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-98303' },
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        this.inFlightPrewarm.delete(url);
      });
  }

  private shouldPrewarm(url: string): boolean {
    const now = Date.now();
    const lastAt = this.lastPrewarmAt.get(url) ?? 0;
    if (now - lastAt < this.prewarmCooldownMs) return false;
    if (this.inFlightPrewarm.has(url)) return false;
    this.lastPrewarmAt.set(url, now);
    this.inFlightPrewarm.add(url);

    if (this.lastPrewarmAt.size > 5000) {
      const oldestKey = this.lastPrewarmAt.keys().next().value;
      if (oldestKey) this.lastPrewarmAt.delete(oldestKey);
    }
    return true;
  }
}
