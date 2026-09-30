ALTER TABLE "system_station_artworks"
  RENAME COLUMN "assetId" TO "coverAssetId";

ALTER TABLE "system_station_artworks"
  RENAME COLUMN "artwork" TO "coverArtwork";

ALTER TABLE "system_station_artworks"
  ADD COLUMN "heroVideoAssetId" VARCHAR(128),
  ADD COLUMN "heroVideo" JSONB;

CREATE UNIQUE INDEX "system_station_artworks_heroVideoAssetId_key"
  ON "system_station_artworks"("heroVideoAssetId");
