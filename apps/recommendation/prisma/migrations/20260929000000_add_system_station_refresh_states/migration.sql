CREATE TABLE "system_station_refresh_states" (
  "stationKey" VARCHAR(32) NOT NULL,
  "refreshedAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_station_refresh_states_pkey" PRIMARY KEY ("stationKey")
);

CREATE INDEX "system_station_refresh_states_refreshedAt_idx"
  ON "system_station_refresh_states"("refreshedAt");
