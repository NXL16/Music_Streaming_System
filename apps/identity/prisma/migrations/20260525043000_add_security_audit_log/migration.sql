-- CreateTable
CREATE TABLE "SecurityAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "action" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityAuditLog_actorUserId_createdAt_idx" ON "SecurityAuditLog"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SecurityAuditLog_targetUserId_createdAt_idx" ON "SecurityAuditLog"("targetUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SecurityAuditLog_action_createdAt_idx" ON "SecurityAuditLog"("action", "createdAt" DESC);
