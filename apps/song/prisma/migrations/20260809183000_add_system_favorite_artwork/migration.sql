CREATE TABLE "system_favorite_artworks" (
  "key" VARCHAR(64) NOT NULL,
  "assetId" VARCHAR(128) NOT NULL,
  "artwork" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "system_favorite_artworks_pkey" PRIMARY KEY ("key")
);
CREATE UNIQUE INDEX "system_favorite_artworks_assetId_key"
  ON "system_favorite_artworks"("assetId");
