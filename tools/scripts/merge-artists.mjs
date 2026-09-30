#!/usr/bin/env node

/**
 * Merge duplicate Artist catalog records in the song database.
 * Dry-run by default. Use --apply only after reviewing the plan.
 *
 * Usage:
 *   node tools/scripts/merge-artists.mjs --keep <uuid> --remove <uuid>
 *   node tools/scripts/merge-artists.mjs --keep <uuid> --remove <uuid> --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

function optionValue(name) {
  const index = args.indexOf(name);
  return String(index >= 0 ? args[index + 1] || '' : '').trim();
}

const KEEP_ID = optionValue('--keep');
const REMOVE_ID = optionValue('--remove');
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve(__dirname, '../../apps/song/.env');
  if (!fs.existsSync(envPath)) throw new Error(`Không tìm thấy ${envPath}`);
  const line = fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
  const value = line?.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim();
  if (!value) throw new Error(`Không tìm thấy DATABASE_URL trong ${envPath}`);
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function requireUuid(value, option) {
  if (!UUID_PATTERN.test(value)) throw new Error(`${option} must be a valid UUID`);
}

async function moveMemberships(client) {
  const { rows } = await client.query(
    `SELECT id, "userId" AS user_id, role, "createdBy" AS created_by
       FROM artist_memberships WHERE "artistId" = $1`,
    [REMOVE_ID],
  );
  for (const membership of rows) {
    const existing = await client.query(
      `SELECT id FROM artist_memberships WHERE "artistId" = $1 AND "userId" = $2`,
      [KEEP_ID, membership.user_id],
    );
    if (existing.rowCount > 0) {
      if (APPLY) await client.query(`DELETE FROM artist_memberships WHERE id = $1`, [membership.id]);
      continue;
    }
    if (APPLY) {
      await client.query(
        `UPDATE artist_memberships SET "artistId" = $1 WHERE id = $2`,
        [KEEP_ID, membership.id],
      );
    }
  }
  return rows.length;
}

async function moveAlbumCredits(client) {
  const { rows } = await client.query(
    `SELECT "albumId" AS album_id, "isPrimary" AS is_primary, position
       FROM album_artist_credits WHERE "artistId" = $1 ORDER BY "albumId", position`,
    [REMOVE_ID],
  );
  for (const credit of rows) {
    const existing = await client.query(
      `SELECT "isPrimary" AS is_primary FROM album_artist_credits
        WHERE "albumId" = $1 AND "artistId" = $2`,
      [credit.album_id, KEEP_ID],
    );
    if (existing.rowCount > 0) {
      if (APPLY) {
        await client.query(
          `UPDATE album_artist_credits SET "isPrimary" = ("isPrimary" OR $1)
            WHERE "albumId" = $2 AND "artistId" = $3`,
          [credit.is_primary, credit.album_id, KEEP_ID],
        );
        await client.query(
          `DELETE FROM album_artist_credits WHERE "albumId" = $1 AND "artistId" = $2`,
          [credit.album_id, REMOVE_ID],
        );
      }
      continue;
    }

    const positionResult = await client.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
         FROM album_artist_credits WHERE "albumId" = $1`,
      [credit.album_id],
    );
    const position = Number(positionResult.rows[0].next_position);
    if (APPLY) {
      await client.query(
        `INSERT INTO album_artist_credits ("albumId", "artistId", "isPrimary", position)
         VALUES ($1, $2, $3, $4)`,
        [credit.album_id, KEEP_ID, credit.is_primary, position],
      );
      await client.query(
        `DELETE FROM album_artist_credits WHERE "albumId" = $1 AND "artistId" = $2`,
        [credit.album_id, REMOVE_ID],
      );
    }
  }
  return rows.length;
}

async function moveSongCredits(client) {
  const { rows } = await client.query(
    `SELECT "songId" AS song_id, role, "isPrimary" AS is_primary, position
       FROM song_artist_credits WHERE "artistId" = $1 ORDER BY "songId", role, position`,
    [REMOVE_ID],
  );
  for (const credit of rows) {
    const existing = await client.query(
      `SELECT "isPrimary" AS is_primary FROM song_artist_credits
        WHERE "songId" = $1 AND "artistId" = $2 AND role = $3`,
      [credit.song_id, KEEP_ID, credit.role],
    );
    if (existing.rowCount > 0) {
      if (APPLY) {
        await client.query(
          `UPDATE song_artist_credits SET "isPrimary" = ("isPrimary" OR $1)
            WHERE "songId" = $2 AND "artistId" = $3 AND role = $4`,
          [credit.is_primary, credit.song_id, KEEP_ID, credit.role],
        );
        await client.query(
          `DELETE FROM song_artist_credits
            WHERE "songId" = $1 AND "artistId" = $2 AND role = $3`,
          [credit.song_id, REMOVE_ID, credit.role],
        );
      }
      continue;
    }

    const positionResult = await client.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
         FROM song_artist_credits WHERE "songId" = $1 AND role = $2`,
      [credit.song_id, credit.role],
    );
    const position = Number(positionResult.rows[0].next_position);
    if (APPLY) {
      await client.query(
        `INSERT INTO song_artist_credits ("songId", "artistId", role, "isPrimary", position)
         VALUES ($1, $2, $3, $4, $5)`,
        [credit.song_id, KEEP_ID, credit.role, credit.is_primary, position],
      );
      await client.query(
        `DELETE FROM song_artist_credits
          WHERE "songId" = $1 AND "artistId" = $2 AND role = $3`,
        [credit.song_id, REMOVE_ID, credit.role],
      );
    }
  }
  return rows.length;
}

async function main() {
  requireUuid(KEEP_ID, '--keep');
  requireUuid(REMOVE_ID, '--remove');
  if (KEEP_ID.toLowerCase() === REMOVE_ID.toLowerCase()) {
    throw new Error('--keep and --remove must be different');
  }

  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT id, storefront, name, "genreNames" AS genre_names
         FROM artists WHERE id = ANY($1::text[])`,
      [[KEEP_ID, REMOVE_ID]],
    );
    if (result.rowCount !== 2) throw new Error('Both Artist IDs must exist in the song database');
    const keep = result.rows.find((artist) => artist.id === KEEP_ID);
    const remove = result.rows.find((artist) => artist.id === REMOVE_ID);
    if (keep.storefront !== remove.storefront || normalizeName(keep.name) !== normalizeName(remove.name)) {
      throw new Error('Artists must have the same storefront and normalized name');
    }

    if (APPLY) await client.query('BEGIN');
    const memberships = await moveMemberships(client);
    const albumCredits = await moveAlbumCredits(client);
    const songCredits = await moveSongCredits(client);
    if (APPLY) {
      await client.query(`DELETE FROM artists WHERE id = $1`, [REMOVE_ID]);
      await client.query('COMMIT');
    }

    console.log(`${APPLY ? 'Applied' : 'Dry-run'} merge for "${keep.name}"`);
    console.log(`  keep: ${KEEP_ID}`);
    console.log(`  remove: ${REMOVE_ID}`);
    console.log(`  memberships: ${memberships}`);
    console.log(`  album credits: ${albumCredits}`);
    console.log(`  song credits: ${songCredits}`);
    if (!APPLY) console.log('No database changes were made. Add --apply to execute this merge.');
  } catch (error) {
    if (APPLY) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Merge failed: ${error.message}`);
  process.exitCode = 1;
});