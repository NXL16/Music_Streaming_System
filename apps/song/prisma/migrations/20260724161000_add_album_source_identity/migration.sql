-- Keep external-provider identity separate from the opaque internal album ID.
ALTER TABLE "albums"
  ADD COLUMN "sourceProvider" VARCHAR(32),
  ADD COLUMN "sourceExternalId" VARCHAR(128);

CREATE UNIQUE INDEX "albums_sourceProvider_sourceExternalId_key"
  ON "albums"("sourceProvider", "sourceExternalId");
