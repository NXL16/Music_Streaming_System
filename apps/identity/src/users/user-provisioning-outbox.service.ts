import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { PrismaService } from '../common/database/prisma.service';
import {
  DEFAULT_WALLET_GRPC_TIMEOUT_MS,
  WalletClientService,
} from '../wallet/wallet-client.service';
import {
  UserMetadata,
  UserMetadataDocument,
} from './schemas/user-metadata.schema';
import {
  USER_PROVISIONING_EVENT_TYPES,
  UserProvisioningEventType,
} from './user-provisioning-outbox.types';

type ClaimedOutboxMessage = {
  id: string;
  eventType: string;
  userId: string;
  attempts: number;
};

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 12;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000;

@Injectable()
export class UserProvisioningOutboxService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(UserProvisioningOutboxService.name);
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly walletGrpcTimeoutMs: number;
  private readonly maxAttempts: number;
  private timer?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    private readonly walletClientService: WalletClientService,
    @InjectModel(UserMetadata.name)
    private readonly metadataModel: Model<UserMetadataDocument>,
  ) {
    this.pollIntervalMs = this.readBoundedInt(
      configService,
      'IDENTITY_OUTBOX_POLL_INTERVAL_MS',
      DEFAULT_POLL_INTERVAL_MS,
      100,
      60_000,
    );
    this.batchSize = this.readBoundedInt(
      configService,
      'IDENTITY_OUTBOX_BATCH_SIZE',
      DEFAULT_BATCH_SIZE,
      1,
      100,
    );
    this.leaseSeconds = this.readBoundedInt(
      configService,
      'IDENTITY_OUTBOX_LEASE_SECONDS',
      DEFAULT_LEASE_SECONDS,
      5,
      300,
    );
    this.walletGrpcTimeoutMs = this.readBoundedInt(
      configService,
      'WALLET_GRPC_TIMEOUT_MS',
      DEFAULT_WALLET_GRPC_TIMEOUT_MS,
      100,
      60_000,
    );
    if (this.walletGrpcTimeoutMs >= this.leaseSeconds * 1_000) {
      throw new Error(
        'WALLET_GRPC_TIMEOUT_MS phải nhỏ hơn IDENTITY_OUTBOX_LEASE_SECONDS',
      );
    }
    this.maxAttempts = this.readBoundedInt(
      configService,
      'IDENTITY_OUTBOX_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
      1,
      100,
    );
  }

  onModuleInit(): void {
    void this.runScheduled();
    this.timer = setInterval(() => {
      void this.runScheduled();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Claims and dispatches at most one bounded batch. This is public so an
   * operational job or focused test can trigger one safe drain without a
   * second scheduler.
   */
  async processPending(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const lockToken = randomUUID();

    try {
      const messages = await this.claimBatch(lockToken);

      for (const message of messages) {
        try {
          // A batch is intentionally handled serially to avoid overwhelming
          // downstream services. Refresh each message immediately before its
          // side effect so later messages do not inherit a nearly-expired
          // lease from the initial batch claim.
          const leaseRenewed = await this.renewLease(message.id, lockToken);
          if (!leaseRenewed) {
            this.logger.warn(
              `Outbox message lost its lease before dispatch message=${message.id}`,
            );
            continue;
          }

          await this.dispatch(message);

          const marked = await this.markProcessed(message.id, lockToken);
          if (!marked) {
            this.logger.warn(
              `Outbox success acknowledgement lost its lease for message=${message.id}`,
            );
          }
        } catch (error) {
          await this.recordFailure(message, lockToken, error).catch(
            (recordError: unknown) => {
              this.logger.error(
                `Cannot persist outbox failure for message=${message.id}: ${this.errorMessage(recordError)}`,
              );
            },
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async runScheduled(): Promise<void> {
    try {
      await this.processPending();
    } catch (error) {
      this.logger.error(
        `Identity provisioning outbox poll failed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async claimBatch(
    lockToken: string,
  ): Promise<ClaimedOutboxMessage[]> {
    return this.prisma.$queryRaw<ClaimedOutboxMessage[]>`
      WITH candidates AS (
        SELECT "id"
        FROM "IdentityProvisioningOutbox"
        WHERE "processedAt" IS NULL
          AND "deadLetteredAt" IS NULL
          AND "availableAt" <= NOW()
          AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW())
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.batchSize}
      )
      UPDATE "IdentityProvisioningOutbox" AS outbox
      SET
        "lockToken" = ${lockToken},
        "lockedUntil" = NOW() + (${this.leaseSeconds} * INTERVAL '1 second'),
        "attempts" = outbox."attempts" + 1,
        "updatedAt" = NOW()
      FROM candidates
      WHERE outbox."id" = candidates."id"
      RETURNING outbox."id", outbox."eventType", outbox."userId", outbox."attempts"
    `;
  }

  private async dispatch(message: ClaimedOutboxMessage): Promise<void> {
    switch (message.eventType as UserProvisioningEventType) {
      case USER_PROVISIONING_EVENT_TYPES.metadata:
        await this.metadataModel
          .updateOne(
            { userId: message.userId },
            { $setOnInsert: { userId: message.userId } },
            { upsert: true, setDefaultsOnInsert: true },
          )
          .exec();
        return;
      case USER_PROVISIONING_EVENT_TYPES.wallet:
        await this.walletClientService.createWalletForUser(
          message.userId,
          this.walletGrpcTimeoutMs,
        );
        return;
      default:
        throw new Error(`Unsupported provisioning outbox event: ${message.eventType}`);
    }
  }

  private async markProcessed(id: string, lockToken: string): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE "IdentityProvisioningOutbox"
      SET
        "processedAt" = NOW(),
        "lockedUntil" = NULL,
        "lockToken" = NULL,
        "lastError" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND "lockToken" = ${lockToken}
        AND "lockedUntil" > NOW()
        AND "processedAt" IS NULL
        AND "deadLetteredAt" IS NULL
    `;

    return Number(updated) === 1;
  }

  private async renewLease(id: string, lockToken: string): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE "IdentityProvisioningOutbox"
      SET
        "lockedUntil" = NOW() + (${this.leaseSeconds} * INTERVAL '1 second'),
        "updatedAt" = NOW()
      WHERE "id" = ${id}
        AND "lockToken" = ${lockToken}
        AND "lockedUntil" > NOW()
        AND "processedAt" IS NULL
        AND "deadLetteredAt" IS NULL
    `;

    return Number(updated) === 1;
  }

  private async recordFailure(
    message: ClaimedOutboxMessage,
    lockToken: string,
    error: unknown,
  ): Promise<void> {
    const deadLetter = message.attempts >= this.maxAttempts;
    const availableAt = new Date(
      Date.now() + this.retryDelayMs(message.attempts),
    );
    const lastError = this.errorMessage(error).slice(0, 1_024);

    const updated = await this.prisma.$executeRaw`
      UPDATE "IdentityProvisioningOutbox"
      SET
        "lockToken" = NULL,
        "lockedUntil" = NULL,
        "availableAt" = ${availableAt},
        "lastError" = ${lastError},
        "deadLetteredAt" = CASE WHEN ${deadLetter} THEN NOW() ELSE NULL END,
        "updatedAt" = NOW()
      WHERE "id" = ${message.id}
        AND "lockToken" = ${lockToken}
        AND "lockedUntil" > NOW()
        AND "processedAt" IS NULL
        AND "deadLetteredAt" IS NULL
    `;

    if (Number(updated) !== 1) {
      this.logger.warn(
        `Outbox failure acknowledgement lost its lease for message=${message.id}`,
      );
      return;
    }

    if (deadLetter) {
      this.logger.error(
        `Identity provisioning outbox dead-lettered message=${message.id} event=${message.eventType} attempts=${message.attempts}: ${lastError}`,
      );
      return;
    }

    this.logger.warn(
      `Identity provisioning outbox retry message=${message.id} event=${message.eventType} attempt=${message.attempts}: ${lastError}`,
    );
  }

  private retryDelayMs(attempt: number): number {
    const exponent = Math.max(0, attempt - 1);
    return Math.min(60_000 * 2 ** exponent, MAX_RETRY_DELAY_MS);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private readBoundedInt(
    configService: ConfigService,
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = configService.get<string>(key);
    if (raw === undefined || raw === '') {
      return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new Error(`${key} phải là số nguyên trong khoảng ${min}-${max}`);
    }

    return parsed;
  }
}
