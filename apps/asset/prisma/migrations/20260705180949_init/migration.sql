-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "AssetPurpose" AS ENUM ('ARTWORK', 'EDITORIAL_VIDEO');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "purpose" "AssetPurpose" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "filename" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(128) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sourceObjectKey" VARCHAR(1000) NOT NULL,
    "publicUrl" VARCHAR(2000) NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "durationMillis" INTEGER NOT NULL DEFAULT 0,
    "variants" JSONB,
    "errorMessage" VARCHAR(2000) NOT NULL DEFAULT '',
    "createdBy" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_usages" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ownerService" VARCHAR(64) NOT NULL,
    "ownerType" VARCHAR(64) NOT NULL,
    "ownerId" VARCHAR(128) NOT NULL,
    "slot" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asset_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_processing_jobs" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ,
    "lastError" VARCHAR(2000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asset_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_status_kind_purpose_createdAt_idx" ON "assets"("status", "kind", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "assets_createdBy_createdAt_idx" ON "assets"("createdBy", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "assets_kind_purpose_checksum_key" ON "assets"("kind", "purpose", "checksum");

-- CreateIndex
CREATE INDEX "asset_usages_assetId_ownerService_ownerType_idx" ON "asset_usages"("assetId", "ownerService", "ownerType");

-- CreateIndex
CREATE INDEX "asset_usages_ownerService_ownerType_ownerId_idx" ON "asset_usages"("ownerService", "ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_usages_ownerService_ownerType_ownerId_slot_assetId_key" ON "asset_usages"("ownerService", "ownerType", "ownerId", "slot", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_processing_jobs_assetId_key" ON "asset_processing_jobs"("assetId");

-- CreateIndex
CREATE INDEX "asset_processing_jobs_availableAt_lockedAt_idx" ON "asset_processing_jobs"("availableAt", "lockedAt");

-- AddForeignKey
ALTER TABLE "asset_usages" ADD CONSTRAINT "asset_usages_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_processing_jobs" ADD CONSTRAINT "asset_processing_jobs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
