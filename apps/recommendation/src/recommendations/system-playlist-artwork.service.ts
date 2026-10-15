import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
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

const SYSTEM_PLAYLIST_KEYS = new Set([
  'get-up',
  'chill',
  'new-music',
  'heavy-rotation',
]);
const OWNER_SERVICE = 'recommendation';
const OWNER_TYPE = 'system-playlist';
const COVER_RATIO = 1;
const HOME_CARD_RATIO = 3 / 4;
const RATIO_TOLERANCE = 0.03;

type JsonObject = Record<string, unknown>;

export type SystemPlaylistArtwork = {
  assetId: string;
  url: string;
  width: number;
  height: number;
  bgColor: string;
  variants: JsonObject;
};

export type SystemPlaylistArtworkPair = {
  cover: SystemPlaylistArtwork;
  homeCard: SystemPlaylistArtwork;
  detailSquareVideo?: JsonObject;
  detailMobileVideo?: JsonObject;
  homeHeroVideo?: JsonObject;
};

export type StoredSystemPlaylistArtworkPair = SystemPlaylistArtworkPair & {
  updatedAt: Date;
};

@Injectable()
export class SystemPlaylistArtworkService implements OnModuleInit {
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
    playlistKey: string,
    coverAssetId: string,
    homeCardAssetId: string,
  ): Promise<SystemPlaylistArtworkPair> {
    this.assertPlaylistKey(playlistKey);
    if (!coverAssetId.trim() || !homeCardAssetId.trim()) {
      this.failedPrecondition('SYSTEM_PLAYLIST_ARTWORK_REQUIRED');
    }

    const previous = await this.prisma.systemPlaylistArtwork.findUnique({
      where: { playlistKey },
      select: { coverAssetId: true, homeCardAssetId: true },
    });
    const assets = await this.registerAssetUsages(
      playlistKey,
      coverAssetId,
      homeCardAssetId,
    );

    try {
      const artwork = {
        cover: this.artwork(
          assets.find((asset) => asset.id === coverAssetId),
          coverAssetId,
          COVER_RATIO,
        ),
        homeCard: this.artwork(
          assets.find((asset) => asset.id === homeCardAssetId),
          homeCardAssetId,
          HOME_CARD_RATIO,
        ),
      };

      await this.prisma.systemPlaylistArtwork.upsert({
        where: { playlistKey },
        create: {
          playlistKey,
          coverAssetId,
          homeCardAssetId,
          coverArtwork: artwork.cover as unknown as Prisma.InputJsonObject,
          homeCardArtwork:
            artwork.homeCard as unknown as Prisma.InputJsonObject,
        },
        update: {
          coverAssetId,
          homeCardAssetId,
          coverArtwork: artwork.cover as unknown as Prisma.InputJsonObject,
          homeCardArtwork:
            artwork.homeCard as unknown as Prisma.InputJsonObject,
        },
      });
      await this.reconcileAssetUsages(
        playlistKey,
        coverAssetId,
        homeCardAssetId,
      );
      await this.markHomePagesStale();
      return artwork;
    } catch (error) {
      // RegisterAssetUsages synchronizes the owner slots. Restore them if a
      // later check fails, so an existing playlist retains its artwork and a
      // newly uploaded, unbound asset can be cleaned up safely.
      await this.reconcileAssetUsages(
        playlistKey,
        previous?.coverAssetId,
        previous?.homeCardAssetId,
      ).catch(() => undefined);
      throw error;
    }
  }

  async bindVideos(
    playlistKey: string,
    detailSquareVideoAssetId: string,
    detailMobileVideoAssetId: string,
    homeHeroVideoAssetId: string,
  ): Promise<SystemPlaylistArtworkPair> {
    this.assertPlaylistKey(playlistKey);
    if (
      ![
        detailSquareVideoAssetId,
        detailMobileVideoAssetId,
        homeHeroVideoAssetId,
      ].every((id) => id.trim())
    ) {
      this.failedPrecondition('SYSTEM_PLAYLIST_VIDEO_REQUIRED');
    }

    const previous = await this.prisma.systemPlaylistArtwork.findUnique({
      where: { playlistKey },
      select: {
        coverAssetId: true,
        homeCardAssetId: true,
        coverArtwork: true,
        detailSquareVideoAssetId: true,
        detailMobileVideoAssetId: true,
        homeHeroVideoAssetId: true,
      },
    });
    const response = await firstValueFrom(
      this.client.registerAssetUsages(
        this.videoAssetUsageRequest(
          playlistKey,
          detailSquareVideoAssetId,
          detailMobileVideoAssetId,
          homeHeroVideoAssetId,
        ),
        this.metadata(),
      ),
    );

    try {
      const byId = new Map(response.assets.map((asset) => [asset.id, asset]));
      const square = this.video(
        byId.get(detailSquareVideoAssetId),
        detailSquareVideoAssetId,
        COVER_RATIO,
      );
      const mobile = this.video(
        byId.get(detailMobileVideoAssetId),
        detailMobileVideoAssetId,
        HOME_CARD_RATIO,
      );
      const hero = this.video(
        byId.get(homeHeroVideoAssetId),
        homeHeroVideoAssetId,
        HOME_CARD_RATIO,
      );
      // Replacing video must not discard a colour the editor has already
      // chosen for this playlist. Both poster slots share that colour, just
      // like every ordinary Hero card reads its selected artwork's bgColor.
      const persistedColor = this.storedArtwork(
        previous?.coverArtwork,
      )?.bgColor;
      const cover = this.posterArtwork(square, persistedColor);
      const homeCard = this.posterArtwork(hero, persistedColor);

      await this.prisma.systemPlaylistArtwork.upsert({
        where: { playlistKey },
        create: {
          playlistKey,
          // Legacy fields retain the poster identity consumed by existing catalog paths.
          coverAssetId: detailSquareVideoAssetId,
          homeCardAssetId: homeHeroVideoAssetId,
          coverArtwork: cover as unknown as Prisma.InputJsonObject,
          homeCardArtwork: homeCard as unknown as Prisma.InputJsonObject,
          detailSquareVideoAssetId,
          detailMobileVideoAssetId,
          homeHeroVideoAssetId,
          detailSquareVideo: square as Prisma.InputJsonObject,
          detailMobileVideo: mobile as Prisma.InputJsonObject,
          homeHeroVideo: hero as Prisma.InputJsonObject,
        },
        update: {
          coverAssetId: detailSquareVideoAssetId,
          homeCardAssetId: homeHeroVideoAssetId,
          coverArtwork: cover as unknown as Prisma.InputJsonObject,
          homeCardArtwork: homeCard as unknown as Prisma.InputJsonObject,
          detailSquareVideoAssetId,
          detailMobileVideoAssetId,
          homeHeroVideoAssetId,
          detailSquareVideo: square as Prisma.InputJsonObject,
          detailMobileVideo: mobile as Prisma.InputJsonObject,
          homeHeroVideo: hero as Prisma.InputJsonObject,
        },
      });
      await this.reconcileVideoAssetUsages(
        playlistKey,
        detailSquareVideoAssetId,
        detailMobileVideoAssetId,
        homeHeroVideoAssetId,
      );
      await this.markHomePagesStale();
      return {
        cover,
        homeCard,
        detailSquareVideo: square,
        detailMobileVideo: mobile,
        homeHeroVideo: hero,
      };
    } catch (error) {
      await this.restorePreviousAssetUsages(playlistKey, previous).catch(
        () => undefined,
      );
      throw error;
    }
  }

  async byKeys(
    keys: string[],
  ): Promise<Map<string, StoredSystemPlaylistArtworkPair>> {
    if (!keys.length) return new Map();

    const rows = await this.prisma.systemPlaylistArtwork.findMany({
      where: { playlistKey: { in: keys } },
      select: {
        playlistKey: true,
        coverArtwork: true,
        homeCardArtwork: true,
        detailSquareVideo: true,
        detailMobileVideo: true,
        homeHeroVideo: true,
        updatedAt: true,
      },
    });
    return new Map(
      rows.flatMap((row) => {
        const cover = this.storedArtwork(row.coverArtwork);
        const homeCard = this.storedArtwork(row.homeCardArtwork);
        return cover && homeCard
          ? [
              [
                row.playlistKey,
                {
                  cover,
                  homeCard,
                  detailSquareVideo: this.object(row.detailSquareVideo),
                  detailMobileVideo: this.object(row.detailMobileVideo),
                  homeHeroVideo: this.object(row.homeHeroVideo),
                  updatedAt: row.updatedAt,
                },
              ] as const,
            ]
          : [];
      }),
    );
  }

  async setColor(
    playlistKey: string,
    bgColor: string,
  ): Promise<SystemPlaylistArtworkPair> {
    this.assertPlaylistKey(playlistKey);
    if (!/^#?[0-9a-f]{6}$/i.test(bgColor)) {
      this.failedPrecondition('SYSTEM_PLAYLIST_ARTWORK_COLOR_INVALID');
    }

    const row = await this.prisma.systemPlaylistArtwork.findUnique({
      where: { playlistKey },
    });
    if (!row) this.failedPrecondition('SYSTEM_PLAYLIST_ARTWORK_NOT_CONFIGURED');

    const cover = this.storedArtwork(row.coverArtwork);
    const homeCard = this.storedArtwork(row.homeCardArtwork);
    if (!cover || !homeCard) {
      this.failedPrecondition('SYSTEM_PLAYLIST_ARTWORK_INVALID_STORED_DATA');
    }

    const updatedCover = {
      ...cover,
      bgColor: bgColor.replace('#', '').toLowerCase(),
    };
    // Home Hero selects the 3:4 home-card artwork. Give that artwork the same
    // palette value as the square cover so it follows the standard Hero-card
    // colour path used by every other shelf.
    const updatedHomeCard = {
      ...homeCard,
      bgColor: updatedCover.bgColor,
    };
    await this.prisma.systemPlaylistArtwork.update({
      where: { playlistKey },
      data: {
        coverArtwork: updatedCover as unknown as Prisma.InputJsonObject,
        homeCardArtwork: updatedHomeCard as unknown as Prisma.InputJsonObject,
      },
    });
    await this.syncPublishedPlaylistColor(
      playlistKey,
      updatedCover.bgColor,
      updatedHomeCard,
    );
    return { cover: updatedCover, homeCard: updatedHomeCard };
  }

  private async registerAssetUsages(
    playlistKey: string,
    coverAssetId: string,
    homeCardAssetId: string,
  ): Promise<Asset[]> {
    try {
      const response = await firstValueFrom(
        this.client.registerAssetUsages(
          this.assetUsageRequest(playlistKey, coverAssetId, homeCardAssetId),
          this.metadata(),
        ),
      );
      return response.assets;
    } catch {
      this.failedPrecondition('SYSTEM_PLAYLIST_ARTWORK_REGISTRATION_FAILED');
    }
  }

  private async reconcileAssetUsages(
    playlistKey: string,
    coverAssetId?: string,
    homeCardAssetId?: string,
  ): Promise<void> {
    await firstValueFrom(
      this.client.reconcileAssetUsages(
        this.assetUsageRequest(playlistKey, coverAssetId, homeCardAssetId),
        this.metadata(),
      ),
    );
  }

  private assetUsageRequest(
    playlistKey: string,
    coverAssetId?: string,
    homeCardAssetId?: string,
  ) {
    return {
      ownerService: OWNER_SERVICE,
      ownerType: OWNER_TYPE,
      ownerId: playlistKey,
      usages:
        coverAssetId && homeCardAssetId
          ? [
              {
                slot: 'cover',
                assetId: coverAssetId,
                expectedKind: AssetKind.ASSET_KIND_IMAGE,
                expectedPurpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
              },
              {
                slot: 'home-card',
                assetId: homeCardAssetId,
                expectedKind: AssetKind.ASSET_KIND_IMAGE,
                expectedPurpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
              },
            ]
          : [],
    };
  }

  private async reconcileVideoAssetUsages(
    playlistKey: string,
    detailSquareVideoAssetId?: string,
    detailMobileVideoAssetId?: string,
    homeHeroVideoAssetId?: string,
  ): Promise<void> {
    await firstValueFrom(
      this.client.reconcileAssetUsages(
        this.videoAssetUsageRequest(
          playlistKey,
          detailSquareVideoAssetId,
          detailMobileVideoAssetId,
          homeHeroVideoAssetId,
        ),
        this.metadata(),
      ),
    );
  }

  private async restorePreviousAssetUsages(
    playlistKey: string,
    previous?: {
      coverAssetId: string;
      homeCardAssetId: string;
      detailSquareVideoAssetId: string;
      detailMobileVideoAssetId: string;
      homeHeroVideoAssetId: string;
    } | null,
  ): Promise<void> {
    const previousVideoIds = [
      previous?.detailSquareVideoAssetId,
      previous?.detailMobileVideoAssetId,
      previous?.homeHeroVideoAssetId,
    ];
    if (previousVideoIds.every((assetId) => assetId?.trim())) {
      return this.reconcileVideoAssetUsages(
        playlistKey,
        previous?.detailSquareVideoAssetId,
        previous?.detailMobileVideoAssetId,
        previous?.homeHeroVideoAssetId,
      );
    }
    return this.reconcileAssetUsages(
      playlistKey,
      previous?.coverAssetId,
      previous?.homeCardAssetId,
    );
  }

  private videoAssetUsageRequest(
    playlistKey: string,
    detailSquareVideoAssetId?: string,
    detailMobileVideoAssetId?: string,
    homeHeroVideoAssetId?: string,
  ) {
    const assetIds = [
      detailSquareVideoAssetId,
      detailMobileVideoAssetId,
      homeHeroVideoAssetId,
    ];
    return {
      ownerService: OWNER_SERVICE,
      ownerType: OWNER_TYPE,
      ownerId: playlistKey,
      usages: assetIds.every((id) => id?.trim())
        ? [
            {
              slot: 'detail-square-video',
              assetId: detailSquareVideoAssetId!,
              expectedKind: AssetKind.ASSET_KIND_VIDEO,
              expectedPurpose: AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO,
            },
            {
              slot: 'detail-mobile-video',
              assetId: detailMobileVideoAssetId!,
              expectedKind: AssetKind.ASSET_KIND_VIDEO,
              expectedPurpose: AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO,
            },
            {
              slot: 'home-hero-video',
              assetId: homeHeroVideoAssetId!,
              expectedKind: AssetKind.ASSET_KIND_VIDEO,
              expectedPurpose: AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO,
            },
          ]
        : [],
    };
  }

  private artwork(
    asset: Asset | undefined,
    assetId: string,
    expectedRatio: number,
  ): SystemPlaylistArtwork {
    if (!asset)
      this.failedPrecondition(`SYSTEM_PLAYLIST_ARTWORK_NOT_FOUND:${assetId}`);
    if (asset.status !== AssetStatus.ASSET_STATUS_READY) {
      this.failedPrecondition(`SYSTEM_PLAYLIST_ARTWORK_NOT_READY:${assetId}`);
    }
    if (
      asset.kind !== AssetKind.ASSET_KIND_IMAGE ||
      asset.purpose !== AssetPurpose.ASSET_PURPOSE_ARTWORK
    ) {
      this.failedPrecondition(
        `SYSTEM_PLAYLIST_ARTWORK_TYPE_MISMATCH:${assetId}`,
      );
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
      Math.abs(width / height - expectedRatio) > RATIO_TOLERANCE
    ) {
      this.failedPrecondition(
        `SYSTEM_PLAYLIST_ARTWORK_RATIO_INVALID:${assetId}`,
      );
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

  private video(
    asset: Asset | undefined,
    assetId: string,
    expectedRatio: number,
  ): JsonObject {
    if (
      !asset ||
      asset.status !== AssetStatus.ASSET_STATUS_READY ||
      asset.kind !== AssetKind.ASSET_KIND_VIDEO ||
      asset.purpose !== AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO
    ) {
      this.failedPrecondition(`SYSTEM_PLAYLIST_VIDEO_INVALID:${assetId}`);
    }
    if (
      !asset.width ||
      !asset.height ||
      Math.abs(asset.width / asset.height - expectedRatio) > RATIO_TOLERANCE
    ) {
      const actualRatio =
        asset.width && asset.height
          ? (asset.width / asset.height).toFixed(3)
          : 'unknown';
      this.failedPrecondition(
        `SYSTEM_PLAYLIST_VIDEO_RATIO_INVALID:${assetId}:expected=${expectedRatio.toFixed(3)}:actual=${actualRatio}:dimensions=${asset.width}x${asset.height}`,
      );
    }
    const variants = this.object(asset.variants);
    const poster = this.object(variants.poster);
    if (!this.string(asset.publicUrl) || !this.string(poster.url))
      this.failedPrecondition(
        `SYSTEM_PLAYLIST_VIDEO_POSTER_MISSING:${assetId}`,
      );
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

  private posterArtwork(
    video: JsonObject,
    bgColor = '2c2c2e',
  ): SystemPlaylistArtwork {
    const poster = this.object(video.previewFrame);
    return {
      assetId: this.string(video.assetId),
      url: this.string(poster.url),
      width: this.number(poster.width),
      height: this.number(poster.height),
      bgColor,
      variants: this.object(poster.variants),
    };
  }

  private storedArtwork(value: unknown): SystemPlaylistArtwork | undefined {
    const artwork = this.object(value);
    const assetId = this.string(artwork.assetId);
    const url = this.string(artwork.url);
    if (!assetId || !url) return undefined;

    return {
      assetId,
      url,
      width: this.number(artwork.width),
      height: this.number(artwork.height),
      bgColor: this.string(artwork.bgColor) || '2c2c2e',
      variants: this.object(artwork.variants),
    };
  }

  private primaryRendition(variants: JsonObject): {
    url: string;
    width: number;
    height: number;
  } {
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

  private async markHomePagesStale(): Promise<void> {
    await this.prisma.recommendationPage.updateMany({
      where: { name: 'listen-now', status: 'PUBLISHED' },
      data: { staleAfter: new Date(0) },
    });
  }

  /**
   * Home reads the published resource projection, not SystemPlaylistArtwork
   * directly. Keep the projection's cover colour in sync so a colour change
   * takes effect immediately instead of waiting for a later Home generation.
   */
  private async syncPublishedPlaylistColor(
    playlistKey: string,
    bgColor: string,
    homeCard: SystemPlaylistArtwork,
  ): Promise<void> {
    const playlist = await this.prisma.generatedSystemPlaylist.findUnique({
      where: {
        scopeKey_playlistKey: { scopeKey: 'GLOBAL', playlistKey },
      },
      select: { playlistId: true },
    });
    if (!playlist) return;

    const snapshot =
      await this.prisma.recommendationResourceSnapshot.findUnique({
        where: {
          resourceType_resourceId: {
            resourceType: 'playlists',
            resourceId: playlist.playlistId,
          },
        },
        select: { attributes: true },
      });
    if (!snapshot) return;

    const attributes = this.object(snapshot.attributes);
    const artwork = this.object(attributes.artwork);
    const variants = this.object(artwork.variants);
    await this.prisma.recommendationResourceSnapshot.update({
      where: {
        resourceType_resourceId: {
          resourceType: 'playlists',
          resourceId: playlist.playlistId,
        },
      },
      data: {
        artworkBgColor: bgColor,
        bgColor,
        attributes: {
          ...attributes,
          artwork: {
            ...artwork,
            bgColor,
            variants: {
              ...variants,
              homeCard,
            },
          },
        } as Prisma.InputJsonObject,
      },
    });
  }

  private assertPlaylistKey(playlistKey: string): void {
    if (!SYSTEM_PLAYLIST_KEYS.has(playlistKey)) {
      this.failedPrecondition(`SYSTEM_PLAYLIST_KEY_INVALID:${playlistKey}`);
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
