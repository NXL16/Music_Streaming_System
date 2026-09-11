import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

const VIDEO_MANIFEST_PATH =
  /^\/processed\/(?<assetId>[0-9a-f-]{36})\/video\/(?<generation>[0-9a-f-]{36})\/default\.m3u8$/i;
// Segment URLs must outlive a normal VOD session, including pauses and a
// temporarily poor connection. They do not grant decryption: the HLS key is
// still served only by the authenticated API endpoint.
const SESSION_TTL_SECONDS = 2 * 60 * 60;

/** Creates a short-lived, edge-cacheable URL for one generated HLS video. */
@Injectable()
export class MusicVideoCdnService {
  private readonly cdnUrl: string;
  private readonly signingSecret: string;

  constructor(config: ConfigService) {
    this.cdnUrl = config
      .getOrThrow<string>('STREAM_WORKER_URL')
      .replace(/\/+$/, '');
    this.signingSecret = config.getOrThrow<string>('VIDEO_CDN_SIGNING_SECRET');
  }

  createManifestUrl(assetId: string, originManifestUrl: string): string {
    let pathname: string;
    try {
      pathname = new URL(originManifestUrl).pathname;
    } catch {
      throw new ServiceUnavailableException('MUSIC_VIDEO_MANIFEST_UNAVAILABLE');
    }

    const match = VIDEO_MANIFEST_PATH.exec(pathname);
    if (
      !match?.groups ||
      match.groups.assetId.toLowerCase() !== assetId.toLowerCase()
    ) {
      throw new ServiceUnavailableException('MUSIC_VIDEO_MANIFEST_UNAVAILABLE');
    }

    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const signature = this.signature(
      match.groups.assetId,
      match.groups.generation,
      expiresAt,
    );
    const url = new URL(`/video${pathname}`, `${this.cdnUrl}/`);
    url.searchParams.set('expires', String(expiresAt));
    url.searchParams.set('signature', signature);
    return url.toString();
  }

  private signature(
    assetId: string,
    generation: string,
    expiresAt: number,
  ): string {
    return createHmac('sha256', this.signingSecret)
      .update(
        `${assetId.toLowerCase()}\n${generation.toLowerCase()}\n${expiresAt}`,
      )
      .digest('base64url');
  }
}
