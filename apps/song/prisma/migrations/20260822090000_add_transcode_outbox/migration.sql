CREATE TABLE "transcode_outbox" (
  "id" TEXT NOT NULL,
  "songId" VARCHAR(128) NOT NULL,
  "sourceObjectPath" VARCHAR(500) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL DEFAULT '',
  "audioMode" "SongAudioMode" NOT NULL DEFAULT 'STANDARD',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMPTZ,
  "lastError" VARCHAR(2000) NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "transcode_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transcode_outbox_songId_key" ON "transcode_outbox"("songId");
CREATE INDEX "transcode_outbox_availableAt_lockedAt_idx" ON "transcode_outbox"("availableAt", "lockedAt");
