import assert from "node:assert/strict";
import test from "node:test";
import { createCipheriv } from "node:crypto";
import { AssetKind, AssetPurpose } from "@musical/shared-proto";
import { AssetsService } from "./assets.service";

type AssetsInternals = {
  cancelArtifactCleanup: (
    transaction: unknown,
    assetId: string,
  ) => Promise<void>;
};

function assetsWith(): AssetsInternals {
  return new AssetsService(
    {} as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
  ) as unknown as AssetsInternals;
}

void test("an upload retry is refused while artifact cleanup has a live lease", async () => {
  let deleteCalls = 0;
  const transaction = {
    $queryRaw: () => Promise.resolve([{ active: true }]),
    assetArtifactCleanupJob: {
      deleteMany: () => {
        deleteCalls += 1;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const service = assetsWith();

  await assert.rejects(
    () => service.cancelArtifactCleanup(transaction, "asset-1"),
    (error: unknown) => {
      assert.equal(
        (error as { message?: string }).message,
        "ASSET_ARTIFACT_CLEANUP_IN_PROGRESS",
      );
      return true;
    },
  );
  assert.equal(deleteCalls, 0);
});

void test("an upload retry cancels a delayed cleanup intent before reprocessing", async () => {
  let deleteInput: unknown;
  const transaction = {
    $queryRaw: () => Promise.resolve([{ active: false }]),
    assetArtifactCleanupJob: {
      deleteMany: (input: unknown) => {
        deleteInput = input;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const service = assetsWith();

  await service.cancelArtifactCleanup(transaction, "asset-1");

  assert.deepEqual(deleteInput, { where: { assetId: "asset-1" } });
});

void test("concurrent equivalent upload requests converge on one asset", async () => {
  const asset = {
    id: "asset-1",
    kind: "IMAGE",
    purpose: "ARTWORK",
    status: "PENDING_UPLOAD",
    filename: "cover.png",
    contentType: "image/png",
    checksum: "a".repeat(64),
    sizeBytes: BigInt(12),
    sourceObjectKey: "assets/image/artwork/owner/aa/checksum/cover.png",
    publicUrl: "",
    width: 0,
    height: 0,
    durationMillis: 0,
    variants: null,
    errorMessage: "",
    createdBy: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let findCalls = 0;
  let createCalls = 0;
  const prisma = {
    asset: {
      findUnique: () => {
        findCalls += 1;
        return Promise.resolve(findCalls <= 2 ? null : asset);
      },
      create: () => {
        createCalls += 1;
        if (createCalls === 1) return Promise.resolve(asset);
        return Promise.reject(
          Object.assign(new Error("duplicate"), { code: "P2002" }),
        );
      },
    },
  };
  const storage = {
    createUploadUrl: () => Promise.resolve("https://upload.example.test"),
  };
  const service = new AssetsService(
    prisma as never,
    storage as never,
    {} as never,
    { get: () => undefined } as never,
  );
  const request = {
    kind: AssetKind.ASSET_KIND_IMAGE,
    purpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
    filename: "cover.png",
    contentType: "image/png",
    checksum: "a".repeat(64),
    sizeBytes: 12,
    posterTimestampMillis: 0,
    actorUserId: "owner",
  };

  const results = await Promise.all([
    service.requestUpload(request),
    service.requestUpload(request),
  ]);

  assert.equal(createCalls, 2);
  assert.deepEqual(
    results.map((result) => result.asset?.id),
    ["asset-1", "asset-1"],
  );
  assert.deepEqual(
    results.map((result) => result.uploadUrl),
    ["https://upload.example.test", "https://upload.example.test"],
  );
});

void test("a music-video poster timestamp is part of the upload identity", async () => {
  let findInput: unknown;
  const asset = {
    id: "asset-1",
    kind: "VIDEO",
    purpose: "MUSIC_VIDEO",
    status: "READY",
    filename: "video.mp4",
    contentType: "video/mp4",
    checksum: "b".repeat(64),
    sizeBytes: BigInt(12),
    sourceObjectKey: "assets/video/music-video/owner/bb/checksum/video.mp4",
    publicUrl: "https://cdn.example.test/video.m3u8",
    width: 1920,
    height: 1080,
    durationMillis: 5000,
    posterTimestampMillis: 4200,
    variants: null,
    errorMessage: "",
    createdBy: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const service = new AssetsService(
    {
      asset: {
        findUnique: (input: unknown) => {
          findInput = input;
          return Promise.resolve(asset);
        },
      },
    } as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
  );

  await service.requestUpload({
    kind: AssetKind.ASSET_KIND_VIDEO,
    purpose: AssetPurpose.ASSET_PURPOSE_MUSIC_VIDEO,
    filename: "video.mp4",
    contentType: "video/mp4",
    checksum: "b".repeat(64),
    sizeBytes: 12,
    posterTimestampMillis: 4200,
    actorUserId: "owner",
  });

  assert.deepEqual(findInput, {
    where: {
      kind_purpose_checksum_posterTimestampMillis_createdBy: {
        kind: "VIDEO",
        purpose: "MUSIC_VIDEO",
        checksum: "b".repeat(64),
        posterTimestampMillis: 4200,
        createdBy: "owner",
      },
    },
  });
});

void test("replacing a music-video poster preserves its HLS generation", async () => {
  const asset = {
    id: "asset-1",
    kind: "VIDEO",
    purpose: "MUSIC_VIDEO",
    status: "READY",
    filename: "video.mp4",
    contentType: "video/mp4",
    checksum: "c".repeat(64),
    sizeBytes: BigInt(12),
    sourceObjectKey: "assets/video/music-video/owner/cc/checksum/video.mp4",
    publicUrl: "https://cdn.example.test/default.m3u8",
    width: 1920,
    height: 1080,
    durationMillis: 5000,
    posterTimestampMillis: 1000,
    variants: {
      generation: "processed/asset-1/video/generation-1",
      renditions: [{ url: "https://cdn.example.test/default.m3u8" }],
      poster: { url: "https://cdn.example.test/old-poster.webp" },
    },
    errorMessage: "",
    createdBy: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let updateInput: unknown;
  const processor = {
    replaceMusicVideoPoster: () =>
      Promise.resolve({
        url: "https://cdn.example.test/new-poster.webp",
        timestampMillis: 3200,
        bgColor: "123456",
        variants: { renditions: [] },
      }),
  };
  const service = new AssetsService(
    {
      asset: {
        findUnique: () => Promise.resolve(asset),
        updateMany: (input: unknown) => {
          updateInput = input;
          return Promise.resolve({ count: 1 });
        },
      },
    } as never,
    {} as never,
    processor as never,
    { get: () => undefined } as never,
  );

  await service.replaceMusicVideoPoster({
    assetId: asset.id,
    actorUserId: "owner",
    posterTimestampMillis: 3200,
  });

  assert.deepEqual(updateInput, {
    where: {
      id: asset.id,
      status: "READY",
      updatedAt: asset.updatedAt,
    },
    data: {
      variants: {
        generation: "processed/asset-1/video/generation-1",
        renditions: [{ url: "https://cdn.example.test/default.m3u8" }],
        poster: {
          url: "https://cdn.example.test/new-poster.webp",
          timestampMillis: 3200,
          bgColor: "123456",
          variants: { renditions: [] },
        },
      },
    },
  });
});

void test("a ready music video key is decrypted only from its wrapped database record", async () => {
  const wrappingKey = Buffer.from("ab".repeat(32), "hex");
  const plaintextKey = Buffer.from("cd".repeat(16), "hex");
  const iv = Buffer.from("ef".repeat(12), "hex");
  const cipher = createCipheriv("aes-256-gcm", wrappingKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintextKey),
    cipher.final(),
  ]);
  const asset = {
    id: "asset-1",
    kind: "VIDEO",
    purpose: "MUSIC_VIDEO",
    status: "READY",
  };
  const prisma = {
    asset: { findUnique: () => Promise.resolve(asset) },
    assetVideoEncryptionKey: {
      findUnique: () =>
        Promise.resolve({ ciphertext, iv, authTag: cipher.getAuthTag() }),
    },
  };
  const service = new AssetsService(
    prisma as never,
    {} as never,
    {} as never,
    {
      get: (key: string) =>
        key === "ASSET_VIDEO_KEY_ENCRYPTION_KEY"
          ? wrappingKey.toString("hex")
          : undefined,
    } as never,
  );

  const result = await service.getMusicVideoKey({ assetId: asset.id });

  assert.deepEqual(Buffer.from(result.key), plaintextKey);
});
