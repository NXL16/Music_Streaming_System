import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const getThrottlerConfig = (redis: Redis) => ({
  storage: new ThrottlerStorageRedisService(redis),
  throttlers: [{ ttl: 60000, limit: 10 }],
});

export const getBullConfig = (config: ConfigService) => ({
  connection: {
    host: config.get<string>('REDIS_HOST'),
    port: config.get<number>('REDIS_PORT'),
  },
});
