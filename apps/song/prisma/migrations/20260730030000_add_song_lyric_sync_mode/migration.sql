CREATE TYPE "SongLyricSyncMode" AS ENUM ('LINE', 'WORD');

ALTER TABLE "song_lyrics"
ADD COLUMN "syncMode" "SongLyricSyncMode" NOT NULL DEFAULT 'LINE';
