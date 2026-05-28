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

@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private startupTimeout: NodeJS.Timeout | null = null;
  private running = false;
  private cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MINUTES * 60 * 1000;
  private recoveryCodeRetentionDays = DEFAULT_RECOVERY_CODE_RETENTION_DAYS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.cleanupIntervalMs =
      this.readPositiveInt('TOKEN_CLEANUP_INTERVAL_MINUTES') * 60 * 1000;
    this.recoveryCodeRetentionDays = this.readPositiveInt(
      'RECOVERY_CODE_RETENTION_DAYS',
    );

    // Run once shortly after boot, then run on interval.
    this.startupTimeout = setTimeout(() => {
      void this.runCleanup();
    }, 10_000);

    this.timer = setInterval(() => {
      void this.runCleanup();
    }, this.cleanupIntervalMs);

    this.logger.log(
      `Token cleanup configured: intervalMinutes=${Math.floor(this.cleanupIntervalMs / 60000)}, recoveryRetentionDays=${this.recoveryCodeRetentionDays}`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }
  }

  private async runCleanup(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const now = new Date();
      const recoveryCutoff = new Date(
        now.getTime() - this.recoveryCodeRetentionDays * 24 * 60 * 60 * 1000,
      );

      const [passwordResetResult, emailVerifyResult, recoveryResult] =
        await this.prisma.$transaction([
          this.prisma.passwordResetToken.deleteMany({
            where: {
              OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }],
            },
          }),
          this.prisma.emailVerificationToken.deleteMany({
            where: {
              OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }],
            },
          }),
          this.prisma.twoFactorRecoveryCode.deleteMany({
            where: {
              usedAt: { not: null, lt: recoveryCutoff },
            },
          }),
        ]);

      const totalDeleted =
        passwordResetResult.count +
        emailVerifyResult.count +
        recoveryResult.count;

      if (totalDeleted > 0) {
        this.logger.log(
          `Token cleanup completed: passwordReset=${passwordResetResult.count}, emailVerify=${emailVerifyResult.count}, recovery=${recoveryResult.count}`,
        );
      }
    } catch (error) {
      this.logger.error('Token cleanup failed', error as Error);
    } finally {
      this.running = false;
    }
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
