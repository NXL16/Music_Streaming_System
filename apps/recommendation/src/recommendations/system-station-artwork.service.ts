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

type StationCover = {
  assetId: string;
  url: string;
  width: number;
  height: number;
  bgColor: string;
  variants: JsonObject;
};

export type SystemStationArtwork = {
  cover: StationCover;
  heroVideo?: JsonObject;
  updatedAt?: Date;
};

const OWNER_SERVICE = 'recommendation';
const OWNER_TYPE = 'system-station';
const COVER_RATIO = 1;
const HERO_RATIO = 3 / 4;
const RATIO_TOLERANCE = 0.03;
const STATION_KEYS: Set<string> = new Set(
  [
    ...PRODUCTION_RECOMMENDATION_POLICY.moodStations,
    ...PRODUCTION_RECOMMENDATION_POLICY.personalizedStations,
  ].map((station) => station.key),
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
    this.client =
      this.grpcClient.getService<AssetServiceClient>('AssetService');
  }

  async bind(
    stationKey: string,
    coverAssetId: string,
    heroVideoAssetId: string,
  ): Promise<SystemStationArtwork> {
    this.assertStationKey(stationKey);
    if (!coverAssetId.trim() || !heroVideoAssetId.trim()) {
      this.failedPrecondition('SYSTEM_STATION_MEDIA_REQUIRED');
    }
    const previous = await this.prisma.systemStationArtwork.findUnique({
      where: { stationKey },
      select: { coverAssetId: true, heroVideoAssetId: true },
    });
    const assets = await this.registerAssetUsages(
      stationKey,
      coverAssetId,
      heroVideoAssetId,
    );
    try {
      const artwork = {
        cover: this.cover(
          assets.find((asset) => asset.id === coverAssetId),
          coverAssetId,
        ),
        heroVideo: this.heroVideo(
          assets.find((asset) => asset.id === heroVideoAssetId),
          heroVideoAssetId,
        ),
      };
      await this.prisma.systemStationArtwork.upsert({
        where: { stationKey },
        create: {
          stationKey,
          coverAssetId,
          heroVideoAssetId,
          coverArtwork: artwork.cover as unknown as Prisma.InputJsonObject,
          heroVideo: artwork.heroVideo as Prisma.InputJsonObject,
        },
        update: {
          coverAssetId,
          heroVideoAssetId,
          coverArtwork: artwork.cover as unknown as Prisma.InputJsonObject,
          heroVideo: artwork.heroVideo as Prisma.InputJsonObject,
        },
      });
      await this.reconcileAssetUsages(
        stationKey,
        coverAssetId,
        heroVideoAssetId,
      );
      await this.markHomePagesStale();
      return artwork;
    } catch (error) {
      await this.reconcileAssetUsages(
        stationKey,
        previous?.coverAssetId,
        previous?.heroVideoAssetId ?? undefined,
      ).catch(() => undefined);
      throw error;
    }
  }

  async byStationKeys(
    keys: string[],
  ): Promise<Map<string, SystemStationArtwork>> {
    if (!keys.length) return new Map();
    const rows = await this.prisma.systemStationArtwork.findMany({
      where: { stationKey: { in: keys } },
      select: {
        stationKey: true,
        coverArtwork: true,
        heroVideo: true,
        updatedAt: true,
      },
    });
    return new Map(
      rows.flatMap((row) => {
        const cover = this.storedCover(row.coverArtwork);
        const heroVideo = this.storedHeroVideo(row.heroVideo);
        return cover
          ? [
              [
                row.stationKey,
                {
                  cover,
                  ...(heroVideo ? { heroVideo } : {}),
                  updatedAt: row.updatedAt,
                },
              ] as const,
            ]
          : [];
      }),
    );
  }

  private async registerAssetUsages(
    stationKey: string,
    coverAssetId: string,
    heroVideoAssetId: string,
  ): Promise<Asset[]> {
    try {
      const response = await firstValueFrom(
        this.client.registerAssetUsages(
          this.assetUsageRequest(stationKey, coverAssetId, heroVideoAssetId),
          this.metadata(),
        ),
      );
      return response.assets;
    } catch {
      this.failedPrecondition('SYSTEM_STATION_MEDIA_REGISTRATION_FAILED');
    }
  }

  private async reconcileAssetUsages(
    stationKey: string,
    coverAssetId?: string,
    heroVideoAssetId?: string,
  ): Promise<void> {
    await firstValueFrom(
      this.client.reconcileAssetUsages(
        this.assetUsageRequest(stationKey, coverAssetId, heroVideoAssetId),
        this.metadata(),
      ),
    );
  }

  private assetUsageRequest(
    stationKey: string,
    coverAssetId?: string,
    heroVideoAssetId?: string,
  ) {
    return {
      ownerService: OWNER_SERVICE,
      ownerType: OWNER_TYPE,
      ownerId: stationKey,
      usages:
        coverAssetId?.trim() && heroVideoAssetId?.trim()
          ? [
              {
                slot: 'cover',
                assetId: coverAssetId,
                expectedKind: AssetKind.ASSET_KIND_IMAGE,
                expectedPurpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
              },
              {
                slot: 'home-hero-video',
                assetId: heroVideoAssetId,
                expectedKind: AssetKind.ASSET_KIND_VIDEO,
                expectedPurpose: AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO,
              },
            ]
          : [],
    };
  }

  private cover(asset: Asset | undefined, assetId: string): StationCover {
    if (
      !asset ||
      asset.status !== AssetStatus.ASSET_STATUS_READY ||
      asset.kind !== AssetKind.ASSET_KIND_IMAGE ||
      asset.purpose !== AssetPurpose.ASSET_PURPOSE_ARTWORK
    ) {
      this.failedPrecondition(`SYSTEM_STATION_COVER_INVALID:${assetId}`);
    }
    const variants = this.object(asset.variants);
    const rendition = this.primaryRendition(variants);
    const width = rendition.width || asset.width;
    const height = rendition.height || asset.height;
    const url = rendition.url || asset.publicUrl;
    if (
      !url ||
      !width ||
      !height ||
      Math.abs(width / height - COVER_RATIO) > RATIO_TOLERANCE
    ) {
      this.failedPrecondition(`SYSTEM_STATION_COVER_RATIO_INVALID:${assetId}`);
    }
    return {
      assetId: asset.id,
      url,
      width,
      height,
      bgColor: this.string(this.object(variants.palette).bgColor) || '2c2c2e',
      variants,
    };
  }

  private heroVideo(asset: Asset | undefined, assetId: string): JsonObject {
    if (
      !asset ||
      asset.status !== AssetStatus.ASSET_STATUS_READY ||
      asset.kind !== AssetKind.ASSET_KIND_VIDEO ||
      asset.purpose !== AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO ||
      !asset.width ||
      !asset.height ||
      Math.abs(asset.width / asset.height - HERO_RATIO) > RATIO_TOLERANCE
    ) {
      this.failedPrecondition(`SYSTEM_STATION_HERO_VIDEO_INVALID:${assetId}`);
    }
    const variants = this.object(asset.variants);
    const poster = this.object(variants.poster);
    if (!this.string(asset.publicUrl) || !this.string(poster.url)) {
      this.failedPrecondition(
        `SYSTEM_STATION_HERO_VIDEO_POSTER_MISSING:${assetId}`,
      );
    }
    return {
      assetId: asset.id,
      video: asset.publicUrl,
      width: asset.width,
      height: asset.height,
      durationMillis: asset.durationMillis,
      previewFrame: {
        assetId: asset.id,
        url: this.string(poster.url),
        width: this.number(poster.width),
        height: this.number(poster.height),
        bgColor: this.string(poster.bgColor),
        variants: this.object(poster.variants),
      },
      variants,
    };
  }

  private storedCover(value: unknown): StationCover | undefined {
    const cover = this.object(value);
    const assetId = this.string(cover.assetId);
    const url = this.string(cover.url);
    if (!assetId || !url) return undefined;
    return {
      assetId,
      url,
      width: this.number(cover.width),
      height: this.number(cover.height),
      bgColor: this.string(cover.bgColor) || '2c2c2e',
      variants: this.object(cover.variants),
    };
  }

  private storedHeroVideo(value: unknown): JsonObject | undefined {
    const video = this.object(value);
    return this.string(video.video) &&
      this.string(this.object(video.previewFrame).url)
      ? video
      : undefined;
  }

  private primaryRendition(variants: JsonObject) {
    const primary = (
      Array.isArray(variants.renditions) ? variants.renditions : []
    )
      .map((item) => this.object(item))
      .filter((item) => this.string(item.url))
      .sort((left, right) => this.number(right.width) - this.number(left.width))
      .at(0);
    return {
      url: primary ? this.string(primary.url) : '',
      width: primary ? this.number(primary.width) : 0,
      height: primary ? this.number(primary.height) : 0,
    };
  }

  private async markHomePagesStale(): Promise<void> {
    await this.prisma.recommendationPage.updateMany({
      where: { name: 'listen-now', status: 'PUBLISHED' },
      data: { staleAfter: new Date(0) },
    });
  }

  private assertStationKey(stationKey: string): void {
    if (!STATION_KEYS.has(stationKey)) {
      this.failedPrecondition(`SYSTEM_STATION_KEY_INVALID:${stationKey}`);
    }
  }

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set(
      'x-internal-token',
      this.config.getOrThrow<string>('INTERNAL_GRPC_TOKEN'),
    );
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
