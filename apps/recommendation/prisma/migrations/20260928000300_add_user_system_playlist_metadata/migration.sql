CREATE TABLE "user_system_playlist_metadata" (
    "userId" VARCHAR(128) NOT NULL,
    "playlistKey" VARCHAR(32) NOT NULL,
    "shortDescription" TEXT NOT NULL DEFAULT '',
    "standardDescription" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_system_playlist_metadata_pkey" PRIMARY KEY ("userId", "playlistKey")
);

CREATE INDEX "user_system_playlist_metadata_userId_updatedAt_idx"
ON "user_system_playlist_metadata"("userId", "updatedAt");
