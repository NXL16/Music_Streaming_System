CREATE TABLE "recommendation_generation_leases" (
    "leaseKey" VARCHAR(512) NOT NULL,
    "leaseToken" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recommendation_generation_leases_pkey" PRIMARY KEY ("leaseKey")
);

CREATE INDEX "recommendation_generation_leases_expiresAt_idx"
ON "recommendation_generation_leases"("expiresAt");
