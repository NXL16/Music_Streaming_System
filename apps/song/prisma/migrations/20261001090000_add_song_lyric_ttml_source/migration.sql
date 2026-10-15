ALTER TABLE "song_lyrics"
ADD COLUMN "sourceTtml" TEXT NOT NULL DEFAULT '';

ALTER TABLE "song_lyric_drafts"
ADD COLUMN "sourceTtml" TEXT NOT NULL DEFAULT '';
