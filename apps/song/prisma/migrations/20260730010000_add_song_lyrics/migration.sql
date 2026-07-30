CREATE TYPE "SongLyricStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "song_lyrics" (
    "id" TEXT NOT NULL,
    "songId" VARCHAR(128) NOT NULL,
    "language" VARCHAR(16) NOT NULL DEFAULT 'vi',
    "sourceLrc" TEXT NOT NULL,
    "plainText" TEXT NOT NULL,
    "status" "SongLyricStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "song_lyrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "song_lyric_lines" (
    "id" TEXT NOT NULL,
    "lyricId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "startTimeMs" INTEGER NOT NULL,
    "endTimeMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "song_lyric_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "song_lyrics_songId_key" ON "song_lyrics"("songId");
CREATE INDEX "song_lyrics_status_idx" ON "song_lyrics"("status");
CREATE UNIQUE INDEX "song_lyric_lines_lyricId_position_key" ON "song_lyric_lines"("lyricId", "position");
CREATE INDEX "song_lyric_lines_lyricId_startTimeMs_idx" ON "song_lyric_lines"("lyricId", "startTimeMs");

ALTER TABLE "song_lyrics" ADD CONSTRAINT "song_lyrics_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "song_lyric_lines" ADD CONSTRAINT "song_lyric_lines_lyricId_fkey" FOREIGN KEY ("lyricId") REFERENCES "song_lyrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
