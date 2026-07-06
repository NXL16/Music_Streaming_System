import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import {
  Asset as AssetMessage,
  AssetKind,
  AssetPurpose,
  AssetResponse,
  AssetStatus,
  DeleteAssetRequest,
  DeleteAssetResponse,
  FinalizeAssetUploadRequest,
  GetAssetRequest,
  ListAssetsRequest,
  ListAssetsResponse,
  ListAssetUsagesResponse,
  RegisterAssetUsagesResponse,
  RequestAssetUploadRequest,
  RequestAssetUploadResponse,
  SyncAssetUsagesRequest,
  SyncAssetUsagesResponse,
  UpdateAssetProcessingResultRequest,
} from '@musical/shared-proto';
import { PrismaService } from '../database/prisma.service';
import {
  Asset,
  AssetKind as PrismaAssetKind,
  AssetPurpose as PrismaAssetPurpose,
  AssetStatus as PrismaAssetStatus,
  Prisma,
} from '../generated/prisma/client';
import { StorageService } from '../storage/storage.service';

const MAX_LIST_LIMIT = 100;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
const VIDEO_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async requestUpload(
    request: RequestAssetUploadRequest,
  ): Promise<RequestAssetUploadResponse> {
    const kind = this.kind(request.kind);
    const purpose = this.purpose(request.purpose);
    const filename = this.filename(request.filename);
    const contentType = request.contentType.trim().toLowerCase();
    const checksum = request.checksum.trim().toLowerCase();
    const sizeBytes = Number(request.sizeBytes);

    this.requireText(request.actorUserId, 'actor_user_id', 128);
    this.validateUpload(kind, purpose, contentType, checksum, sizeBytes);

    const existing = await this.prisma.asset.findUnique({
      where: { kind_purpose_checksum: { kind, purpose, checksum } },
    });

    if (
      existing &&
      existing.status !== PrismaAssetStatus.FAILED &&
      existing.status !== PrismaAssetStatus.DELETED
    ) {
      const needsUpload =
        existing.status === PrismaAssetStatus.PENDING_UPLOAD;
      return {
        asset: this.assetMessage(existing),
        uploadUrl: needsUpload
          ? await this.storage.createUploadUrl(
              existing.sourceObjectKey,
              existing.contentType,
            )
          : '',
        instant: !needsUpload,
      };
    }

    const objectKey = this.objectKey(kind, checksum, filename);
    const asset = existing
      ? await this.prisma.asset.update({
          where: { id: existing.id },
          data: {
            status: PrismaAssetStatus.PENDING_UPLOAD,
            filename,
            contentType,
            sizeBytes: BigInt(sizeBytes),
            sourceObjectKey: objectKey,
            publicUrl: '',
            width: 0,
            height: 0,
            durationMillis: 0,
            variants: Prisma.DbNull,
            errorMessage: '',
            createdBy: request.actorUserId,
          },
        })
      : await this.prisma.asset.create({
          data: {
            kind,
            purpose,
            filename,
            contentType,
            checksum,
            sizeBytes: BigInt(sizeBytes),
            sourceObjectKey: objectKey,
            createdBy: request.actorUserId,
          },
        });

    return {
      asset: this.assetMessage(asset),
      uploadUrl: await this.storage.createUploadUrl(objectKey, contentType),
      instant: false,
    };
  }

  async finalizeUpload(
    request: FinalizeAssetUploadRequest,
  ): Promise<AssetResponse> {
    this.requireText(request.actorUserId, 'actor_user_id', 128);
    const asset = await this.findAsset(request.assetId, true);
    if (asset.status === PrismaAssetStatus.READY) {
      return { asset: this.assetMessage(asset) };
    }
    if (asset.status === PrismaAssetStatus.PROCESSING) {
      return { asset: this.assetMessage(asset) };
    }

    const object = await this.storage.head(asset.sourceObjectKey);
    if (object.contentLength !== Number(asset.sizeBytes)) {
      this.failedPrecondition('ASSET_UPLOAD_SIZE_MISMATCH');
    }
    if (
      object.contentType &&
      object.contentType.toLowerCase() !== asset.contentType
    ) {
      this.failedPrecondition('ASSET_UPLOAD_CONTENT_TYPE_MISMATCH');
    }

    const processing = await this.prisma.$transaction(async (tx) => {
      await this.lockAssets(tx, [asset.id]);
      const current = await tx.asset.findUnique({
        where: { id: asset.id },
      });
      if (!current || current.status === PrismaAssetStatus.DELETED) {
        this.failedPrecondition('ASSET_NOT_FINALIZABLE');
      }
      if (
        current.status === PrismaAssetStatus.READY ||
        current.status === PrismaAssetStatus.PROCESSING
      ) {
        return current;
      }
      const updated = await tx.asset.update({
        where: { id: asset.id },
        data: {
          status: PrismaAssetStatus.PROCESSING,
          errorMessage: '',
        },
      });
      await tx.assetProcessingJob.upsert({
        where: { assetId: asset.id },
        create: { assetId: asset.id },
        update: {
          availableAt: new Date(),
          lockedAt: null,
          lastError: '',
        },
      });
      return updated;
    });

    return { asset: this.assetMessage(processing) };
  }

  async getAsset(request: GetAssetRequest): Promise<AssetResponse> {
    return { asset: this.assetMessage(await this.findAsset(request.assetId)) };
  }

  async listAssets(request: ListAssetsRequest): Promise<ListAssetsResponse> {
    this.requireText(request.actorUserId, 'actor_user_id', 128);
    const limit = Math.min(Math.max(request.limit || 20, 1), MAX_LIST_LIMIT);
    const assets = await this.prisma.asset.findMany({
      where: {
        kind: this.optionalKind(request.kind),
        purpose: this.optionalPurpose(request.purpose),
        status: this.optionalStatus(request.status),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: request.cursor ? { id: request.cursor } : undefined,
      skip: request.cursor ? 1 : 0,
      take: limit + 1,
    });
    const hasMore = assets.length > limit;
    const page = assets.slice(0, limit);
    return {
      assets: page.map((asset) => this.assetMessage(asset)),
      hasMore,
      nextCursor: hasMore ? page.at(-1)?.id ?? '' : '',
    };
  }

  async deleteAsset(
    request: DeleteAssetRequest,
  ): Promise<DeleteAssetResponse> {
    this.requireText(request.actorUserId, 'actor_user_id', 128);
    const asset = await this.findAsset(request.assetId, true);

    await this.prisma.$transaction(async (tx) => {
      await this.lockAssets(tx, [asset.id]);
      const current = await tx.asset.findUnique({
        where: { id: asset.id },
        select: { status: true },
      });
      if (!current) this.notFound('ASSET_NOT_FOUND');
      if (current.status === PrismaAssetStatus.PROCESSING) {
        this.failedPrecondition('ASSET_PROCESSING_IN_PROGRESS');
      }
      const usageCount = await tx.assetUsage.count({
        where: { assetId: asset.id },
      });
      if (usageCount > 0) {
        this.failedPrecondition('ASSET_IN_USE');
      }
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: PrismaAssetStatus.DELETED },
      });
    });

    await this.storage.deleteMany([
      asset.sourceObjectKey,
      ...this.variantObjectKeys(asset.variants),
    ]);
    await this.storage.deletePrefix(`processed/${asset.id}/`);
    await this.prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: PrismaAssetStatus.DELETED,
        publicUrl: '',
        variants: Prisma.DbNull,
      },
    });
    return { success: true };
  }

  async registerUsages(
    request: SyncAssetUsagesRequest,
  ): Promise<RegisterAssetUsagesResponse> {
    const usages = this.validatedUsages(request, false);
    const assetIds = usages.map(({ assetId }) => assetId);
    const assets = await this.prisma.$transaction(async (tx) => {
      await this.lockAssets(tx, assetIds);
      const records = await tx.asset.findMany({
        where: { id: { in: assetIds } },
      });
      this.assertReadyAssets(usages, records);
      await tx.assetUsage.createMany({
        data: usages.map(({ slot, assetId }) => ({
          assetId,
          slot,
          ownerService: request.ownerService,
          ownerType: request.ownerType,
          ownerId: request.ownerId,
        })),
        skipDuplicates: true,
      });
      return records;
    });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return {
      assets: assetIds.flatMap((assetId) => {
        const asset = byId.get(assetId);
        return asset ? [this.assetMessage(asset)] : [];
      }),
    };
  }

  async reconcileUsages(
    request: SyncAssetUsagesRequest,
  ): Promise<SyncAssetUsagesResponse> {
    const usages = this.validatedUsages(request, true);
    const assetIds = usages.map(({ assetId }) => assetId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockAssets(tx, assetIds);
      if (assetIds.length > 0) {
        const assets = await tx.asset.findMany({
          where: { id: { in: assetIds } },
        });
        this.assertReadyAssets(usages, assets);
        await tx.assetUsage.createMany({
          data: usages.map(({ slot, assetId }) => ({
            assetId,
            slot,
            ownerService: request.ownerService,
            ownerType: request.ownerType,
            ownerId: request.ownerId,
          })),
          skipDuplicates: true,
        });
      }

      const current = await tx.assetUsage.findMany({
        where: {
          ownerService: request.ownerService,
          ownerType: request.ownerType,
          ownerId: request.ownerId,
        },
        select: { id: true, slot: true, assetId: true },
      });
      const keep = new Set(
        usages.map(({ slot, assetId }) => `${slot}\u001f${assetId}`),
      );
      const staleIds = current
        .filter(({ slot, assetId }) => !keep.has(`${slot}\u001f${assetId}`))
        .map(({ id }) => id);
      if (staleIds.length > 0) {
        await tx.assetUsage.deleteMany({ where: { id: { in: staleIds } } });
      }
    });
    return { success: true };
  }

  async listUsages(
    request: GetAssetRequest,
  ): Promise<ListAssetUsagesResponse> {
    const asset = await this.findAsset(request.assetId, true);
    const usages = await this.prisma.assetUsage.findMany({
      where: { assetId: asset.id },
      orderBy: [
        { ownerService: 'asc' },
        { ownerType: 'asc' },
        { ownerId: 'asc' },
        { slot: 'asc' },
      ],
    });
    return {
      usages: usages.map((usage) => ({
        id: usage.id,
        assetId: usage.assetId,
        ownerService: usage.ownerService,
        ownerType: usage.ownerType,
        ownerId: usage.ownerId,
        slot: usage.slot,
        createdAt: usage.createdAt.toISOString(),
        updatedAt: usage.updatedAt.toISOString(),
      })),
    };
  }

  async updateProcessingResult(
    request: UpdateAssetProcessingResultRequest,
  ): Promise<AssetResponse> {
    const asset = await this.findAsset(request.assetId, true);
    if (asset.status !== PrismaAssetStatus.PROCESSING) {
      this.failedPrecondition('ASSET_NOT_PROCESSING');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.asset.update({
        where: { id: asset.id },
        data: request.success
          ? {
              status: PrismaAssetStatus.READY,
              publicUrl: request.publicUrl.trim(),
              width: Math.max(0, request.width),
              height: Math.max(0, request.height),
              durationMillis: Math.max(0, request.durationMillis),
              variants: this.jsonNullable(request.variants),
              errorMessage: '',
            }
          : {
              status: PrismaAssetStatus.FAILED,
              errorMessage:
                request.errorMessage.trim() || 'ASSET_PROCESSING_FAILED',
            },
      });
      await tx.assetProcessingJob.deleteMany({ where: { assetId: asset.id } });
      return result;
    });
    return { asset: this.assetMessage(updated) };
  }

  private validateUpload(
    kind: PrismaAssetKind,
    purpose: PrismaAssetPurpose,
    contentType: string,
    checksum: string,
    sizeBytes: number,
  ): void {
    if (!/^[a-f0-9]{64}$/.test(checksum)) {
      this.invalidArgument('checksum must be a SHA-256 hex string');
    }
    const allowedTypes =
      kind === PrismaAssetKind.IMAGE ? IMAGE_TYPES : VIDEO_TYPES;
    if (!allowedTypes.has(contentType)) {
      this.invalidArgument('content_type is not supported for asset kind');
    }
    if (
      (kind === PrismaAssetKind.IMAGE &&
        purpose !== PrismaAssetPurpose.ARTWORK) ||
      (kind === PrismaAssetKind.VIDEO &&
        purpose !== PrismaAssetPurpose.EDITORIAL_VIDEO)
    ) {
      this.invalidArgument('asset kind and purpose are incompatible');
    }
    const maxBytes =
      kind === PrismaAssetKind.IMAGE ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
      this.invalidArgument(`size_bytes must be between 1 and ${maxBytes}`);
    }
  }

  private validatedUsages(
    request: SyncAssetUsagesRequest,
    allowEmpty: boolean,
  ): Array<{
    slot: string;
    assetId: string;
    expectedKind: PrismaAssetKind;
    expectedPurpose: PrismaAssetPurpose;
  }> {
    this.requireText(request.ownerService, 'owner_service', 64);
    this.requireText(request.ownerType, 'owner_type', 64);
    this.requireText(request.ownerId, 'owner_id', 128);
    const usages = request.usages ?? [];
    if ((!allowEmpty && usages.length === 0) || usages.length > 20) {
      this.invalidArgument('usages must contain between 1 and 20 entries');
    }

    const slots = new Set<string>();
    return usages.map((usage) => {
      const slot = usage.slot.trim();
      const assetId = usage.assetId.trim();
      this.requireText(slot, 'usages.slot', 64);
      this.requireText(assetId, 'usages.asset_id', 128);
      if (slots.has(slot)) {
        this.invalidArgument('usages must have unique slots');
      }
      slots.add(slot);
      return {
        slot,
        assetId,
        expectedKind: this.kind(usage.expectedKind),
        expectedPurpose: this.purpose(usage.expectedPurpose),
      };
    });
  }

  private assertReadyAssets(
    usages: Array<{
      assetId: string;
      expectedKind: PrismaAssetKind;
      expectedPurpose: PrismaAssetPurpose;
    }>,
    assets: Asset[],
  ): void {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    if (byId.size !== new Set(usages.map(({ assetId }) => assetId)).size) {
      this.failedPrecondition('ASSET_USAGE_REQUIRES_READY_ASSETS');
    }
    for (const usage of usages) {
      const asset = byId.get(usage.assetId);
      if (
        !asset ||
        asset.status !== PrismaAssetStatus.READY ||
        asset.kind !== usage.expectedKind ||
        asset.purpose !== usage.expectedPurpose
      ) {
        this.failedPrecondition('ASSET_USAGE_TYPE_OR_STATUS_MISMATCH');
      }
    }
  }

  private async lockAssets(
    tx: Prisma.TransactionClient,
    assetIds: string[],
  ): Promise<void> {
    const ids = [...new Set(assetIds)].sort();
    if (ids.length === 0) return;
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "assets"
      WHERE "id" IN (${Prisma.join(ids)})
      ORDER BY "id"
      FOR UPDATE
    `);
  }

  private async findAsset(
    assetId: string,
    includeDeleted = false,
  ): Promise<Asset> {
    this.requireText(assetId, 'asset_id', 128);
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (
      !asset ||
      (!includeDeleted && asset.status === PrismaAssetStatus.DELETED)
    ) {
      this.notFound('ASSET_NOT_FOUND');
    }
    return asset;
  }

  private assetMessage(asset: Asset): AssetMessage {
    return {
      id: asset.id,
      kind:
        asset.kind === PrismaAssetKind.IMAGE
          ? AssetKind.ASSET_KIND_IMAGE
          : AssetKind.ASSET_KIND_VIDEO,
      purpose:
        asset.purpose === PrismaAssetPurpose.ARTWORK
          ? AssetPurpose.ASSET_PURPOSE_ARTWORK
          : AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO,
      status: this.status(asset.status),
      filename: asset.filename,
      contentType: asset.contentType,
      checksum: asset.checksum,
      sizeBytes: Number(asset.sizeBytes),
      sourceObjectKey: asset.sourceObjectKey,
      publicUrl: asset.publicUrl,
      width: asset.width,
      height: asset.height,
      durationMillis: asset.durationMillis,
      variants: this.wrapStruct(asset.variants),
      errorMessage: asset.errorMessage,
      createdBy: asset.createdBy,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
  }

  private kind(value: AssetKind): PrismaAssetKind {
    const result = this.optionalKind(value);
    if (!result) this.invalidArgument('kind is required');
    return result;
  }

  private optionalKind(value: AssetKind): PrismaAssetKind | undefined {
    if (value === AssetKind.ASSET_KIND_IMAGE) return PrismaAssetKind.IMAGE;
    if (value === AssetKind.ASSET_KIND_VIDEO) return PrismaAssetKind.VIDEO;
    return undefined;
  }

  private purpose(value: AssetPurpose): PrismaAssetPurpose {
    const result = this.optionalPurpose(value);
    if (!result) this.invalidArgument('purpose is required');
    return result;
  }

  private optionalPurpose(
    value: AssetPurpose,
  ): PrismaAssetPurpose | undefined {
    if (value === AssetPurpose.ASSET_PURPOSE_ARTWORK) {
      return PrismaAssetPurpose.ARTWORK;
    }
    if (value === AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO) {
      return PrismaAssetPurpose.EDITORIAL_VIDEO;
    }
    return undefined;
  }

  private optionalStatus(value: AssetStatus): PrismaAssetStatus | undefined {
    const statuses: Partial<Record<AssetStatus, PrismaAssetStatus>> = {
      [AssetStatus.ASSET_STATUS_PENDING_UPLOAD]:
        PrismaAssetStatus.PENDING_UPLOAD,
      [AssetStatus.ASSET_STATUS_PROCESSING]: PrismaAssetStatus.PROCESSING,
      [AssetStatus.ASSET_STATUS_READY]: PrismaAssetStatus.READY,
      [AssetStatus.ASSET_STATUS_FAILED]: PrismaAssetStatus.FAILED,
      [AssetStatus.ASSET_STATUS_DELETED]: PrismaAssetStatus.DELETED,
    };
    return statuses[value];
  }

  private status(value: PrismaAssetStatus): AssetStatus {
    return {
      [PrismaAssetStatus.PENDING_UPLOAD]:
        AssetStatus.ASSET_STATUS_PENDING_UPLOAD,
      [PrismaAssetStatus.PROCESSING]: AssetStatus.ASSET_STATUS_PROCESSING,
      [PrismaAssetStatus.READY]: AssetStatus.ASSET_STATUS_READY,
      [PrismaAssetStatus.FAILED]: AssetStatus.ASSET_STATUS_FAILED,
      [PrismaAssetStatus.DELETED]: AssetStatus.ASSET_STATUS_DELETED,
    }[value];
  }

  private filename(value: string): string {
    const filename = value.trim();
    this.requireText(filename, 'filename', 255);
    return filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
  }

  private objectKey(
    kind: PrismaAssetKind,
    checksum: string,
    filename: string,
  ): string {
    return `assets/${kind.toLowerCase()}/${checksum.slice(0, 2)}/${checksum}/${filename}`;
  }

  private jsonNullable(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    if (!value || typeof value !== 'object') return Prisma.DbNull;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private wrapStruct(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value;
  }

  private variantObjectKeys(
    value: Prisma.JsonValue | null | undefined,
  ): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.variantObjectKeys(item));
    }
    if (!value || typeof value !== 'object') return [];

    return Object.entries(value).flatMap(([key, item]) => {
      if (key === 'objectKey' && typeof item === 'string') return [item];
      return this.variantObjectKeys(item);
    });
  }

  private requireText(value: string, field: string, maxLength: number): void {
    if (!value?.trim()) this.invalidArgument(`${field} is required`);
    if (value.length > maxLength) {
      this.invalidArgument(`${field} must not exceed ${maxLength} characters`);
    }
  }

  private invalidArgument(message: string): never {
    throw new RpcException({ code: status.INVALID_ARGUMENT, message });
  }

  private failedPrecondition(message: string): never {
    throw new RpcException({ code: status.FAILED_PRECONDITION, message });
  }

  private notFound(message: string): never {
    throw new RpcException({ code: status.NOT_FOUND, message });
  }
}
