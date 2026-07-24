ALTER TABLE "artists"
  ADD COLUMN "editorialVideoAssetId" VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "editorialVideo" JSONB;

CREATE INDEX "artists_editorialVideoAssetId_idx"
  ON "artists"("editorialVideoAssetId");