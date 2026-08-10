-- AlterTable
ALTER TABLE "listening_events" ADD COLUMN     "playlistCuratorName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "user_listening_stats" ADD COLUMN     "playlistCuratorName" TEXT NOT NULL DEFAULT '';
