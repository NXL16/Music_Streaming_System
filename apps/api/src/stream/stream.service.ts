import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class StreamService {
  constructor(private readonly config: ConfigService) {}

  getStreamUrl(songId: string): { url: string } {
    const url = this.createSignedUrl(songId);
    return { url };
  }

  private createSignedUrl(songId: string): string {
    const cdnUrl = this.config.getOrThrow<string>('CDN_URL');
    const signingKey = this.config.getOrThrow<string>('CDN_SIGNING_KEY');
    const exp = Math.floor(Date.now() / 1000) + 86400;

    const payload = `${songId}~exp=${exp}`;
    const hmac = createHmac('sha256', signingKey).update(payload).digest('hex');

    return `${cdnUrl}/audio/${songId}?__token__=exp=${exp}~hmac=${hmac}`;
  }
}
