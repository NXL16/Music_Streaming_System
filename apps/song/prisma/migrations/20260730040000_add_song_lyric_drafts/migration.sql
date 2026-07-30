CREATE TABLE "song_lyric_drafts" (
    "id" TEXT NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "language" VARCHAR(16) NOT NULL DEFAULT 'vi',
    "sourceLrc" TEXT NOT NULL,
    "plainText" TEXT NOT NULL,
    "syncMode" "SongLyricSyncMode" NOT NULL DEFAULT 'LINE',
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "song_lyric_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "song_lyric_drafts_songId_key" ON "song_lyric_drafts"("songId");

ALTER TABLE "song_lyric_drafts"
ADD CONSTRAINT "song_lyric_drafts_songId_fkey"
FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
