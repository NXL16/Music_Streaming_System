CREATE TABLE "asset_video_encryption_keys" (
    "assetId" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "asset_video_encryption_keys_pkey" PRIMARY KEY ("assetId"),
    CONSTRAINT "asset_video_encryption_keys_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
