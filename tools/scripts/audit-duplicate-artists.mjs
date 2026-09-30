#!/usr/bin/env node

/**
 * Audit duplicate Artist names in the song database.
 * Read-only: this script never updates or deletes catalog data.
 *
 * Usage:
 *   node tools/scripts/audit-duplicate-artists.mjs
 *   node tools/scripts/audit-duplicate-artists.mjs --name "Minh Anh"
 *   node tools/scripts/audit-duplicate-artists.mjs --json
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
const JSON_OUTPUT = args.includes('--json');
const nameIndex = args.indexOf('--name');
const NAME_FILTER = nameIndex >= 0 ? String(args[nameIndex + 1] || '').trim() : '';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.resolve(__dirname, '../../apps/song/.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Không tìm thấy ${envPath} và cũng không có DATABASE_URL`);
  }

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

function formatGenres(genres) {
  return Array.isArray(genres) && genres.length ? genres.join(', ') : '(none)';
}

function formatArtist(artist) {
  return {
    id: artist.id,
    storefront: artist.storefront,
    name: artist.name,
    genres: artist.genre_names || [],
    artworkAssetId: artist.artwork_asset_id || '',
    albumCredits: Number(artist.album_credit_count),
    songCredits: Number(artist.song_credit_count),
    memberships: Number(artist.membership_count),
    createdAt: artist.created_at,
  };
}

async function main() {
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT
        a.id,
        a.storefront,
        a.name,
        a."genreNames" AS genre_names,
        a."artworkAssetId" AS artwork_asset_id,
        a."createdAt" AS created_at,
        COUNT(DISTINCT sac."songId") AS song_credit_count,
        COUNT(DISTINCT aac."albumId") AS album_credit_count,
        COUNT(DISTINCT am.id) AS membership_count
      FROM artists a
      LEFT JOIN song_artist_credits sac ON sac."artistId" = a.id
      LEFT JOIN album_artist_credits aac ON aac."artistId" = a.id
      LEFT JOIN artist_memberships am ON am."artistId" = a.id
      GROUP BY a.id
      ORDER BY a.name ASC, a."createdAt" ASC, a.id ASC
    `);

    const wantedName = normalizeName(NAME_FILTER);
    const groups = new Map();
    for (const row of rows) {
      const normalized = normalizeName(row.name);
      if (!normalized || (wantedName && normalized !== wantedName)) continue;
      const key = `${row.storefront}::${normalized}`;
      const group = groups.get(key) || [];
      group.push(formatArtist(row));
      groups.set(key, group);
    }

    const duplicates = [...groups.entries()]
      .filter(([, artists]) => artists.length > 1)
      .map(([key, artists]) => {
        const [storefront, normalizedName] = key.split('::');
        return { storefront, normalizedName, artists };
      });

    if (JSON_OUTPUT) {
      console.log(JSON.stringify(duplicates, null, 2));
      return;
    }

    if (duplicates.length === 0) {
      console.log(NAME_FILTER
        ? `Không tìm thấy Artist trùng tên với "${NAME_FILTER}".`
        : 'Không tìm thấy Artist trùng tên trong DB song.');
      return;
    }

    console.log(`Tìm thấy ${duplicates.length} nhóm Artist trùng tên:\n`);
    for (const group of duplicates) {
      console.log(`▸ [${group.storefront}] ${group.artists[0].name} (${group.normalizedName})`);
      for (const artist of group.artists) {
        console.log(`  - id: ${artist.id}`);
        console.log(`    genre: ${formatGenres(artist.genres)}`);
        console.log(`    artwork: ${artist.artworkAssetId || '(none)'}`);
        console.log(`    album credits: ${artist.albumCredits}`);
        console.log(`    song credits: ${artist.songCredits}`);
        console.log(`    memberships: ${artist.memberships}`);
        console.log(`    created: ${artist.createdAt}`);
      }
      console.log('');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Audit failed: ${error.message}`);
  process.exitCode = 1;
});