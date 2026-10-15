CREATE TABLE "song_static_lyric_lines" (
    "songId" VARCHAR(128) NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isRightAligned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "song_static_lyric_lines_pkey" PRIMARY KEY ("songId", "position")
);

ALTER TABLE "song_static_lyric_lines"
ADD CONSTRAINT "song_static_lyric_lines_songId_fkey"
FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
