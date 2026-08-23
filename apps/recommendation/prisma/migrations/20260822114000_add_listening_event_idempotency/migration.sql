-- An optional client event ID makes at-least-once telemetry delivery safe.
-- PostgreSQL permits multiple NULL values in this unique index, preserving
-- behavior for older callers that do not yet supply an event ID.
ALTER TABLE "listening_events"
  ADD COLUMN "eventId" VARCHAR(128);

CREATE UNIQUE INDEX "listening_events_userId_eventId_key"
  ON "listening_events"("userId", "eventId");
