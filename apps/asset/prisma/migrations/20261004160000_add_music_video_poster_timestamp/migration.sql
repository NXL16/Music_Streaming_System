ALTER TABLE "assets"
ADD COLUMN "posterTimestampMillis" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "assets_kind_purpose_checksum_createdBy_key";

CREATE UNIQUE INDEX "assets_kind_purpose_checksum_posterTimestampMillis_createdBy_key"
ON "assets"("kind", "purpose", "checksum", "posterTimestampMillis", "createdBy");
