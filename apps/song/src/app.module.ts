import { Module } from '@nestjs/common';
import { SongsModule } from './songs/songs.module';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/configs/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.APP_ENV ?? 'development'}`, '.env'],
      validate: validateEnv,
    }),
    SongsModule,
  ],
})
export class AppModule {}
