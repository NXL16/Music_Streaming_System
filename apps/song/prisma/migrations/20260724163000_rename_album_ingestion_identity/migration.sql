-- Provider names are not part of the catalog domain. Keep an opaque,
-- project-owned ingestion identity instead.
ALTER TABLE "albums" RENAME COLUMN "sourceProvider" TO "ingestionSource";
ALTER TABLE "albums" RENAME COLUMN "sourceExternalId" TO "ingestionKey";

ALTER INDEX "albums_sourceProvider_sourceExternalId_key"
  RENAME TO "albums_ingestionSource_ingestionKey_key";
