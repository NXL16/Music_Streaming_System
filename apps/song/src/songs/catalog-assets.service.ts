import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  Asset,
  AssetKind,
  AssetPurpose,
  AssetServiceClient,
  AssetStatus,
} from '@musical/shared-proto';
import { firstValueFrom } from 'rxjs';

type JsonObject = Record<string, unknown>;

export interface CatalogAssetUsage {
  slot: string;
  assetId: string;
  expectedKind: AssetKind;
  expectedPurpose: AssetPurpose;
}

export interface ResolvedCatalogAssets {
  payload: JsonObject;
  usages: CatalogAssetUsage[];
}

const RESOURCE_TYPES_WITH_ARTWORK = new Set([
  'artists',
  'songs',
  'albums',
  'playlists',
]);

@Injectable()
export class CatalogAssetsService implements OnModuleInit {
  private client!: AssetServiceClient;

  constructor(
    @Inject('ASSET_SERVICE')
    private readonly grpcClient: ClientGrpc,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.client =
      this.grpcClient.getService<AssetServiceClient>('AssetService');
  }

  async resolveForPublish(
    resourceType: string,
    resourceId: string,
    payload: JsonObject,
  ): Promise<ResolvedCatalogAssets> {
    const artworkAssetId = this.string(payload.artworkAssetId);
    if (
      RESOURCE_TYPES_WITH_ARTWORK.has(resourceType) &&
      !artworkAssetId
    ) {
      this.failedPrecondition('CATALOG_ARTWORK_ASSET_REQUIRED');
    }

    const editorialArtworkAssetId = this.string(
      payload.editorialArtworkAssetId,
    );
    const editorialVideoAssetId = this.string(
      payload.editorialVideoAssetId,
    );
    const usages = [
      ...(artworkAssetId
        ? [{
            slot: 'artwork',
            assetId: artworkAssetId,
            expectedKind: AssetKind.ASSET_KIND_IMAGE,
            expectedPurpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
          }]
        : []),
      ...(editorialArtworkAssetId
        ? [
            {
              slot: 'editorial_artwork',
              assetId: editorialArtworkAssetId,
              expectedKind: AssetKind.ASSET_KIND_IMAGE,
              expectedPurpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
            },
          ]
        : []),
      ...(editorialVideoAssetId
        ? [
            {
              slot: 'editorial_video',
              assetId: editorialVideoAssetId,
              expectedKind: AssetKind.ASSET_KIND_VIDEO,
              expectedPurpose:
                AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO,
            },
          ]
        : []),
    ];
    let assets: Asset[];
    try {
      const response = await firstValueFrom(
        this.client.registerAssetUsages(
          {
            ownerService: 'catalog',
            ownerType: resourceType,
            ownerId: resourceId,
            usages,
          },
          this.metadata(),
        ),
      );
      assets = response.assets;
    } catch {
      this.failedPrecondition('CATALOG_ASSET_REGISTRATION_FAILED');
    }
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const artworkAsset = this.asset(
      byId,
      artworkAssetId,
      AssetKind.ASSET_KIND_IMAGE,
      AssetPurpose.ASSET_PURPOSE_ARTWORK,
    );
    const editorialArtworkAsset = this.asset(
      byId,
      editorialArtworkAssetId,
      AssetKind.ASSET_KIND_IMAGE,
      AssetPurpose.ASSET_PURPOSE_ARTWORK,
    );
    const editorialVideoAsset = this.asset(
      byId,
      editorialVideoAssetId,
      AssetKind.ASSET_KIND_VIDEO,
      AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO,
    );
    const authoredEditorialArtwork = this.object(payload.editorialArtwork);
    const resolvedEditorialArtwork = editorialArtworkAsset
      ? {
          ...authoredEditorialArtwork,
          primary: this.artwork(editorialArtworkAsset),
        }
      : Object.keys(authoredEditorialArtwork).length > 0
        ? authoredEditorialArtwork
        : null;

    return {
      usages,
      payload: {
        ...payload,
        artwork: artworkAsset ? this.artwork(artworkAsset) : null,
        editorialArtwork: resolvedEditorialArtwork,
        editorialVideo: editorialVideoAsset
          ? this.editorialVideo(editorialVideoAsset)
          : null,
      },
    };
  }

  async reconcileUsages(
    resourceType: string,
    resourceId: string,
    usages: CatalogAssetUsage[],
  ): Promise<void> {
    await firstValueFrom(
      this.client.reconcileAssetUsages(
        {
          ownerService: 'catalog',
          ownerType: resourceType,
          ownerId: resourceId,
          usages,
        },
        this.metadata(),
      ),
    );
  }

  private asset(
    assets: Map<string, Asset>,
    assetId: string,
    kind: AssetKind,
    purpose: AssetPurpose,
  ): Asset | undefined {
    if (!assetId) return undefined;
    const asset = assets.get(assetId);
    if (!asset) {
      this.failedPrecondition(`CATALOG_ASSET_NOT_FOUND:${assetId}`);
    }
    if (asset.status !== AssetStatus.ASSET_STATUS_READY) {
      this.failedPrecondition(`CATALOG_ASSET_NOT_READY:${assetId}`);
    }
    if (asset.kind !== kind || asset.purpose !== purpose) {
      this.failedPrecondition(`CATALOG_ASSET_TYPE_MISMATCH:${assetId}`);
    }
    if (!asset.publicUrl) {
      this.failedPrecondition(`CATALOG_ASSET_URL_MISSING:${assetId}`);
    }
    return asset;
  }

  private artwork(asset: Asset): JsonObject {
    const primary = this.primaryRendition(asset);
    const variants = this.object(asset.variants);
    const palette = this.object(variants.palette);
    return {
      assetId: asset.id,
      url: primary.url,
      width: primary.width,
      height: primary.height,
      bgColor: this.string(palette.bgColor),
      textColor1: this.string(palette.textColor1),
      textColor2: this.string(palette.textColor2),
      textColor3: this.string(palette.textColor3),
      textColor4: this.string(palette.textColor4),
      hasP3: palette.hasP3 === true,
      variants,
    };
  }

  private editorialVideo(asset: Asset): JsonObject {
    const variants = this.object(asset.variants);
    const poster = this.object(variants.poster);
    const previewFrame =
      this.string(poster.url) && this.number(poster.width) > 0
        ? {
            assetId: asset.id,
            url: this.string(poster.url),
            width: this.number(poster.width),
            height: this.number(poster.height),
          }
        : undefined;

    return {
      primary: {
        assetId: asset.id,
        video: asset.publicUrl,
        durationMillis: asset.durationMillis,
        width: asset.width,
        height: asset.height,
        previewFrame,
        variants,
      },
    };
  }

  private primaryRendition(asset: Asset): {
    url: string;
    width: number;
    height: number;
  } {
    const variants = this.object(asset.variants);
    const renditions = Array.isArray(variants.renditions)
      ? variants.renditions.map((item) => this.object(item))
      : [];
    const primary = renditions
      .filter((item) => this.string(item.url))
      .sort((left, right) => this.number(right.width) - this.number(left.width))
      .at(0);

    return {
      url: primary ? this.string(primary.url) : asset.publicUrl,
      width: primary ? this.number(primary.width) : asset.width,
      height: primary ? this.number(primary.height) : asset.height,
    };
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
