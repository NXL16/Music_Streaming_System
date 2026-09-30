CREATE TABLE "system_playlist_artworks" (
  "playlistKey" VARCHAR(32) NOT NULL,
  "coverAssetId" VARCHAR(128) NOT NULL,
  "homeCardAssetId" VARCHAR(128) NOT NULL,
  "coverArtwork" JSONB NOT NULL,
  "homeCardArtwork" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "system_playlist_artworks_pkey" PRIMARY KEY ("playlistKey")
);
CREATE UNIQUE INDEX "system_playlist_artworks_coverAssetId_key" ON "system_playlist_artworks"("coverAssetId");
CREATE UNIQUE INDEX "system_playlist_artworks_homeCardAssetId_key" ON "system_playlist_artworks"("homeCardAssetId");
