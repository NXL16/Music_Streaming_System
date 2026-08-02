CREATE TYPE "SongLyricLineKind" AS ENUM ('LYRIC', 'INSTRUMENTAL');

ALTER TABLE "song_lyric_lines"
ADD COLUMN "kind" "SongLyricLineKind" NOT NULL DEFAULT 'LYRIC';
