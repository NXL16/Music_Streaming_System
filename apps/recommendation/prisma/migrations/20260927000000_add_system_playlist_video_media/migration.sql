ALTER TABLE "system_playlist_artworks"
  ADD COLUMN "detailSquareVideoAssetId" VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "detailMobileVideoAssetId" VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "homeHeroVideoAssetId" VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN "detailSquareVideo" JSONB,
  ADD COLUMN "detailMobileVideo" JSONB,
  ADD COLUMN "homeHeroVideo" JSONB;

CREATE INDEX "system_playlist_artworks_detailSquareVideoAssetId_idx"
  ON "system_playlist_artworks"("detailSquareVideoAssetId");
CREATE INDEX "system_playlist_artworks_detailMobileVideoAssetId_idx"
  ON "system_playlist_artworks"("detailMobileVideoAssetId");
CREATE INDEX "system_playlist_artworks_homeHeroVideoAssetId_idx"
  ON "system_playlist_artworks"("homeHeroVideoAssetId");
