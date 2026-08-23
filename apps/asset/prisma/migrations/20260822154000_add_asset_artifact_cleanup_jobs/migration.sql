CREATE TABLE "asset_artifact_cleanup_jobs" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sourceObjectKey" VARCHAR(1000) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ,
    "leaseToken" VARCHAR(64),
    "lastError" VARCHAR(2000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asset_artifact_cleanup_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_artifact_cleanup_jobs_assetId_key"
ON "asset_artifact_cleanup_jobs"("assetId");

CREATE INDEX "asset_artifact_cleanup_jobs_availableAt_lockedAt_idx"
ON "asset_artifact_cleanup_jobs"("availableAt", "lockedAt");

ALTER TABLE "asset_artifact_cleanup_jobs"
ADD CONSTRAINT "asset_artifact_cleanup_jobs_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
