import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createDecipheriv,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { SongStatus } from '@musical/shared-proto';
import { SongsService } from '../../songs/songs.service';
import { StreamService } from '../../stream/stream.service';
import { CreateRoomPlaybackTicketDto } from './dto/create-room-playback-ticket.dto';
import {
  ROOM_MEDIA_AUDIENCE,
  ROOM_MEDIA_CATALOG_LIMIT,
  ROOM_MEDIA_CONFIG,
  ROOM_MEDIA_TICKET_TTL,
} from './room-integration.constants';

const AES_BLOCK_SIZE = 16;

type PlaybackTicketClaims = {
  aud: typeof ROOM_MEDIA_AUDIENCE;
  exp: number;
  jti: string;
  roomId: string;
  songId: string;
  userId: string;
};

type ByteRange = { start: number; end?: number };
type CatalogQuery = { cursor: string; limit: number; search: string };

@Injectable()
export class RoomIntegrationService {
  constructor(
    private readonly config: ConfigService,
    private readonly songs: SongsService,
    private readonly streams: StreamService,
  ) {}

  async listCatalog({ cursor, limit, search }: CatalogQuery) {
    const catalog = await this.songs.listSongs({
      cursor: cursor.slice(0, 256),
      limit: Number.isFinite(limit)
        ? Math.min(Math.max(Math.floor(limit), 1), ROOM_MEDIA_CATALOG_LIMIT.max)
        : ROOM_MEDIA_CATALOG_LIMIT.default,
      search: search.trim().slice(0, 120),
      artist: '',
      onlyPublic: true,
      requesterUserId: '',
    });
    return catalog;
  }

