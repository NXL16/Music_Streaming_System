-- TTML is the sole lyric source of truth. Discard every legacy lyric that was
-- not saved as TTML. This is deliberate: the legacy text/JSON model is gone.
DELETE FROM "song_lyrics" WHERE "sourceTtml" = '';

-- Legacy drafts contain only the old text/JSON projection. They are
-- intentionally discarded; Studio drafts saved after this migration use TTML.
DELETE FROM "song_lyric_drafts" WHERE "sourceTtml" = '';

DROP TABLE "song_lyric_words";
DROP TABLE "song_lyric_lines";

ALTER TABLE "song_lyrics"
  DROP COLUMN "sourceLrc",
  DROP COLUMN "plainText",
  DROP COLUMN "syncMode";

ALTER TABLE "song_lyric_drafts"
  DROP COLUMN "sourceLrc",
  DROP COLUMN "plainText",
  DROP COLUMN "syncMode",
  DROP COLUMN "lines";

DROP TYPE "SongLyricLineKind";
DROP TYPE "SongLyricSyncMode";
