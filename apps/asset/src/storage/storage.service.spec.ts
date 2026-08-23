import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageService } from './storage.service';

type StorageInternals = {
  client: {
    send: (command: unknown) => Promise<{ Errors?: Array<{ Code?: string }> }>;
  };
};

function storageWith(
  send: StorageInternals['client']['send'],
): StorageService {
  const service = new StorageService({
    getOrThrow: (key: string) =>
      ({
        R2_BUCKET: 'assets',
        CDN_URL: 'https://cdn.example.test',
        R2_ENDPOINT: 'https://r2.example.test',
        R2_ACCESS_KEY: 'key',
        R2_SECRET_KEY: 'secret',
      })[key],
  } as never) as unknown as StorageInternals;
  service.client = { send };
  return service as unknown as StorageService;
}

void test('deleteMany fails when R2 reports a partial delete', async () => {
  const service = storageWith(() =>
    Promise.resolve({
      Errors: [{ Code: 'AccessDenied' }, { Code: 'AccessDenied' }],
    }),
  );

  await assert.rejects(
    () => service.deleteMany(['a', 'b']),
    /STORAGE_DELETE_PARTIAL_FAILURE count=2 codes=AccessDenied/,
  );
});

void test('deleteMany accepts a successful R2 delete response', async () => {
  let calls = 0;
  const service = storageWith(() => {
    calls += 1;
    return Promise.resolve({});
  });

  await service.deleteMany(['a', 'a', 'b']);

  assert.equal(calls, 1);
});
