-- CreateTable
CREATE TABLE "song_owners" (
    "id" TEXT NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "userId" VARCHAR(128) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "title" VARCHAR(255) NOT NULL DEFAULT '',
    "artist" VARCHAR(255) NOT NULL DEFAULT '',
    "album" VARCHAR(255) NOT NULL DEFAULT '',
    "coverUrl" VARCHAR(500) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "song_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_cleanup_outbox" (
    "id" TEXT NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "sourceObjectPath" VARCHAR(500) NOT NULL DEFAULT '',
    "encryptedFilePath" VARCHAR(500) NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(1000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asset_cleanup_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "song_owners_userId_idx" ON "song_owners"("userId");

-- CreateIndex
CREATE INDEX "song_owners_userId_isPublic_idx" ON "song_owners"("userId", "isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "song_owners_songId_userId_key" ON "song_owners"("songId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_cleanup_outbox_songId_key" ON "asset_cleanup_outbox"("songId");

-- CreateIndex
CREATE INDEX "asset_cleanup_outbox_createdAt_idx" ON "asset_cleanup_outbox"("createdAt");

-- AddForeignKey
ALTER TABLE "song_owners" ADD CONSTRAINT "song_owners_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
