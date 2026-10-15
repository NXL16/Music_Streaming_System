#!/usr/bin/env node

/** Read-only integrity check for recovered stream objects. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromSong = createRequire(path.join(root, 'apps/song/package.json'));
const { Client } = requireFromSong('pg');
const { HeadObjectCommand, S3Client } = requireFromSong('@aws-sdk/client-s3');
const limitFlag = process.argv.indexOf('--limit');
const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : Number.POSITIVE_INFINITY;
const concurrencyFlag = process.argv.indexOf('--concurrency');
const concurrency = concurrencyFlag >= 0 ? Number(process.argv[concurrencyFlag + 1]) : 16;
if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(concurrency) || concurrency <= 0) {
  throw new Error('--limit and --concurrency must be positive integers.');
}

function readEnv() {
  const file = path.join(root, 'apps/song/.env');
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  for (const name of ['DATABASE_URL', 'R2_ENDPOINT', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET']) {
    if (!values[name]?.trim()) throw new Error(`Missing ${name} in apps/song/.env.`);
  }
  return values;
}

async function main() {
  const env = readEnv();
  const database = new Client({ connectionString: env.DATABASE_URL });
  const r2 = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: { accessKeyId: env.R2_ACCESS_KEY, secretAccessKey: env.R2_SECRET_KEY },
    maxAttempts: 3,
  });
  await database.connect();
  try {
    const { rows } = await database.query(`
      SELECT id, status, "audioMode" AS mode, "encryptedFilePath" AS main
      FROM songs ORDER BY id
    `);
    const expected = [];
    const nonReady = rows.filter((song) => Number(song.status) !== 3);
    for (const song of rows.filter((item) => Number(item.status) === 3)) {
      expected.push({ id: song.id, kind: 'main', key: song.main || '' });
      if (song.mode === 'SING') {
        expected.push({ id: song.id, kind: 'instrumental', key: `processed/${song.id}/instrumental.m4a` });
        expected.push({ id: song.id, kind: 'vocal', key: `processed/${song.id}/vocal.m4a` });
      }
    }
    const selected = expected.slice(0, limit);
    const missing = [];
    const failures = [];
    let index = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (index < selected.length) {
        const item = selected[index++];
        if (!item.key) {
          missing.push(item);
          continue;
        }
        try {
          await r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: item.key }));
        } catch (error) {
          const status = error?.$metadata?.httpStatusCode;
          const target = { ...item, status: status ?? 'unknown' };
          if (status === 404 || error?.name === 'NotFound') missing.push(target);
          else failures.push({
            ...target,
            error: error?.name ?? 'Error',
            detail: error?.errors?.[0]?.message ?? error?.message ?? '',
          });
        }
      }
    }));
    console.log(JSON.stringify({
      songs: rows.length,
      ready: rows.length - nonReady.length,
      nonReady: nonReady.length,
      expectedObjects: expected.length,
      checkedObjects: selected.length,
      missingCount: missing.length,
      requestFailureCount: failures.length,
      missing: missing.slice(0, 20),
      requestFailures: failures.slice(0, 20),
    }, null, 2));
    if (nonReady.length || missing.length || failures.length) process.exitCode = 1;
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error(`Audio verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
