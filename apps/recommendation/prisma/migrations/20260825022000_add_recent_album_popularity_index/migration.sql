-- Popularity is calculated from recent, quality-weighted listening events.
-- This keeps its time-window aggregation selective as event history grows.
CREATE INDEX "listening_events_createdAt_eventType_albumId_idx"
  ON "listening_events"("createdAt", "eventType", "albumId");
