-- Fence each worker lease so a stale worker cannot complete, retry, or delete
-- a job that has already been reclaimed by another worker.
ALTER TABLE "asset_processing_jobs"
ADD COLUMN "leaseToken" VARCHAR(64);

-- Preserve terminal processing failures for operations and manual replay.
CREATE TABLE "asset_processing_dead_letters" (
    "id" TEXT NOT NULL,
    "jobId" VARCHAR(128) NOT NULL,
    "assetId" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "sourceObjectKey" VARCHAR(1000) NOT NULL,
    "errorMessage" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_processing_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_processing_dead_letters_jobId_key"
ON "asset_processing_dead_letters"("jobId");

CREATE INDEX "asset_processing_dead_letters_assetId_createdAt_idx"
ON "asset_processing_dead_letters"("assetId", "createdAt");
