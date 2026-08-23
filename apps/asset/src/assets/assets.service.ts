import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
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
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const DEFAULT_ARTIFACT_CLEANUP_LOCK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FAILED_ARTIFACT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
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
  private readonly artifactCleanupLockTtlMs: number;
  private readonly failedArtifactRetentionMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.artifactCleanupLockTtlMs = this.positiveInteger(
      config.get<string>('ASSET_ARTIFACT_CLEANUP_LOCK_TTL_MS'),
      DEFAULT_ARTIFACT_CLEANUP_LOCK_TTL_MS,
    );
    this.failedArtifactRetentionMs = this.positiveInteger(
      config.get<string>('ASSET_FAILED_ARTIFACT_RETENTION_MS'),
      DEFAULT_FAILED_ARTIFACT_RETENTION_MS,
    );
  }

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
      where: {
        kind_purpose_checksum_createdBy: {
          kind,
          purpose,
          checksum,
          createdBy: request.actorUserId,
        },
      },
    });

    if (
      existing &&
      existing.status !== PrismaAssetStatus.FAILED &&
      existing.status !== PrismaAssetStatus.DELETED
    ) {
      return this.uploadResponse(existing);
    }

    const objectKey = this.objectKey(
      kind,
      purpose,
      request.actorUserId,
      checksum,
      filename,
    );
    const asset = existing
      ? await this.prisma.$transaction(async (tx) => {
          await this.lockAssets(tx, [existing.id]);
          const current = await tx.asset.findUnique({
            where: { id: existing.id },
          });
          if (!current) this.notFound('ASSET_NOT_FOUND');
          if (
            current.status !== PrismaAssetStatus.FAILED &&
            current.status !== PrismaAssetStatus.DELETED
          ) {
            return current;
          }

          await this.cancelArtifactCleanup(tx, current.id);
          return tx.asset.update({
            where: { id: current.id },
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
          });
        })
      : await this.createAssetOrReadConcurrent(
          {
            kind,
            purpose,
            checksum,
            createdBy: request.actorUserId,
          },
          {
            kind,
            purpose,
            filename,
            contentType,
            checksum,
            sizeBytes: BigInt(sizeBytes),
            sourceObjectKey: objectKey,
            createdBy: request.actorUserId,
          },
        );

    return this.uploadResponse(asset);
  }

  async finalizeUpload(
    request: FinalizeAssetUploadRequest,
  ): Promise<AssetResponse> {
    this.requireText(request.actorUserId, 'actor_user_id', 128);
    const asset = await this.findAsset(request.assetId, true);
    if (asset.createdBy !== request.actorUserId) {
      this.forbidden('ASSET_ACCESS_DENIED');
    }
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
      await this.cancelArtifactCleanup(tx, current.id);
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
          leaseToken: null,
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
        select: { status: true, sourceObjectKey: true },
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
      if (current.status === PrismaAssetStatus.DELETED) return;
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          status: PrismaAssetStatus.DELETED,
          publicUrl: '',
          variants: Prisma.DbNull,
        },
      });
      await this.enqueueArtifactCleanup(
        tx,
        asset.id,
        current.sourceObjectKey,
        new Date(),
      );
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
        purpose !== PrismaAssetPurpose.ARTWORK &&
        purpose !== PrismaAssetPurpose.PROFILE_AVATAR) ||
      (kind === PrismaAssetKind.VIDEO &&
        purpose !== PrismaAssetPurpose.EDITORIAL_VIDEO)
    ) {
      this.invalidArgument('asset kind and purpose are incompatible');
    }
    const maxBytes =
      purpose === PrismaAssetPurpose.PROFILE_AVATAR
        ? MAX_AVATAR_BYTES
        : kind === PrismaAssetKind.IMAGE
          ? MAX_IMAGE_BYTES
          : MAX_VIDEO_BYTES;
    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > maxBytes
    ) {
      this.invalidArgument(`size_bytes must be between 1 and ${maxBytes}`);
    }
  }

  private async uploadResponse(
    asset: Asset,
  ): Promise<RequestAssetUploadResponse> {
    const needsUpload = asset.status === PrismaAssetStatus.PENDING_UPLOAD;
    return {
      asset: this.assetMessage(asset),
      uploadUrl: needsUpload
        ? await this.storage.createUploadUrl(
            asset.sourceObjectKey,
            asset.contentType,
          )
        : '',
      instant: !needsUpload,
    };
  }

  private async createAssetOrReadConcurrent(
    unique: {
      kind: PrismaAssetKind;
      purpose: PrismaAssetPurpose;
      checksum: string;
      createdBy: string;
    },
    data: Prisma.AssetCreateInput,
  ): Promise<Asset> {
    try {
      return await this.prisma.asset.create({ data });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) throw error;

      const concurrentAsset = await this.prisma.asset.findUnique({
        where: { kind_purpose_checksum_createdBy: unique },
      });
      if (concurrentAsset) return concurrentAsset;
      throw error;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
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

  /**
   * Asset mutations lock the asset before this job. The retention sweep uses
   * the same order, so a retry either cancels a pending cleanup atomically or
   * receives a clear precondition error while R2 deletion is in flight.
   */
  private async cancelArtifactCleanup(
    tx: Prisma.TransactionClient,
    assetId: string,
  ): Promise<void> {
    const cleanup = await this.lockArtifactCleanupJob(tx, assetId);
    if (cleanup?.active) {
      this.failedPrecondition('ASSET_ARTIFACT_CLEANUP_IN_PROGRESS');
    }
    if (cleanup) {
      await tx.assetArtifactCleanupJob.deleteMany({ where: { assetId } });
    }
  }

  private async enqueueArtifactCleanup(
    tx: Prisma.TransactionClient,
    assetId: string,
    sourceObjectKey: string,
    availableAt: Date,
  ): Promise<void> {
    await tx.assetArtifactCleanupJob.upsert({
      where: { assetId },
      create: { assetId, sourceObjectKey, availableAt },
      update: {
        sourceObjectKey,
        availableAt,
        lockedAt: null,
        leaseToken: null,
        lastError: '',
      },
    });
  }

  private async lockArtifactCleanupJob(
    tx: Prisma.TransactionClient,
    assetId: string,
  ): Promise<{ active: boolean } | undefined> {
    const jobs = await tx.$queryRaw<Array<{ active: boolean }>>(Prisma.sql`
      SELECT COALESCE(
        "leaseToken" IS NOT NULL
        AND "lockedAt" >= clock_timestamp() - (${this.artifactCleanupLockTtlMs} * INTERVAL '1 millisecond'),
        false
      ) AS "active"
      FROM "asset_artifact_cleanup_jobs"
      WHERE "assetId" = ${assetId}
      FOR UPDATE
    `);
    return jobs[0];
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
          : asset.purpose === PrismaAssetPurpose.PROFILE_AVATAR
            ? AssetPurpose.ASSET_PURPOSE_PROFILE_AVATAR
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
    if (value === AssetPurpose.ASSET_PURPOSE_PROFILE_AVATAR) {
      return PrismaAssetPurpose.PROFILE_AVATAR;
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
    purpose: PrismaAssetPurpose,
    createdBy: string,
    checksum: string,
    filename: string,
  ): string {
    const ownerKey = createHash('sha256').update(createdBy).digest('hex').slice(0, 16);
    return `assets/${kind.toLowerCase()}/${purpose.toLowerCase()}/${ownerKey}/${checksum.slice(0, 2)}/${checksum}/${filename}`;
  }

  private wrapStruct(
    value: Prisma.JsonValue | null,
  ): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value;
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

  private forbidden(message: string): never {
    throw new RpcException({ code: status.PERMISSION_DENIED, message });
  }

  private notFound(message: string): never {
    throw new RpcException({ code: status.NOT_FOUND, message });
  }

  private positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
