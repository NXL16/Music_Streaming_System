CREATE TABLE "song_lyric_words" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "startTimeMs" INTEGER NOT NULL,
    "endTimeMs" INTEGER NOT NULL,
    "text" VARCHAR(500) NOT NULL,

    CONSTRAINT "song_lyric_words_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "song_lyric_words_lineId_position_key" ON "song_lyric_words"("lineId", "position");
CREATE INDEX "song_lyric_words_lineId_startTimeMs_idx" ON "song_lyric_words"("lineId", "startTimeMs");

ALTER TABLE "song_lyric_words" ADD CONSTRAINT "song_lyric_words_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "song_lyric_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
