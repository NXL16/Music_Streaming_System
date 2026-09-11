CREATE TYPE "SongVideoKind" AS ENUM ('OFFICIAL', 'LYRIC', 'LIVE');

CREATE TABLE "song_videos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "songId" VARCHAR(128) NOT NULL,
  "videoAssetId" VARCHAR(128) NOT NULL,
  "kind" "SongVideoKind" NOT NULL DEFAULT 'OFFICIAL',
  "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "song_videos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "song_videos_videoAssetId_key" ON "song_videos"("videoAssetId");
CREATE UNIQUE INDEX "song_videos_songId_kind_key" ON "song_videos"("songId", "kind");
CREATE INDEX "song_videos_songId_publishedAt_idx" ON "song_videos"("songId", "publishedAt" DESC);

ALTER TABLE "song_videos"
  ADD CONSTRAINT "song_videos_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "songs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
