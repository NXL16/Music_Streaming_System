import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { SongsModule } from './songs/songs.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { KmsModule } from './kms/kms.module';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import Redis from 'ioredis';
import { RedisModule } from './common/redis/redis.module';
import { CleanupModule } from './common/cleanup/cleanup.module';
import { getBullConfig, getThrottlerConfig } from './common/configs/redis-services.config';
import { validateEnv } from './common/configs/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    UsersModule,
    SongsModule,
    DatabaseModule,
    AuthModule,
    KmsModule,
    RedisModule,
    CleanupModule,

    ThrottlerModule.forRootAsync({
      inject: ['REDIS_INSTANCE'],
      useFactory: (redis: Redis) => getThrottlerConfig(redis),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => getBullConfig(config),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
