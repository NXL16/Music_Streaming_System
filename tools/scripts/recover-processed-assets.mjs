#!/usr/bin/env node

/**
 * Recreates generated artwork/avatar/video files under processed/<assetId>/.
 * Original sources remain in R2 under assets/, and existing asset IDs are kept.
 *
 * Usage:
 *   pnpm recovery:assets -- --dry-run
 *   pnpm recovery:assets -- --asset-id <assetId> --dry-run
 *   pnpm recovery:assets -- --asset-id <assetId> --apply
 *   pnpm recovery:assets -- --kind VIDEO --dry-run
 *   pnpm recovery:assets -- --kind VIDEO --apply
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromAsset = createRequire(path.join(root, 'apps/asset/package.json'));
const { Client } = requireFromAsset('pg');
const { HeadObjectCommand, S3Client } = requireFromAsset('@aws-sdk/client-s3');
const argv = process.argv.slice(2);
const args = new Set(argv);
const apply = args.has('--apply');
const dryRun = args.has('--dry-run');
const assetIdFlag = argv.indexOf('--asset-id');
const onlyAssetId = assetIdFlag >= 0 ? (argv[assetIdFlag + 1] ?? '').trim() : '';
const kindFlag = argv.indexOf('--kind');
const onlyKind = kindFlag >= 0 ? (argv[kindFlag + 1] ?? '').trim().toUpperCase() : '';

if (args.has('--help') || args.has('-h')) {
  console.log('Usage: pnpm recovery:assets -- --dry-run');
  console.log('       pnpm recovery:assets -- --apply');
  console.log('       pnpm recovery:assets -- --asset-id <assetId> --dry-run');
  console.log('       pnpm recovery:assets -- --asset-id <assetId> --apply');
  console.log('       pnpm recovery:assets -- --kind VIDEO --dry-run');
  console.log('       pnpm recovery:assets -- --kind VIDEO --apply');
  process.exit(0);
}
if (apply === dryRun) throw new Error('Use exactly one of --dry-run or --apply.');
if (assetIdFlag >= 0 && !onlyAssetId) throw new Error('--asset-id requires a value.');
if (kindFlag >= 0 && !['IMAGE', 'VIDEO'].includes(onlyKind)) throw new Error('--kind must be IMAGE or VIDEO.');

function readEnv() {
  const envPath = path.join(root, 'apps/asset/.env');
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}.`);
  const values = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  for (const name of ['DATABASE_URL', 'R2_ENDPOINT', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET']) {
    if (!values[name]?.trim()) throw new Error(`Missing ${name} in apps/asset/.env.`);
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
    forcePathStyle: true,
    maxAttempts: 5,
  });
  await database.connect();
  try {
    const filters = ["status = 'READY'"];
    const parameters = [];
    if (onlyAssetId) {
      parameters.push(onlyAssetId);
      filters.push(`id = $${parameters.length}`);
    }
    if (onlyKind) {
      parameters.push(onlyKind);
      filters.push(`kind = $${parameters.length}`);
    }
    const query = `
      SELECT id, kind, purpose, "sourceObjectKey" AS source_key
      FROM assets
      WHERE ${filters.join(' AND ')}
      ORDER BY "createdAt", id
    `;
    const { rows } = await database.query(query, parameters);
    if (onlyAssetId && rows.length !== 1) {
      throw new Error(`Asset is not READY or does not exist: ${onlyAssetId}`);
    }
    const sourceMissing = [];
    const sourceFailures = [];
    let index = 0;
    await Promise.all(Array.from({ length: 12 }, async () => {
      while (index < rows.length) {
        const asset = rows[index++];
        try {
          await r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: asset.source_key }));
        } catch (error) {
          const status = error?.$metadata?.httpStatusCode;
          const record = { id: asset.id, kind: asset.kind, purpose: asset.purpose, sourceKey: asset.source_key, status: status ?? 'unknown' };
          if (status === 404 || error?.name === 'NotFound') sourceMissing.push(record);
          else sourceFailures.push({ ...record, error: error?.name ?? 'Error' });
        }
      }
    }));
    const valid = rows.filter((asset) => !sourceMissing.some((item) => item.id === asset.id) && !sourceFailures.some((item) => item.id === asset.id));
    console.log(JSON.stringify({
      readyAssets: rows.length,
      selectedAssetId: onlyAssetId || undefined,
      selectedKind: onlyKind || undefined,
      recoverable: valid.length,
      sourceMissingCount: sourceMissing.length,
      sourceRequestFailureCount: sourceFailures.length,
      sourceMissing: sourceMissing.slice(0, 20),
      sourceRequestFailures: sourceFailures.slice(0, 20),
    }, null, 2));
    if (dryRun) {
      console.log('Dry run only: R2 and database were not changed.');
      if (sourceMissing.length || sourceFailures.length) process.exitCode = 1;
      return;
    }
    if (sourceMissing.length || sourceFailures.length) {
      throw new Error('Refusing --apply until every READY asset source is available in R2.');
    }

    for (const asset of valid) {
      await database.query('BEGIN');
      try {
        const updated = await database.query(
          `UPDATE assets
           SET status = 'PROCESSING', "errorMessage" = '', "updatedAt" = NOW()
           WHERE id = $1 AND status = 'READY'
           RETURNING id`,
          [asset.id],
        );
        if (updated.rowCount !== 1) throw new Error(`Asset changed during recovery: ${asset.id}`);
        await database.query('DELETE FROM asset_artifact_cleanup_jobs WHERE "assetId" = $1', [asset.id]);
        await database.query(
          `INSERT INTO asset_processing_jobs
             (id, "assetId", attempts, "availableAt", "lockedAt", "leaseToken", "lastError", "createdAt", "updatedAt")
           VALUES ($1, $2, 0, NOW(), NULL, NULL, '', NOW(), NOW())
           ON CONFLICT ("assetId") DO UPDATE SET
             attempts = 0,
             "availableAt" = NOW(),
             "lockedAt" = NULL,
             "leaseToken" = NULL,
             "lastError" = '',
             "updatedAt" = NOW()`,
          [crypto.randomUUID(), asset.id],
        );
        await database.query('COMMIT');
        console.log(`QUEUED ${asset.id} [${asset.kind}/${asset.purpose}]`);
      } catch (error) {
        await database.query('ROLLBACK');
        throw error;
      }
    }
    console.log(`Queued ${valid.length} assets. Keep Asset service and its worker running; video assets also require the Modal configuration to be healthy.`);
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error(`Asset recovery failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
