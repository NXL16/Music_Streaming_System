ALTER TABLE "preference_outbox"
ADD COLUMN "deadLetteredAt" TIMESTAMPTZ;

DROP INDEX IF EXISTS "preference_outbox_availableAt_lockedAt_idx";

CREATE INDEX "preference_outbox_availableAt_lockedAt_deadLetteredAt_idx"
ON "preference_outbox"("availableAt", "lockedAt", "deadLetteredAt");
