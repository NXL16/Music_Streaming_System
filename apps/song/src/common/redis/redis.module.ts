import {
  BeforeApplicationShutdown,
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
class RedisProvider implements OnModuleDestroy, BeforeApplicationShutdown {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: Number(config.getOrThrow<string>('REDIS_PORT')),
      password: config.getOrThrow<string>('REDIS_PASSWORD'),
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.close();
  }

  private async close(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    await this.client.quit().catch(() => {
      this.client.disconnect(false);
    });
  }
}

@Global()
@Module({
  providers: [
    RedisProvider,
    {
      provide: 'REDIS_INSTANCE',
      inject: [RedisProvider],
      useFactory: (provider: RedisProvider) => provider.client,
    },
  ],
  exports: ['REDIS_INSTANCE', RedisProvider],
})
export class RedisModule {}