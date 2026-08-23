-- Existing songs retain the standard single-stream playback pipeline.
CREATE TYPE "SongAudioMode" AS ENUM ('STANDARD', 'SING');

ALTER TABLE "songs"
ADD COLUMN "audioMode" "SongAudioMode" NOT NULL DEFAULT 'STANDARD';
