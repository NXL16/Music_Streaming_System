ALTER TABLE "transcode_outbox"
  ADD COLUMN "lockedBy" VARCHAR(64);

ALTER TABLE "asset_cleanup_outbox"
  ADD COLUMN "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMPTZ,
  ADD COLUMN "lockedBy" VARCHAR(64);

CREATE INDEX "asset_cleanup_outbox_availableAt_lockedAt_idx"
  ON "asset_cleanup_outbox"("availableAt", "lockedAt");
