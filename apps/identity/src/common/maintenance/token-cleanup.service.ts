import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

const DEFAULT_CLEANUP_INTERVAL_MINUTES = 60;
const DEFAULT_RECOVERY_CODE_RETENTION_DAYS = 30;
const STARTUP_CLEANUP_DELAY_MS = 30_000;
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 5 * 60_000;
const RETRYABLE_PRISMA_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2028',
]);

@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private startupTimeout: NodeJS.Timeout | null = null;
  private retryTimeout: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;
  private retryAttempt = 0;
  private cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MINUTES * 60 * 1000;
  private recoveryCodeRetentionDays = DEFAULT_RECOVERY_CODE_RETENTION_DAYS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.stopping = false;
    this.cleanupIntervalMs =
      this.readPositiveInt('TOKEN_CLEANUP_INTERVAL_MINUTES') * 60 * 1000;
    this.recoveryCodeRetentionDays = this.readPositiveInt(
      'RECOVERY_CODE_RETENTION_DAYS',
    );

    // Run once shortly after boot, then run on interval.
    this.startupTimeout = setTimeout(() => {
      void this.runCleanup();
    }, STARTUP_CLEANUP_DELAY_MS);
    this.startupTimeout.unref?.();

    this.timer = setInterval(() => {
      void this.runCleanup();
    }, this.cleanupIntervalMs);
    this.timer.unref?.();

    this.logger.log(
      `Token cleanup configured: intervalMinutes=${Math.floor(this.cleanupIntervalMs / 60000)}, recoveryRetentionDays=${this.recoveryCodeRetentionDays}`,
    );
  }

  onModuleDestroy(): void {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }

    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  private async runCleanup(): Promise<void> {
    if (this.running || this.stopping) {
      return;
    }

    this.running = true;

    try {
      const now = new Date();
      const recoveryCutoff = new Date(
        now.getTime() - this.recoveryCodeRetentionDays * 24 * 60 * 60 * 1000,
      );

      // These are independent, idempotent maintenance deletes. Keeping them
      // out of one transaction avoids starving request-path transactions when
      // the database pool is briefly busy during startup.
      const passwordResetResult =
        await this.prisma.passwordResetToken.deleteMany({
          where: {
            OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }],
          },
        });
      const emailVerifyResult =
        await this.prisma.emailVerificationToken.deleteMany({
          where: {
            OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }],
          },
        });
      const recoveryResult = await this.prisma.twoFactorRecoveryCode.deleteMany(
        {
          where: {
            usedAt: { not: null, lt: recoveryCutoff },
          },
        },
      );

      const totalDeleted =
        passwordResetResult.count +
        emailVerifyResult.count +
        recoveryResult.count;

      if (totalDeleted > 0) {
        this.logger.log(
          `Token cleanup completed: passwordReset=${passwordResetResult.count}, emailVerify=${emailVerifyResult.count}, recovery=${recoveryResult.count}`,
        );
      }
      this.retryAttempt = 0;
    } catch (error) {
      this.logger.error('Token cleanup failed', error as Error);
      const retryDelayMs = this.scheduleRetry(error);
      if (retryDelayMs) {
        this.logger.warn(
          `Token cleanup will retry in ${retryDelayMs}ms after transient database error`,
        );
      }
    } finally {
      this.running = false;
    }
  }

  private scheduleRetry(error: unknown): number | undefined {
    if (
      this.stopping ||
      this.retryTimeout ||
      !this.isRetryableDatabaseError(error)
    ) {
      return undefined;
    }

    const delayMs = Math.min(
      RETRY_BASE_DELAY_MS * 2 ** this.retryAttempt,
      RETRY_MAX_DELAY_MS,
    );
    this.retryAttempt += 1;
    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      void this.runCleanup();
    }, delayMs);
    this.retryTimeout.unref?.();
    return delayMs;
  }

  private isRetryableDatabaseError(error: unknown): boolean {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    return typeof code === 'string' && RETRYABLE_PRISMA_CODES.has(code);
  }

  private readPositiveInt(key: string): number {
    const raw = this.configService.get<string>(key);
    if (!raw) {
      if (key === 'TOKEN_CLEANUP_INTERVAL_MINUTES') {
        return DEFAULT_CLEANUP_INTERVAL_MINUTES;
      }

      return DEFAULT_RECOVERY_CODE_RETENTION_DAYS;
    }

    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${key} phải là số nguyên dương`);
    }

    return value;
  }
}
