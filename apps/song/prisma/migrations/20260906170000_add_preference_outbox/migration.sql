CREATE TABLE "preference_outbox" (
  "id" TEXT NOT NULL,
  "eventId" VARCHAR(128) NOT NULL,
  "userId" VARCHAR(128) NOT NULL,
  "eventType" INTEGER NOT NULL,
  "resourceType" VARCHAR(64) NOT NULL,
  "resourceId" VARCHAR(128) NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMPTZ,
  "lockedBy" VARCHAR(128) NOT NULL DEFAULT '',
  "lastError" VARCHAR(2000) NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "preference_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "preference_outbox_eventId_key" ON "preference_outbox"("eventId");
CREATE INDEX "preference_outbox_availableAt_lockedAt_idx" ON "preference_outbox"("availableAt", "lockedAt");
