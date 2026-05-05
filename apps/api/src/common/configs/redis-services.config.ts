import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Redis } from 'ioredis';

export const getThrottlerConfig = (redis: Redis) => ({
  storage: new ThrottlerStorageRedisService(redis),
  throttlers: [{ ttl: 60000, limit: 10 }],
});

