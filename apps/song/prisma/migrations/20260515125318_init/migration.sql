-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "artist" VARCHAR(255) NOT NULL DEFAULT '',
    "album" VARCHAR(255) NOT NULL DEFAULT '',
    "coverUrl" VARCHAR(500) NOT NULL DEFAULT '',
    "uploaderId" VARCHAR(128) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" INTEGER NOT NULL DEFAULT 1,
    "sourceObjectPath" VARCHAR(500) NOT NULL DEFAULT '',
    "checksum" VARCHAR(64) NOT NULL DEFAULT '',
    "fileSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "encryptedFilePath" VARCHAR(500) NOT NULL DEFAULT '',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "bitrateKbps" INTEGER NOT NULL DEFAULT 0,
    "codec" VARCHAR(32) NOT NULL DEFAULT '',
    "format" VARCHAR(32) NOT NULL DEFAULT 'fmp4',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "songs_checksum_key" ON "songs"("checksum");

-- CreateIndex
CREATE INDEX "songs_status_createdAt_idx" ON "songs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "songs_title_idx" ON "songs"("title");

-- CreateIndex
CREATE INDEX "songs_uploaderId_idx" ON "songs"("uploaderId");
