CREATE TABLE "system_station_artworks" (
  "stationKey" VARCHAR(64) NOT NULL,
  "assetId" VARCHAR(128) NOT NULL,
  "artwork" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "system_station_artworks_pkey" PRIMARY KEY ("stationKey")
);

CREATE UNIQUE INDEX "system_station_artworks_assetId_key"
  ON "system_station_artworks"("assetId");
