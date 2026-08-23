import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const getThrottlerConfig = (redis: Redis, config: ConfigService) => ({
  storage: new ThrottlerStorageRedisService(redis),
  throttlers: [
    {
      name: 'default',
      ttl: 60_000,
      limit: positiveInt(config.get<string>('API_RATE_LIMIT_PER_MINUTE'), 120),
    },
    {
      name: 'catalog',
      ttl: 60_000,
      limit: positiveInt(
        config.get<string>('API_CATALOG_RATE_LIMIT_PER_MINUTE'),
        240,
      ),
    },
  ],
});

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
