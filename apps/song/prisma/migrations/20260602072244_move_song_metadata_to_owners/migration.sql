/*
  Warnings:

  - You are about to drop the column `album` on the `songs` table. All the data in the column will be lost.
  - You are about to drop the column `artist` on the `songs` table. All the data in the column will be lost.
  - You are about to drop the column `coverUrl` on the `songs` table. All the data in the column will be lost.
  - You are about to drop the column `isPublic` on the `songs` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `songs` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `songs` table. All the data in the column will be lost.
  - You are about to drop the column `uploaderId` on the `songs` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "songs_title_idx";

-- DropIndex
DROP INDEX "songs_uploaderId_idx";

-- AlterTable
ALTER TABLE "song_owners" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "songs" DROP COLUMN "album",
DROP COLUMN "artist",
DROP COLUMN "coverUrl",
DROP COLUMN "isPublic",
DROP COLUMN "tags",
DROP COLUMN "title",
DROP COLUMN "uploaderId";
