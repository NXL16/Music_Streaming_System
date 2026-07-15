import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';
import type {
  GetStreamDataRequest,
  MetadataServiceClient,
  StreamDataResponse,
} from '@musical/shared-proto';

type CompactSegment = {
  startByte: number;
  size: number;
  duration: number;
  startTimeSec: number;
};

export type CompactMetadataResponse = {
  songId: string;
  duration: number;
  seektableVersion: number;
  offset: number;
  timescale: number;
  initRange: { start: number; end: number };
  segments: CompactSegment[];
  encryptionStartOffset: number;
  waveform: number[];
};

type CacheEntry = {
  expiresAt: number;
  data: CompactMetadataResponse;
};

const META_CACHE_TTL_MS = 30_000;
const META_CACHE_MAX_ITEMS = 1000;

@Injectable()
export class MetadataService implements OnModuleInit {
  private metadataClient!: MetadataServiceClient;
  private readonly streamDataCache = new Map<string, CacheEntry>();

  constructor(
    @Inject('METADATA_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.metadataClient =
      this.client.getService<MetadataServiceClient>('MetadataService');
  }

  async getStreamData(data: GetStreamDataRequest): Promise<StreamDataResponse> {
    return await grpcFirstValueFrom(this.metadataClient.getStreamData(data));
  }

  async getCompactStreamData(songId: string): Promise<CompactMetadataResponse> {
    const now = Date.now();
    const cached = this.streamDataCache.get(songId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    if (cached) {
      this.streamDataCache.delete(songId);
    }

    const data = await this.getStreamData({ songId });
    const compact: CompactMetadataResponse = {
      songId: data.songId,
      duration: data.duration,
      seektableVersion: data.seektableVersion,
      offset: data.mediaOffset || data.encryptionStartOffset || 0,
      timescale: data.timescale || 44100,
      initRange: {
        start: data.initRange?.start ?? 0,
        end: data.initRange?.end ?? Math.max(0, (data.mediaOffset || 0) - 1),
      },
      segments: (data.segments || []).map((segment) => ({
        startByte: segment.startByte,
        size: segment.size,
        duration: segment.durationTs,
        startTimeSec: segment.startTimeSec,
      })),
      encryptionStartOffset:
        data.encryptionStartOffset || data.mediaOffset || 0,
      waveform: data.waveform || [],
    };

    if (this.streamDataCache.size >= META_CACHE_MAX_ITEMS) {
      this.purgeExpiredEntries(now);
    }

    if (this.streamDataCache.size >= META_CACHE_MAX_ITEMS) {
      const oldestKey = this.streamDataCache.keys().next().value;
      if (oldestKey) this.streamDataCache.delete(oldestKey);
    }

    this.streamDataCache.set(songId, {
      expiresAt: now + META_CACHE_TTL_MS,
      data: compact,
    });

    return compact;
  }

  private purgeExpiredEntries(now: number) {
    for (const [key, entry] of this.streamDataCache) {
      if (entry.expiresAt <= now) {
        this.streamDataCache.delete(key);
      }
    }
  }
}
