import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Metadata } from '@grpc/grpc-js';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import {
  RECOMMENDATION,
  type RecommendationServiceClient,
} from '@musical/shared-proto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';

type ClaimedPreference = {
  id: string;
  eventId: string;
  userId: string;
  eventType: number;
  resourceType: string;
  resourceId: string;
  weight: number;
  attempts: number;
};

const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 3_600_000;
const MAX_ATTEMPTS = 12;

@Injectable()
export class PreferenceOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PreferenceOutboxService.name);
  private readonly workerId = `song-preference-${process.pid}-${randomUUID()}`;
  private client!: RecommendationServiceClient;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('RECOMMENDATION_SERVICE') private readonly grpc: ClientGrpc,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.client = this.grpc.getService<RecommendationServiceClient>(
      RECOMMENDATION.SERVICE,
    );
    this.schedule(0);
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref();
  }

  private async tick() {
    try {
      const job = await this.claim();
      if (!job) return this.schedule(2_000);
      await this.publish(job);
      this.schedule(0);
    } catch (error) {
      this.logger.error('Preference outbox worker failed', error);
      this.schedule(2_000);
    }
  }

  private async claim(): Promise<ClaimedPreference | undefined> {
    const rows = await this.prisma.$queryRaw<ClaimedPreference[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id" FROM "preference_outbox"
        WHERE "deadLetteredAt" IS NULL
          AND "availableAt" <= NOW()
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '60 seconds')
        ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE "preference_outbox" AS job
      SET "lockedAt" = NOW(), "lockedBy" = ${this.workerId}, "attempts" = job."attempts" + 1, "updatedAt" = NOW()
      FROM candidate WHERE job."id" = candidate."id"
      RETURNING job."id", job."eventId", job."userId", job."eventType", job."resourceType", job."resourceId", job."weight", job."attempts"
    `);
    return rows[0];
  }

  private metadata() {
    const metadata = new Metadata();
    metadata.set(
      'x-internal-token',
      this.config.getOrThrow<string>('INTERNAL_GRPC_TOKEN'),
    );
    return metadata;
  }

  private async publish(job: ClaimedPreference) {
    try {
      const result = await firstValueFrom(
        this.client.recordPreferenceEvent(
          {
            userId: job.userId,
            eventId: job.eventId,
            eventType: job.eventType,
            resourceType: job.resourceType,
            resourceId: job.resourceId,
            weight: job.weight,
          },
          this.metadata(),
        ),
      );
      if (!result.success)
        throw new Error('Recommendation rejected preference event');
      await this.prisma.preferenceOutbox.deleteMany({
        where: { id: job.id, lockedBy: this.workerId },
      });
    } catch (error) {
      const lastError = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, 2000);
      const deadLettered = job.attempts >= MAX_ATTEMPTS;
      const delay = Math.min(
        RETRY_MAX_DELAY_MS,
        RETRY_BASE_DELAY_MS * 2 ** Math.min(job.attempts - 1, 10),
      );
      await this.prisma.preferenceOutbox.updateMany({
        where: { id: job.id, lockedBy: this.workerId },
        data: {
          lockedAt: null,
          lockedBy: '',
          availableAt: new Date(Date.now() + delay),
          deadLetteredAt: deadLettered ? new Date() : null,
          lastError,
        },
      });
      if (deadLettered) {
        this.logger.error(
          `Preference event ${job.eventId} moved to dead letter after ${job.attempts} attempts: ${lastError}`,
        );
      }
    }
  }
}
