import { Module } from '@nestjs/common';
import { SongsModule } from './songs/songs.module';
import { ConfigModule } from '@nestjs/config';
import { KmsModule } from './kms/kms.module';
import { ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { RedisModule } from './common/redis/redis.module';
import { getThrottlerConfig } from './common/configs/redis-services.config';
import { validateEnv } from './common/configs/env.validation';
import { AuthModule } from './auth/auth.module';
import { StreamModule } from './stream/stream.module';
import { MetadataModule } from './metadata/metadata.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    AuthModule,
    SongsModule,
    KmsModule,
    RedisModule,
    StreamModule,
    MetadataModule,

    ThrottlerModule.forRootAsync({
      inject: ['REDIS_INSTANCE'],
      useFactory: (redis: Redis) => getThrottlerConfig(redis),
    }),
  ],
})
export class AppModule {}
