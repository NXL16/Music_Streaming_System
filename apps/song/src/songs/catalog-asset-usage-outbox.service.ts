import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CatalogAssetsService,
  CatalogAssetUsage,
} from './catalog-assets.service';

interface ClaimedUsageSync {
  id: string;
  resourceType: string;
  resourceId: string;
  attempts: number;
  usages: Prisma.JsonValue;
}

@Injectable()
export class CatalogAssetUsageOutboxService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CatalogAssetUsageOutboxService.name);
  private readonly pollIntervalMs: number;
  private readonly lockTtlMs: number;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogAssets: CatalogAssetsService,
    config: ConfigService,
  ) {
    this.pollIntervalMs = this.integer(
      config.get<string>('CATALOG_ASSET_SYNC_POLL_INTERVAL_MS'),
      2000,
    );
    this.lockTtlMs = this.integer(
      config.get<string>('CATALOG_ASSET_SYNC_LOCK_TTL_MS'),
      60_000,
    );
  }

  onModuleInit(): void {
    this.schedule(0);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      const job = await this.claim();
      if (!job) {
        this.schedule(this.pollIntervalMs);
        return;
      }
      await this.process(job);
      this.schedule(0);
    } catch (error) {
      this.logger.error('Catalog asset usage sync failed', error);
      this.schedule(this.pollIntervalMs);
    }
  }

  private async claim(): Promise<ClaimedUsageSync | undefined> {
    const jobs = await this.prisma.$queryRaw<ClaimedUsageSync[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id"
        FROM "catalog_asset_usage_outbox"
        WHERE "availableAt" <= NOW()
          AND (
            "lockedAt" IS NULL
            OR "lockedAt" < NOW() - (${this.lockTtlMs} * INTERVAL '1 millisecond')
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "catalog_asset_usage_outbox" AS job
      SET
        "lockedAt" = NOW(),
        "attempts" = job."attempts" + 1,
        "updatedAt" = NOW()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING
        job."id",
        job."resourceType",
        job."resourceId",
        job."attempts",
        job."usages"
    `);
    return jobs[0];
  }

  private async process(job: ClaimedUsageSync): Promise<void> {
    try {
      await this.catalogAssets.reconcileUsages(
        job.resourceType,
        job.resourceId,
        this.usages(job.usages),
      );
      await this.prisma.catalogAssetUsageOutbox.deleteMany({
        where: { id: job.id },
      });
    } catch (error) {
      const message = this.errorMessage(error);
      const retryDelayMs = Math.min(
        60 * 60 * 1000,
        5000 * 2 ** Math.min(job.attempts - 1, 10),
      );
      await this.prisma.catalogAssetUsageOutbox.updateMany({
        where: { id: job.id },
        data: {
          lockedAt: null,
          availableAt: new Date(Date.now() + retryDelayMs),
          lastError: message,
        },
      });
      this.logger.warn(
        `Usage sync ${job.id} attempt ${job.attempts} failed: ${message}`,
      );
    }
  }

  private usages(value: Prisma.JsonValue): CatalogAssetUsage[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const slot = typeof item.slot === 'string' ? item.slot : '';
      const assetId = typeof item.assetId === 'string' ? item.assetId : '';
      const expectedKind =
        typeof item.expectedKind === 'number' ? item.expectedKind : 0;
      const expectedPurpose =
        typeof item.expectedPurpose === 'number' ? item.expectedPurpose : 0;
      return slot && assetId
        ? [{ slot, assetId, expectedKind, expectedPurpose }]
        : [];
    });
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 2000) || 'CATALOG_ASSET_USAGE_SYNC_FAILED';
  }

  private integer(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
