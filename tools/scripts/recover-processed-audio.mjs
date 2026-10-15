#!/usr/bin/env node

/**
 * Rebuild R2 processed audio without changing song IDs or catalog relations.
 *
 * It finds each original audio file under tools/scripts/.tmp, verifies its
 * SHA-256 against the seed state.json, uploads it under recovery/, then queues
 * the existing song for the normal transcode worker.
 *
 * Run a dry run first. --apply is deliberately required for every mutation.
 *
 *   pnpm recovery:processed -- --dry-run
 *   pnpm recovery:processed -- --apply
 *   pnpm recovery:processed -- --dry-run --artist alex-warren
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '../..');
const requireFromSong = createRequire(path.join(root, 'apps/song/package.json'));
const { Client } = requireFromSong('pg');
const { PutObjectCommand, S3Client } = requireFromSong('@aws-sdk/client-s3');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const dryRun = args.has('--dry-run');
const artistIndex = process.argv.indexOf('--artist');
const artistFilter = artistIndex >= 0 ? process.argv[artistIndex + 1]?.trim() : '';

if (args.has('--help') || args.has('-h')) {
  console.log('Usage: pnpm recovery:processed -- --dry-run [--artist <folder>]');
  console.log('       pnpm recovery:processed -- --apply [--artist <folder>]');
  process.exit(0);
}
if (apply === dryRun) {
  throw new Error('Use exactly one of --dry-run or --apply.');
}
if (artistIndex >= 0 && !artistFilter) {
  throw new Error('--artist requires a folder name, for example --artist alex-warren.');
}

function parseEnvFile(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith('#')) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in apps/song/.env.`);
  return value;
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function audioMime(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.m4a') return 'audio/mp4';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.flac') return 'audio/flac';
  return 'application/octet-stream';
}

function quotedIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function sourceCandidates(tmpRoot) {
  const artists = fs.readdirSync(tmpRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !artistFilter || name === artistFilter);
  if (artistFilter && artists.length === 0) {
    throw new Error(`No .tmp folder named ${artistFilter}.`);
  }

  const result = [];
  for (const artist of artists) {
    const artistRoot = path.join(tmpRoot, artist);
    const statePath = path.join(artistRoot, 'state.json');
    if (!fs.existsSync(statePath)) continue;
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const checksums = new Map(Object.entries(state.checksumMap ?? {}).map(([checksum, info]) => [checksum.toLowerCase(), info]));
    if (checksums.size === 0) continue;
    const audioRoot = path.join(artistRoot, 'audio');
    if (!fs.existsSync(audioRoot)) continue;
    for (const file of walk(audioRoot)) {
      if (!['.mp3', '.m4a', '.wav', '.flac'].includes(path.extname(file).toLowerCase())) continue;
      const checksum = await sha256(file);
      const mapped = checksums.get(checksum);
      if (mapped?.songId) result.push({ artist, file, checksum, songId: String(mapped.songId), title: String(mapped.title ?? '') });
    }
  }
  return result;
}

async function main() {
  const tmpRoot = path.join(root, 'tools/scripts/.tmp');
  const envPath = path.join(root, 'apps/song/.env');
  if (!fs.existsSync(tmpRoot)) throw new Error(`Missing source directory: ${tmpRoot}`);
  if (!fs.existsSync(envPath)) throw new Error(`Missing configuration: ${envPath}`);

  const candidates = await sourceCandidates(tmpRoot);
  if (candidates.length === 0) throw new Error('No local audio file matched checksumMap in any state.json.');

  const bySongId = new Map();
  for (const candidate of candidates) {
    const existing = bySongId.get(candidate.songId);
    if (existing && existing.checksum !== candidate.checksum) {
      throw new Error(`More than one checksum maps to song ${candidate.songId}; stop and inspect state.json.`);
    }
    bySongId.set(candidate.songId, candidate);
  }

  const env = parseEnvFile(envPath);
  const database = new Client({ connectionString: required(env, 'DATABASE_URL') });
  await database.connect();
  try {
    const ids = [...bySongId.keys()];
    const { rows } = await database.query(
      `SELECT id, checksum, status, "audioMode" AS audio_mode, "sourceObjectPath" AS source_path
       FROM songs WHERE id = ANY($1::text[])`,
      [ids],
    );
    const records = new Map(rows.map((row) => [row.id, row]));
    const plan = [];
    const invalid = [];
    const alreadyQueued = [];
    for (const candidate of bySongId.values()) {
      const row = records.get(candidate.songId);
      if (!row) {
        invalid.push({ ...candidate, reason: 'song ID does not exist in current database' });
      } else if (String(row.checksum ?? '').toLowerCase() !== candidate.checksum) {
        invalid.push({ ...candidate, reason: 'database checksum differs from local source' });
      } else if (Number(row.status) === 2) {
        alreadyQueued.push({ ...candidate, reason: 'already PROCESSING; preserved for resume' });
      } else {
        plan.push({ ...candidate, previousStatus: Number(row.status), mode: row.audio_mode });
      }
    }

    for (const entry of plan) {
      console.log(`READY  ${entry.songId}  [${entry.mode}]  ${path.relative(root, entry.file)}`);
    }
    for (const entry of alreadyQueued) {
      console.log(`SKIP   ${entry.songId}  ${entry.reason}  ${path.relative(root, entry.file)}`);
    }
    for (const entry of invalid) {
      console.log(`SKIP   ${entry.songId}  ${entry.reason}  ${path.relative(root, entry.file)}`);
    }
    console.log(`\nSummary: ${plan.length} ready, ${alreadyQueued.length} already queued, ${invalid.length} invalid.`);
    if (dryRun) {
      console.log('Dry run only: R2 and database were not changed.');
      return;
    }
    if (invalid.length) {
      throw new Error('Refusing --apply because validation failed. Resolve invalid entries or use --artist to recover a validated subset.');
    }

    const r2 = new S3Client({
      region: 'auto',
      maxAttempts: 5,
      endpoint: required(env, 'R2_ENDPOINT'),
      credentials: {
        accessKeyId: required(env, 'R2_ACCESS_KEY'),
        secretAccessKey: required(env, 'R2_SECRET_KEY'),
      },
    });
    const bucket = required(env, 'R2_BUCKET');
    for (const entry of plan) {
      const sourceKey = `recovery/${entry.checksum}/${path.basename(entry.file)}`;
      try {
        await r2.send(new PutObjectCommand({
          Bucket: bucket,
          Key: sourceKey,
          Body: fs.createReadStream(entry.file),
          ContentType: audioMime(entry.file),
          Metadata: { 'recovery-song-id': entry.songId, 'source-sha256': entry.checksum },
        }));
      } catch (error) {
        throw new Error(`R2 upload failed for ${entry.songId} (${path.relative(root, entry.file)}). Re-run the same --apply command to resume from this item. ${error instanceof Error ? error.message : String(error)}`);
      }

      await database.query('BEGIN');
      try {
        const updated = await database.query(
          `UPDATE songs SET
             "sourceObjectPath" = $1,
             status = 2,
             "transcodeVersion" = "transcodeVersion" + 1,
             "audioAnalysisStatus" = 'PENDING',
             "audioAnalysisVersion" = '',
             "audioBpm" = NULL,
             "audioEnergy" = NULL,
             "audioTags" = ARRAY[]::text[],
             "audioEmbedding" = ARRAY[]::double precision[],
             "audioAnalysisError" = '',
             "audioAnalyzedAt" = NULL,
             "updatedAt" = NOW()
           WHERE id = $2 AND checksum = $3
           RETURNING "transcodeVersion", "audioMode"`,
          [sourceKey, entry.songId, entry.checksum],
        );
        if (updated.rowCount !== 1) throw new Error(`Song changed during recovery: ${entry.songId}`);
        const song = updated.rows[0];
        await database.query(
          `INSERT INTO transcode_outbox
             (id, "songId", "sourceObjectPath", checksum, "audioMode", "metadataVersion", attempts, "availableAt", "lockedAt", "lockedBy", "lastError", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, 0, NOW(), NULL, NULL, '', NOW(), NOW())
           ON CONFLICT ("songId") DO UPDATE SET
             "sourceObjectPath" = EXCLUDED."sourceObjectPath",
             checksum = EXCLUDED.checksum,
             "audioMode" = EXCLUDED."audioMode",
             "metadataVersion" = EXCLUDED."metadataVersion",
             attempts = 0,
             "availableAt" = NOW(),
             "lockedAt" = NULL,
             "lockedBy" = NULL,
             "lastError" = '',
             "updatedAt" = NOW()`,
          [crypto.randomUUID(), entry.songId, sourceKey, entry.checksum, song.audioMode, song.transcodeVersion],
        );
        await database.query('COMMIT');
        console.log(`QUEUED ${entry.songId} → ${sourceKey}`);
      } catch (error) {
        await database.query('ROLLBACK');
        throw error;
      }
    }
    console.log(`Queued ${plan.length} songs. Keep Song service, transcoder, Redis, and completion consumer running until all return to READY.`);
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error(`Recovery failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