  async createPlaybackTicket(dto: CreateRoomPlaybackTicketDto) {
    const songResponse = await this.songs.getSong({
      songId: dto.songId,
      requesterUserId: '',
    });
    const song = songResponse.song;
    if (
      !song ||
      !song.isPublic ||
      song.status !== SongStatus.SONG_STATUS_READY
    ) {
      throw new NotFoundException({
        code: 'ROOM_MEDIA_SONG_UNAVAILABLE',
        message: 'Bài hát không khả dụng để phát trong Room',
      });
    }

    const claims: PlaybackTicketClaims = {
      aud: ROOM_MEDIA_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + this.getTicketTtlSeconds(),
      jti: randomUUID(),
      roomId: dto.roomId,
      songId: dto.songId,
      userId: dto.userId,
    };
    const ticket = this.signTicket(claims);
    const baseUrl = this.getMediaBaseUrl();

    return {
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        durationSec: song.durationSec,
      },
      mediaUrl: `${baseUrl}/integrations/room/media/${ticket}`,
      expiresAt: claims.exp,
    };
  }

  async streamMedia(
    ticket: string,
    rangeHeader: string | undefined,
    response: Response,
  ) {
    const claims = this.verifyTicket(ticket);
    const requestedRange = this.parseRange(rangeHeader);
    const streamInfo = await this.streams.getStreamUrl(claims.songId);
    const alignedStart = requestedRange
      ? Math.floor(requestedRange.start / AES_BLOCK_SIZE) * AES_BLOCK_SIZE
      : 0;
    const upstreamRange = requestedRange
      ? `bytes=${alignedStart}-${requestedRange.end ?? ''}`
      : undefined;

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(streamInfo.streamUrl, {
        headers: upstreamRange ? { Range: upstreamRange } : undefined,
      });
    } catch {
      throw new BadGatewayException({
        code: 'ROOM_MEDIA_UPSTREAM_UNAVAILABLE',
        message: 'Không thể kết nối stream service',
      });
    }

    if (!upstream.ok || !upstream.body) {
      throw new BadGatewayException({
        code: 'ROOM_MEDIA_UPSTREAM_FAILED',
        message: 'Stream service từ chối bài hát',
      });
    }

    const totalSize = this.getTotalSize(upstream, requestedRange);
    const actualStart = requestedRange?.start ?? 0;
    const actualEnd =
      requestedRange?.end ?? (totalSize ? totalSize - 1 : undefined);
    const skipBytes = actualStart - alignedStart;

    response.status(requestedRange ? 206 : 200);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'audio/mp4',
    );
    if (actualEnd !== undefined) {
      response.setHeader('Content-Length', String(actualEnd - actualStart + 1));
    }
    if (requestedRange && totalSize) {
      response.setHeader(
        'Content-Range',
        `bytes ${actualStart}-${actualEnd}/${totalSize}`,
      );
    }

    const decipher = createDecipheriv(
      'aes-256-ctr',
      Buffer.from(streamInfo.key, 'hex'),
      incrementCounter(
        Buffer.from(streamInfo.iv, 'hex'),
        alignedStart / AES_BLOCK_SIZE,
      ),
    );
    const skip = new SkipBytesTransform(skipBytes);

    try {
      await pipeline(
        Readable.fromWeb(upstream.body as never),
        decipher,
        skip,
        response,
      );
    } catch (error) {
      if (!response.headersSent) {
        throw error;
      }
      response.destroy(error instanceof Error ? error : undefined);
    }
  }

  private signTicket(claims: PlaybackTicketClaims) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', this.getTicketSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyTicket(ticket: string): PlaybackTicketClaims {
    const [payload, signature, ...extra] = ticket.split('.');
    if (!payload || !signature || extra.length > 0) {
      throw new UnauthorizedException('ROOM_MEDIA_TICKET_INVALID');
    }
    const expected = createHmac('sha256', this.getTicketSecret())
      .update(payload)
      .digest('base64url');
    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('ROOM_MEDIA_TICKET_INVALID');
    }

    let parsedClaims: unknown;
    try {
      parsedClaims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as unknown;
    } catch {
      throw new UnauthorizedException('ROOM_MEDIA_TICKET_INVALID');
    }
    if (!isPlaybackTicketClaims(parsedClaims)) {
      throw new UnauthorizedException('ROOM_MEDIA_TICKET_INVALID');
    }
    const claims = parsedClaims;
    if (claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('ROOM_MEDIA_TICKET_EXPIRED');
    }
    return claims;
  }

  private getTicketSecret() {
    const secret = this.config
      .get<string>(ROOM_MEDIA_CONFIG.ticketSecret)
      ?.trim();
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('ROOM_MEDIA_NOT_CONFIGURED');
    }
    return secret;
  }

  private getMediaBaseUrl() {
    const url = this.config
      .get<string>(ROOM_MEDIA_CONFIG.publicBaseUrl)
      ?.trim();
    if (!url) {
      throw new ServiceUnavailableException('ROOM_MEDIA_NOT_CONFIGURED');
    }
    return url.replace(/\/+$/, '');
  }

  private getTicketTtlSeconds() {
    const rawValue = this.config.get<string>(
      ROOM_MEDIA_CONFIG.ticketTtlSeconds,
      String(ROOM_MEDIA_TICKET_TTL.defaultSeconds),
    );
    const ttl = Number(rawValue);
    if (
      !Number.isInteger(ttl) ||
      ttl < ROOM_MEDIA_TICKET_TTL.minSeconds ||
      ttl > ROOM_MEDIA_TICKET_TTL.maxSeconds
    ) {
      throw new ServiceUnavailableException('ROOM_MEDIA_NOT_CONFIGURED');
    }
    return ttl;
  }

  private parseRange(value: string | undefined): ByteRange | undefined {
    if (!value) return undefined;
    const match = /^bytes=(\d+)-(\d*)$/.exec(value.trim());
    if (!match) throw new BadRequestException('RANGE_NOT_SUPPORTED');
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : undefined;
    if (
      !Number.isSafeInteger(start) ||
      (end !== undefined && (!Number.isSafeInteger(end) || end < start))
    ) {
      throw new BadRequestException('RANGE_NOT_SUPPORTED');
    }
    return { start, end };
  }

  private getTotalSize(
    upstream: globalThis.Response,
    range: ByteRange | undefined,
  ) {
    const contentRange = upstream.headers.get('content-range');
    const match = contentRange ? /\/(\d+)$/.exec(contentRange) : undefined;
    if (match) return Number(match[1]);
    if (!range) {
      const contentLength = Number(upstream.headers.get('content-length'));
      return Number.isSafeInteger(contentLength) ? contentLength : undefined;
    }
    return undefined;
  }
}

class SkipBytesTransform extends Transform {
  private remaining: number;

  constructor(bytes: number) {
    super();
    this.remaining = bytes;
  }

  override _transform(
    chunk: Buffer,
    _: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ) {
    if (this.remaining === 0) {
      callback(null, chunk);
      return;
    }
    if (chunk.length <= this.remaining) {
      this.remaining -= chunk.length;
      callback();
      return;
    }
    const output = chunk.subarray(this.remaining);
    this.remaining = 0;
    callback(null, output);
  }
}

function incrementCounter(iv: Buffer, blocks: number): Buffer {
  const counter = Buffer.from(iv);
  let carry = blocks;
  for (let index = counter.length - 1; index >= 0 && carry > 0; index--) {
    const sum = counter[index] + (carry & 0xff);
    counter[index] = sum & 0xff;
    carry = Math.floor(carry / 256) + Math.floor(sum / 256);
  }
  return counter;
}

function isPlaybackTicketClaims(value: unknown): value is PlaybackTicketClaims {
  if (!value || typeof value !== 'object') return false;
  const claims = value as Record<string, unknown>;
  return (
    claims.aud === ROOM_MEDIA_AUDIENCE &&
    typeof claims.exp === 'number' &&
    Number.isInteger(claims.exp) &&
    typeof claims.jti === 'string' &&
    claims.jti.length > 0 &&
    typeof claims.roomId === 'string' &&
    claims.roomId.length > 0 &&
    typeof claims.songId === 'string' &&
    claims.songId.length > 0 &&
    typeof claims.userId === 'string' &&
    claims.userId.length > 0
  );
}
