import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { GenerationService } from './generation.service';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class SystemStationRefreshService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SystemStationRefreshService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly generationService: GenerationService) {}

  onModuleInit(): void {
    this.scheduleNextRefresh();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNextRefresh(): void {
    const now = Date.now();
    const nextHour = (Math.floor(now / HOUR_MS) + 1) * HOUR_MS;
    this.timer = setTimeout(
      () => {
        void this.refreshCurrentStation();
      },
      nextHour - now + 50,
    );
    this.timer.unref?.();
  }

  private async refreshCurrentStation(): Promise<void> {
    try {
      await this.generationService.tryLazyGenerateGlobal(
        'listen-now',
        'en-GB',
        '+07:00',
        'system-station-refresh',
      );
    } catch (error) {
      this.logger.warn('[system-stations] hourly refresh failed', error);
    } finally {
      this.scheduleNextRefresh();
    }
  }
}
