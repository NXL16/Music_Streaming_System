import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/configs/env.validation';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { AssetsModule } from './assets/assets.module';
import { ProcessingModule } from './processing/processing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    StorageModule,
    AssetsModule,
    ProcessingModule,
  ],
})
export class AppModule {}
