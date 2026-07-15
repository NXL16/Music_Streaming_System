import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ListeningService } from './listening.service';
import { ListeningCleanupService } from './listening-cleanup.service';

@Module({
  imports: [DatabaseModule],
  providers: [ListeningService, ListeningCleanupService],
  exports: [ListeningService],
})
export class ListeningModule {}
