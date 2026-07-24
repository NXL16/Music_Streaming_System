-- AlterTable
ALTER TABLE "recommendation_resource_snapshots" ADD COLUMN     "canonicalReleaseId" VARCHAR(128) NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "recommendation_resource_snapshots_resourceType_canonicalRel_idx" ON "recommendation_resource_snapshots"("resourceType", "canonicalReleaseId");
