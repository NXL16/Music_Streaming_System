-- Protect recommendation feedback from browser retries and repeated delivery
-- without relying on process-local memory or client-side batching.
ALTER TABLE "recommendation_interactions"
  ADD COLUMN "dedupeKey" VARCHAR(512);

CREATE UNIQUE INDEX "recommendation_interactions_dedupeKey_key"
  ON "recommendation_interactions"("dedupeKey");
