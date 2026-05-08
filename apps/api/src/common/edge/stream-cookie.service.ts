import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

type StreamCookiePayload = {
  songId: string;
  objectKey: string;
  exp: number;
};

type StreamCookieResult = {
  cookieName: string;
  cookieValue: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict';
    path: string;
    maxAge: number;
    domain?: string;
  };
  streamUrl: string;
  expiresAt: number;
};

@Injectable()
export class StreamCookieService {
  private readonly cookieName: string;
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly maxAgeSeconds: number;
  private readonly cookieDomain?: string;

  constructor(config: ConfigService) {
    this.cookieName = config.get<string>('EDGE_COOKIE_NAME') || 'stream_auth';
    this.baseUrl = config.getOrThrow<string>('EDGE_STREAM_BASE_URL');
    this.secret = config.getOrThrow<string>('EDGE_COOKIE_SECRET');
    this.maxAgeSeconds = Number(
      config.get<string>('EDGE_COOKIE_MAX_AGE_SECONDS') || '3600',
    );
    this.cookieDomain = config.get<string>('EDGE_COOKIE_DOMAIN') || undefined;
  }

  create(songId: string, objectKey: string): StreamCookieResult {
    const expiresAt = Math.floor(Date.now() / 1000) + this.maxAgeSeconds;
    const payload: StreamCookiePayload = {
      songId,
      objectKey,
      exp: expiresAt,
    };

    const payloadValue = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret)
      .update(payloadValue)
      .digest('base64url');

    return {
      cookieName: this.cookieName,
      cookieValue: `${payloadValue}.${signature}`,
      cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/stream',
        maxAge: this.maxAgeSeconds * 1000,
        domain: this.cookieDomain,
      },
      streamUrl: `${this.baseUrl.replace(/\/$/, '')}/stream/${songId}`,
      expiresAt,
    };
  }
}