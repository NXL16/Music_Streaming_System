import { Module } from '@nestjs/common';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../common/redis/redis.module';
import { CompletionService } from './completion.service';
import { PendingCleanupService } from './pending-cleanup.service';
import { AssetCleanupService } from './asset-cleanup.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [SongsController],
  providers: [
    SongsService,
    CompletionService,
    PendingCleanupService,
    AssetCleanupService,
  ],
})
export class SongsModule {}
