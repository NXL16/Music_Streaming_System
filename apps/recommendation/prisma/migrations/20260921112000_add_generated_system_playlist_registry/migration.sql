CREATE TABLE "generated_system_playlists" (
    "id" TEXT NOT NULL,
    "scopeKey" VARCHAR(128) NOT NULL,
    "playlistKey" VARCHAR(32) NOT NULL,
    "playlistId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "generated_system_playlists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generated_system_playlists_playlistId_key"
ON "generated_system_playlists"("playlistId");

CREATE UNIQUE INDEX "generated_system_playlists_scopeKey_playlistKey_key"
ON "generated_system_playlists"("scopeKey", "playlistKey");
