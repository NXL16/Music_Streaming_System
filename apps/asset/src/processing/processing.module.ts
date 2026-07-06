import { Module } from '@nestjs/common';
import { AssetProcessingWorkerService } from './asset-processing-worker.service';
import { AssetProcessorService } from './asset-processor.service';

@Module({
  providers: [AssetProcessorService, AssetProcessingWorkerService],
})
export class ProcessingModule {}
