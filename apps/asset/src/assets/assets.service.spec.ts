import assert from 'node:assert/strict';
import test from 'node:test';
import { createCipheriv } from 'node:crypto';
import { AssetKind, AssetPurpose } from '@musical/shared-proto';
import { AssetsService } from './assets.service';

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
    { get: () => undefined } as never,
  ) as unknown as AssetsInternals;
}

void test('an upload retry is refused while artifact cleanup has a live lease', async () => {
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
    () => service.cancelArtifactCleanup(transaction, 'asset-1'),
    (error: unknown) => {
      assert.equal(
        (error as { message?: string }).message,
        'ASSET_ARTIFACT_CLEANUP_IN_PROGRESS',
      );
      return true;
    },
  );
  assert.equal(deleteCalls, 0);
});

void test('an upload retry cancels a delayed cleanup intent before reprocessing', async () => {
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

  await service.cancelArtifactCleanup(transaction, 'asset-1');

  assert.deepEqual(deleteInput, { where: { assetId: 'asset-1' } });
});

void test('concurrent equivalent upload requests converge on one asset', async () => {
  const asset = {
    id: 'asset-1',
    kind: 'IMAGE',
    purpose: 'ARTWORK',
    status: 'PENDING_UPLOAD',
    filename: 'cover.png',
    contentType: 'image/png',
    checksum: 'a'.repeat(64),
    sizeBytes: BigInt(12),
    sourceObjectKey: 'assets/image/artwork/owner/aa/checksum/cover.png',
    publicUrl: '',
    width: 0,
    height: 0,
    durationMillis: 0,
    variants: null,
    errorMessage: '',
    createdBy: 'owner',
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
          Object.assign(new Error('duplicate'), { code: 'P2002' }),
        );
      },
    },
  };
  const storage = {
    createUploadUrl: () => Promise.resolve('https://upload.example.test'),
  };
  const service = new AssetsService(
    prisma as never,
    storage as never,
    { get: () => undefined } as never,
  );
  const request = {
    kind: AssetKind.ASSET_KIND_IMAGE,
    purpose: AssetPurpose.ASSET_PURPOSE_ARTWORK,
    filename: 'cover.png',
    contentType: 'image/png',
    checksum: 'a'.repeat(64),
    sizeBytes: 12,
    actorUserId: 'owner',
  };

  const results = await Promise.all([
    service.requestUpload(request),
    service.requestUpload(request),
  ]);

  assert.equal(createCalls, 2);
  assert.deepEqual(results.map((result) => result.asset?.id), ['asset-1', 'asset-1']);
  assert.deepEqual(
    results.map((result) => result.uploadUrl),
    ['https://upload.example.test', 'https://upload.example.test'],
  );
});

void test('a ready music video key is decrypted only from its wrapped database record', async () => {
  const wrappingKey = Buffer.from('ab'.repeat(32), 'hex');
  const plaintextKey = Buffer.from('cd'.repeat(16), 'hex');
  const iv = Buffer.from('ef'.repeat(12), 'hex');
  const cipher = createCipheriv('aes-256-gcm', wrappingKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintextKey),
    cipher.final(),
  ]);
  const asset = {
    id: 'asset-1',
    kind: 'VIDEO',
    purpose: 'MUSIC_VIDEO',
    status: 'READY',
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
    {
      get: (key: string) =>
        key === 'ASSET_VIDEO_KEY_ENCRYPTION_KEY'
          ? wrappingKey.toString('hex')
          : undefined,
    } as never,
  );

  const result = await service.getMusicVideoKey({ assetId: asset.id });

  assert.deepEqual(Buffer.from(result.key), plaintextKey);
});
