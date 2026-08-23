ALTER TABLE "songs"
ADD COLUMN "transcodeVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "transcode_outbox"
ADD COLUMN "metadataVersion" INTEGER NOT NULL DEFAULT 0;

-- Existing queued work must receive a stable version before workers enforce
-- the new contract. Jobs already in the Redis stream are drained during the
-- release rehearsal instead of being guessed from arrival time.
UPDATE "songs"
SET "transcodeVersion" = 1
WHERE "transcodeVersion" = 0
  AND EXISTS (
    SELECT 1
    FROM "transcode_outbox"
    WHERE "transcode_outbox"."songId" = "songs"."id"
  );

UPDATE "transcode_outbox" AS outbox
SET "metadataVersion" = song."transcodeVersion"
FROM "songs" AS song
WHERE song."id" = outbox."songId";
