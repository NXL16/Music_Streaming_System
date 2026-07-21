import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import {
  Asset,
  AssetKind,
  AssetPurpose,
  AssetServiceClient,
  AssetStatus,
} from '@musical/shared-proto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PRODUCTION_RECOMMENDATION_POLICY } from '../generation/production-recommendation-policy';

type JsonObject = Record<string, unknown>;

export type SystemStationArtwork = {
  assetId: string;
  url: string;
  width: number;
  height: number;
  bgColor: string;
  variants: JsonObject;
};

const STATION_KEYS: Set<string> = new Set(
  PRODUCTION_RECOMMENDATION_POLICY.moodStations.map((station) => station.key),
);

@Injectable()
export class SystemStationArtworkService implements OnModuleInit {
  private client!: AssetServiceClient;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('ASSET_SERVICE') private readonly grpcClient: ClientGrpc,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.client = this.grpcClient.getService<AssetServiceClient>('AssetService');
  }

  async bind(stationKey: string, assetId: string): Promise<SystemStationArtwork> {
    if (!STATION_KEYS.has(stationKey)) {
      this.failedPrecondition(`SYSTEM_STATION_KEY_INVALID:${stationKey}`);
    }
    if (!assetId.trim()) this.failedPrecondition('SYSTEM_STATION_ARTWORK_REQUIRED');

    let asset: Asset | undefined;
    try {
      const response = await firstValueFrom(
        this.client.registerAssetUsages(
          {
            ownerService: 'recommendation',
            ownerType: 'system-station',
            ownerId: stationKey,
            usages: [{
              slot: 'artwork',
              assetId,
              expectedKind: AssetKind.ASSET_KIND_IMAGE,
              expectedPurpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
            }],
          },
          this.metadata(),
        ),
      );
      asset = response.assets.find((item) => item.id === assetId);
    } catch {
      this.failedPrecondition('SYSTEM_STATION_ARTWORK_REGISTRATION_FAILED');
    }

    const artwork = this.artwork(asset, assetId);
    await this.prisma.systemStationArtwork.upsert({
      where: { stationKey },
      create: {
        stationKey,
        assetId,
        artwork: artwork as unknown as Prisma.InputJsonObject,
      },
      update: {
        assetId,
        artwork: artwork as unknown as Prisma.InputJsonObject,
      },
    });
    // Generated station snapshots embed artwork metadata. Mark pages stale so
    // the next lazy generation replaces the old song-derived artwork.
    await this.prisma.recommendationPage.updateMany({
      where: { name: 'listen-now', status: 'PUBLISHED' },
      data: { staleAfter: new Date(0) },
    });
    return artwork;
  }

  async byStationKeys(keys: string[]): Promise<Map<string, SystemStationArtwork>> {
    if (!keys.length) return new Map();
    const rows = await this.prisma.systemStationArtwork.findMany({
      where: { stationKey: { in: keys } },
      select: { stationKey: true, artwork: true },
    });
    return new Map(
      rows.flatMap((row) => {
        const artwork = this.storedArtwork(row.artwork);
        return artwork ? [[row.stationKey, artwork] as const] : [];
      }),
    );
  }

  private artwork(asset: Asset | undefined, assetId: string): SystemStationArtwork {
    if (!asset) this.failedPrecondition(`SYSTEM_STATION_ARTWORK_NOT_FOUND:${assetId}`);
    if (asset.status !== AssetStatus.ASSET_STATUS_READY) {
      this.failedPrecondition(`SYSTEM_STATION_ARTWORK_NOT_READY:${assetId}`);
    }
    if (
      asset.kind !== AssetKind.ASSET_KIND_IMAGE ||
      asset.purpose !== AssetPurpose.ASSET_PURPOSE_ARTWORK
    ) {
      this.failedPrecondition(`SYSTEM_STATION_ARTWORK_TYPE_MISMATCH:${assetId}`);
    }
    const variants = this.object(asset.variants);
    const rendition = this.primaryRendition(variants);
    const palette = this.object(variants.palette);
    const url = rendition.url || asset.publicUrl;
    if (!url) this.failedPrecondition(`SYSTEM_STATION_ARTWORK_URL_MISSING:${assetId}`);
    return {
      assetId: asset.id,
      url,
      width: rendition.width || asset.width,
      height: rendition.height || asset.height,
      bgColor: this.string(palette.bgColor),
      variants,
    };
  }

  private storedArtwork(value: unknown): SystemStationArtwork | undefined {
    const artwork = this.object(value);
    const assetId = this.string(artwork.assetId);
    const url = this.string(artwork.url);
    if (!assetId || !url) return undefined;
    return {
      assetId,
      url,
      width: this.number(artwork.width),
      height: this.number(artwork.height),
      bgColor: this.string(artwork.bgColor),
      variants: this.object(artwork.variants),
    };
  }

  private primaryRendition(variants: JsonObject) {
    const renditions = Array.isArray(variants.renditions)
      ? variants.renditions.map((item) => this.object(item))
      : [];
    const primary = renditions
      .filter((item) => this.string(item.url))
      .sort((left, right) => this.number(right.width) - this.number(left.width))
      .at(0);
    return {
      url: primary ? this.string(primary.url) : '',
      width: primary ? this.number(primary.width) : 0,
      height: primary ? this.number(primary.height) : 0,
    };
  }

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set('x-internal-token', this.config.getOrThrow<string>('INTERNAL_GRPC_TOKEN'));
    return metadata;
  }

  private object(value: unknown): JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : {};
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private number(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private failedPrecondition(message: string): never {
    throw new RpcException({ code: status.FAILED_PRECONDITION, message });
  }
}
