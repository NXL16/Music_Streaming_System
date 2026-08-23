-- Legacy Meta records used epoch-millisecond versions. Promote the job-owned
-- counter before any new worker writes so every existing song starts above
-- metadata persisted by older releases; later processing increments this value
-- transactionally and retries reuse the outbox value unchanged.
ALTER TABLE "songs"
ALTER COLUMN "transcodeVersion" TYPE BIGINT
USING "transcodeVersion"::BIGINT;

ALTER TABLE "transcode_outbox"
ALTER COLUMN "metadataVersion" TYPE BIGINT
USING "metadataVersion"::BIGINT;

UPDATE "songs"
SET "transcodeVersion" = FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT
WHERE "transcodeVersion" <= 1;

UPDATE "transcode_outbox" AS outbox
SET "metadataVersion" = song."transcodeVersion"
FROM "songs" AS song
WHERE song."id" = outbox."songId";
