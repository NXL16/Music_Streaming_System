import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { RecommendationModule } from './recommendations/recommendations.module';
import { validateEnv } from './common/configs/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.APP_ENV ?? 'development'}`, '.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    RecommendationModule,
  ],
})
export class AppModule {}
