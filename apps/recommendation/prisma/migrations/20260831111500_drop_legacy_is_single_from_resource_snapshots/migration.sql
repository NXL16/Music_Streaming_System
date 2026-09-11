-- The preceding migration populated releaseType from this boolean.  Every
-- current writer and reader now uses releaseType, so retaining both columns
-- would create two competing sources of truth.
ALTER TABLE "recommendation_resource_snapshots"
DROP COLUMN "isSingle";
