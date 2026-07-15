import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SongsModule } from './songs/songs.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
import { RedisModule } from './common/redis/redis.module';
import { getThrottlerConfig } from './common/configs/redis-services.config';
import { validateEnv } from './common/configs/env.validation';
import { AuthModule } from './auth/auth.module';
import { StreamModule } from './stream/stream.module';
import { MetadataModule } from './metadata/metadata.module';
import { WalletModule } from './wallet/wallet.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { AssetsModule } from './assets/assets.module';
import { HealthModule } from './health/health.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    AuthModule,
    SongsModule,
    RedisModule,
    StreamModule,
    MetadataModule,
    ThrottlerModule.forRootAsync({
      inject: ['REDIS_INSTANCE'],
      useFactory: (redis: Redis) => getThrottlerConfig(redis),
    }),
    WalletModule,
    RecommendationsModule,
    AssetsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*path');
  }
}
