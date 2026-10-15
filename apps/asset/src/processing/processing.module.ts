import { Module } from "@nestjs/common";
import { AssetProcessingWorkerService } from "./asset-processing-worker.service";
import { AssetProcessorService } from "./asset-processor.service";
import { AssetArtifactRetentionService } from "./asset-artifact-retention.service";

@Module({
  providers: [
    AssetProcessorService,
    AssetProcessingWorkerService,
    AssetArtifactRetentionService,
  ],
  exports: [AssetProcessorService],
})
export class ProcessingModule {}
