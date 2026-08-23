import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { GenerationLease } from './generation-lease.types';

const DEFAULT_LEASE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_RENEW_INTERVAL_MS = 60 * 1000;

type LeaseRow = { leaseToken: string };

@Injectable()
export class GenerationLeaseService {
  private readonly logger = new Logger(GenerationLeaseService.name);
  readonly ttlMs: number;
  readonly renewIntervalMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ttlMs = this.duration(
      config.get<string>('RECOMMENDATION_GENERATION_LEASE_TTL_MS'),
      DEFAULT_LEASE_TTL_MS,
    );
    this.renewIntervalMs = Math.min(
      this.duration(
        config.get<string>('RECOMMENDATION_GENERATION_LEASE_RENEW_INTERVAL_MS'),
        DEFAULT_RENEW_INTERVAL_MS,
      ),
      Math.floor(this.ttlMs / 2),
    );
  }

  async acquire(leaseKey: string): Promise<GenerationLease | null> {
    const leaseToken = randomUUID();
    const rows = await this.prisma.$queryRaw<LeaseRow[]>`
      INSERT INTO "recommendation_generation_leases" (
        "leaseKey", "leaseToken", "expiresAt", "createdAt", "updatedAt"
      )
      VALUES (
        ${leaseKey},
        ${leaseToken},
        clock_timestamp() + (${this.ttlMs} * interval '1 millisecond'),
        now(),
        now()
      )
      ON CONFLICT ("leaseKey") DO UPDATE
      SET
        "leaseToken" = EXCLUDED."leaseToken",
        "expiresAt" = EXCLUDED."expiresAt",
        "updatedAt" = now()
      WHERE "recommendation_generation_leases"."expiresAt" <= clock_timestamp()
      RETURNING "leaseToken"
    `;

    return rows[0]?.leaseToken === leaseToken ? { leaseKey, leaseToken } : null;
  }

  async renew(lease: GenerationLease): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<LeaseRow[]>`
      UPDATE "recommendation_generation_leases"
      SET
        "expiresAt" = clock_timestamp() + (${this.ttlMs} * interval '1 millisecond'),
        "updatedAt" = now()
      WHERE "leaseKey" = ${lease.leaseKey}
        AND "leaseToken" = ${lease.leaseToken}
        AND "expiresAt" > clock_timestamp()
      RETURNING "leaseToken"
    `;
    return rows[0]?.leaseToken === lease.leaseToken;
  }

  async isHeld(lease: GenerationLease): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<LeaseRow[]>`
      SELECT "leaseToken"
      FROM "recommendation_generation_leases"
      WHERE "leaseKey" = ${lease.leaseKey}
        AND "leaseToken" = ${lease.leaseToken}
        AND "expiresAt" > clock_timestamp()
    `;
    return rows[0]?.leaseToken === lease.leaseToken;
  }

  async release(lease: GenerationLease): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM "recommendation_generation_leases"
        WHERE "leaseKey" = ${lease.leaseKey}
          AND "leaseToken" = ${lease.leaseToken}
      `;
    } catch (error) {
      this.logger.warn(
        `Failed to release recommendation generation lease ${lease.leaseKey}: ${String(error)}`,
      );
    }
  }

  private duration(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
