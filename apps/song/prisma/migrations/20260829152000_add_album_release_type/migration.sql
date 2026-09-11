ALTER TABLE "albums"
ADD COLUMN "releaseType" VARCHAR(16) NOT NULL DEFAULT 'album';

UPDATE "albums"
SET "releaseType" = 'single'
WHERE "isSingle" = true;

ALTER TABLE "albums"
ADD CONSTRAINT "albums_releaseType_check"
CHECK ("releaseType" IN ('album', 'ep', 'single'));
