import { Module } from '@nestjs/common';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../common/redis/redis.module';
import { CompletionService } from './completion.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [SongsController],
  providers: [SongsService, CompletionService],
})
export class SongsModule {}
