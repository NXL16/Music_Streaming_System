CREATE TABLE "IdentityProvisioningOutbox" (
    "id" TEXT NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockToken" VARCHAR(64),
    "lockedUntil" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "deadLetteredAt" TIMESTAMP(3),
    "lastError" VARCHAR(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProvisioningOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IdentityProvisioningOutbox_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "IdentityProvisioningOutbox_eventType_userId_key"
  ON "IdentityProvisioningOutbox"("eventType", "userId");

CREATE INDEX "IdentityProvisioningOutbox_pending_idx"
  ON "IdentityProvisioningOutbox"("processedAt", "deadLetteredAt", "availableAt", "lockedUntil", "createdAt");
