-- Catalog is the authority for release classification. Keep the old boolean
-- temporarily so application deployments can migrate readers safely.
ALTER TABLE "recommendation_resource_snapshots"
ADD COLUMN "releaseType" VARCHAR(16) NOT NULL DEFAULT 'album';

UPDATE "recommendation_resource_snapshots"
SET "releaseType" = CASE WHEN "isSingle" THEN 'single' ELSE 'album' END;

ALTER TABLE "recommendation_resource_snapshots"
ADD CONSTRAINT "recommendation_resource_snapshots_releaseType_check"
CHECK ("releaseType" IN ('album', 'ep', 'single'));
