import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RedisModule } from './common/redis/redis.module';
import { validateEnv } from './common/configs/env.validation';
import { MailModule } from './common/mail/mail.module';
import { TokenCleanupService } from './common/maintenance/token-cleanup.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    RedisModule,
    MailModule,
  ],
  providers: [TokenCleanupService],
})
export class AppModule {}
