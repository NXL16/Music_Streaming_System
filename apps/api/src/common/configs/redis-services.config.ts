import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Redis } from 'ioredis';

export const getThrottlerConfig = (redis: Redis) => ({
  storage: new ThrottlerStorageRedisService(redis),
  throttlers: [
    // { name: 'default', ttl: 60000, limit: 30 },
    // { name: 'catalog', ttl: 60000, limit: 60 },
    { name: 'default', ttl: 60000, limit: 10000 },
    { name: 'catalog', ttl: 60000, limit: 10000 },
  ],
});
