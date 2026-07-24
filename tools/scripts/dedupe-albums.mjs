#!/usr/bin/env node

/**
 * Dedupe Albums — dọn album trùng lặp trong DB của song service.
 *
 * Cách gộp (an toàn, không mất liên kết bài hát):
 *   1. Chỉ nhóm các record clone: cùng tên, nghệ sĩ, artwork, single flag và
 *      cùng tập bản thu (ưu tiên ISRC). UPC/ngày phát hành không được dùng vì
 *      hai record clone từ nguồn khác vẫn có thể khác metadata kỹ thuật.
 *   2. Mỗi nhóm chọn 1 "survivor": nhiều track nhất → có artwork → tạo sớm nhất.
 *   3. Chuyển các track / artist-credit CHỈ có ở loser sang survivor (đổi position
 *      để tránh đụng unique constraint). Bài hát (bảng songs) KHÔNG bị xoá — chỉ
 *      là liên kết album_tracks.
 *   4. Bù các field rỗng của survivor (artwork, upc, url...) từ loser nếu có.
 *   5. Cập nhật trackCount, xoá loser album (cascade dọn track/credit còn lại).
 *   6. Xoá CatalogDraft trỏ tới loser (nếu có) để guard không kẹt.
 *   7. Xoá Recommendation snapshot của loser để Home không giữ card mồ côi.
 *
 * Standard/Deluxe không bị gộp ở đây: tracklist của chúng khác nhau. Chúng là
 * edition hợp lệ và được xử lý bằng canonicalReleaseId ở Recommendation.
 *
 * Usage (chạy từ gốc repo):
 *   node tools/scripts/dedupe-albums.mjs            # DRY-RUN: chỉ in ra sẽ làm gì
 *   node tools/scripts/dedupe-albums.mjs --apply    # thực thi (trong 1 transaction)
 *
 * Đọc DATABASE_URL tương ứng từ apps/song/.env và apps/recommendation/.env.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const APPLY = process.argv.slice(2).includes('--apply');

// ─── ANSI ──────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
};
const log = (m) => console.log(m);
const info = (m) => log(`${c.blue}ℹ${c.reset} ${m}`);
const ok = (m) => log(`${c.green}✓${c.reset} ${m}`);
const warn = (m) => log(`${c.yellow}⚠${c.reset} ${m}`);

// ─── DATABASE_URL từ .env của service ───────────────────
function loadDatabaseUrl(service, { allowProcessEnv = false } = {}) {
  if (allowProcessEnv && process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve(__dirname, `../../apps/${service}/.env`);
  if (!fs.existsSync(envPath)) {
    throw new Error(`Không tìm thấy ${envPath} và cũng không có env DATABASE_URL`);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) {
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  throw new Error(`Không tìm thấy DATABASE_URL trong ${envPath}`);
}

async function invalidateRecommendationSnapshots(albumIds) {
  if (albumIds.length === 0) return 0;

  const client = new Client({ connectionString: loadDatabaseUrl('recommendation') });
  await client.connect();
  try {
    // RecommendationSectionItem uses RESTRICT because resource is optional while
    // a page is being assembled. Remove card links first; page links cascade when
    // the snapshot is removed.
    await client.query(
      `DELETE FROM recommendation_section_items
       WHERE "resourceType" = 'albums' AND "resourceId" = ANY($1::text[])`,
      [albumIds],
    );
    const result = await client.query(
      `DELETE FROM recommendation_resource_snapshots
       WHERE "resourceType" = 'albums' AND "resourceId" = ANY($1::text[])`,
      [albumIds],
    );
    return result.rowCount ?? 0;
  } finally {
    await client.end();
  }
}

// ─── Normalize: PHẢI khớp normalizedCatalogText/normalizedRecommendationText ──
function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function recordingKey(track) {
  const isrc = normalizeText(track.isrc);
  if (isrc) return `isrc:${isrc}`;
  const name = normalizeText(track.catalogTitle);
  const artist = normalizeText(track.artistName);
  return name && artist ? `metadata:${name}::${artist}` : '';
}

function exactCloneKey(album, trackSignature) {
  const name = normalizeText(album.name);
  const artist = normalizeText(album.artistName);
  const artwork = String(album.artworkAssetId || '').trim();
  if (!name || !artist || !artwork || !trackSignature) return `id:${album.id}`;
  return [name, artist, artwork, album.isSingle ? 'single' : 'album', trackSignature].join('::');
}

// survivor: nhiều track nhất → có artwork → tạo sớm nhất → id nhỏ nhất
function pickSurvivor(group) {
  return [...group].sort((a, b) => {
    if (b.trackCount !== a.trackCount) return b.trackCount - a.trackCount;
    const aArt = a.artworkAssetId ? 1 : 0;
    const bArt = b.artworkAssetId ? 1 : 0;
    if (bArt !== aArt) return bArt - aArt;
    if (+a.createdAt !== +b.createdAt) return +a.createdAt - +b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

async function main() {
  const connectionString = loadDatabaseUrl('song', { allowProcessEnv: true });
  const client = new Client({ connectionString });
  await client.connect();
  log('');
  info(`Kết nối DB song. Chế độ: ${APPLY ? c.red + 'APPLY (ghi thật)' + c.reset : c.cyan + 'DRY-RUN' + c.reset}`);

  try {
    const { rows: albums } = await client.query(
      `SELECT id, storefront, name, "artistName", "artworkAssetId", artwork,
              "editorialArtworkAssetId", upc, url, "releaseDate", "trackCount",
              "isSingle", "createdAt"
         FROM albums`,
    );
    const { rows: albumTracks } = await client.query(
      `SELECT at."albumId", s.isrc, s."catalogTitle", s."artistName"
         FROM album_tracks at
         JOIN songs s ON s.id = at."songId"`,
    );
    info(`Tổng số album: ${albums.length}`);

    const trackKeysByAlbum = new Map();
    for (const track of albumTracks) {
      const key = recordingKey(track);
      if (!key) continue;
      const keys = trackKeysByAlbum.get(track.albumId) || new Set();
      keys.add(key);
      trackKeysByAlbum.set(track.albumId, keys);
    }

    // Chỉ nhóm record clone thật sự. id:/... nghĩa là thiếu metadata để kết luận.
    const groups = new Map();
    for (const a of albums) {
      const trackSignature = [...(trackKeysByAlbum.get(a.id) || [])].sort().join('|');
      const key = exactCloneKey(a, trackSignature);
      if (key.startsWith('id:')) continue;
      const full = `${a.storefront}||${key}`;
      if (!groups.has(full)) groups.set(full, []);
      groups.get(full).push(a);
    }

    const dupGroups = [...groups.entries()].filter(([, g]) => g.length > 1);
    if (dupGroups.length === 0) {
      ok('Không tìm thấy album trùng lặp. DB đã sạch.');
      return;
    }

    warn(`Tìm thấy ${dupGroups.length} nhóm trùng, tổng ${dupGroups.reduce((n, [, g]) => n + g.length, 0)} album.`);
    log('');

    if (APPLY) await client.query('BEGIN');

    let deleted = 0, tracksMoved = 0, creditsMoved = 0, draftsRemoved = 0;
    let invalidatedSnapshots = 0;
    const deletedAlbumIds = [];

    for (const [full, group] of dupGroups) {
      const survivor = pickSurvivor(group);
      const losers = group.filter((a) => a.id !== survivor.id);
      const key = full.split('||').slice(1).join('||');

      log(`${c.bold}▸ ${key}${c.reset}`);
      log(`  survivor: ${survivor.id} ${c.dim}"${survivor.name}" — ${survivor.artistName} (${survivor.trackCount} track${survivor.artworkAssetId ? ', artwork' : ''})${c.reset}`);

      // Track & credit hiện có của survivor
      const { rows: sTracks } = await client.query(
        `SELECT "songId", position FROM album_tracks WHERE "albumId" = $1`, [survivor.id]);
      const survivorSongs = new Set(sTracks.map((t) => t.songId));
      let maxTrackPos = sTracks.reduce((m, t) => Math.max(m, t.position), 0);

      const { rows: sCredits } = await client.query(
        `SELECT "artistId", position FROM album_artist_credits WHERE "albumId" = $1`, [survivor.id]);
      const survivorArtists = new Set(sCredits.map((cr) => cr.artistId));
      let maxCreditPos = sCredits.reduce((m, cr) => Math.max(m, cr.position), 0);

      for (const loser of losers) {
        log(`  loser:    ${loser.id} ${c.dim}"${loser.name}" — ${loser.artistName} (${loser.trackCount} track)${c.reset}`);

        // 1. Chuyển track chỉ có ở loser
        const { rows: lTracks } = await client.query(
          `SELECT "songId", "discNumber", popularity FROM album_tracks WHERE "albumId" = $1`, [loser.id]);
        for (const t of lTracks) {
          if (survivorSongs.has(t.songId)) continue; // survivor đã có bài này
          survivorSongs.add(t.songId);
          maxTrackPos += 1;
          log(`    ${c.green}+track${c.reset} ${t.songId} → position ${maxTrackPos}`);
          tracksMoved += 1;
          if (APPLY) {
            await client.query(
              `INSERT INTO album_tracks ("albumId", "songId", position, "discNumber", popularity)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
              [survivor.id, t.songId, maxTrackPos, t.discNumber ?? 1, t.popularity ?? null]);
          }
        }

        // 2. Chuyển artist-credit chỉ có ở loser
        const { rows: lCredits } = await client.query(
          `SELECT "artistId" FROM album_artist_credits WHERE "albumId" = $1`, [loser.id]);
        for (const cr of lCredits) {
          if (survivorArtists.has(cr.artistId)) continue;
          survivorArtists.add(cr.artistId);
          maxCreditPos += 1;
          creditsMoved += 1;
          if (APPLY) {
            await client.query(
              `INSERT INTO album_artist_credits ("albumId", "artistId", position)
               VALUES ($1, $2, $3)
               ON CONFLICT DO NOTHING`,
              [survivor.id, cr.artistId, maxCreditPos]);
          }
        }

        // 3. Xoá CatalogDraft trỏ tới loser
        if (APPLY) {
          const del = await client.query(
            `DELETE FROM catalog_drafts WHERE "resourceType" = 'albums' AND "resourceId" = $1`,
            [loser.id]);
          draftsRemoved += del.rowCount ?? 0;
        }
      }

      // 4. Bù field rỗng của survivor từ loser đầu tiên có dữ liệu
      const fill = {};
      const fillIfEmpty = (col, cur, cand) => {
        if ((cur === null || cur === '' || cur === undefined) && cand) fill[col] = cand;
      };
      for (const loser of losers) {
        fillIfEmpty('artworkAssetId', survivor.artworkAssetId || fill.artworkAssetId, loser.artworkAssetId);
        fillIfEmpty('upc', survivor.upc || fill.upc, loser.upc);
        fillIfEmpty('url', survivor.url || fill.url, loser.url);
        fillIfEmpty('editorialArtworkAssetId', survivor.editorialArtworkAssetId || fill.editorialArtworkAssetId, loser.editorialArtworkAssetId);
        if ((survivor.artwork === null) && !fill.artwork && loser.artwork) fill.artwork = loser.artwork;
      }
      const fillCols = Object.keys(fill);
      if (fillCols.length && APPLY) {
        const sets = fillCols.map((col, i) => `"${col}" = $${i + 2}`).join(', ');
        const vals = fillCols.map((col) => (col === 'artwork' ? JSON.stringify(fill[col]) : fill[col]));
        await client.query(`UPDATE albums SET ${sets} WHERE id = $1`, [survivor.id, ...vals]);
      }
      if (fillCols.length) log(`    ${c.cyan}bù field${c.reset} survivor: ${fillCols.join(', ')}`);

      // 5. Cập nhật trackCount + xoá loser
      const newTrackCount = survivorSongs.size;
      if (APPLY) {
        await client.query(`UPDATE albums SET "trackCount" = $2 WHERE id = $1`, [survivor.id, newTrackCount]);
        for (const loser of losers) {
          await client.query(`DELETE FROM albums WHERE id = $1`, [loser.id]);
          deletedAlbumIds.push(loser.id);
        }
      }
      deleted += losers.length;
      log(`  ${c.red}xoá ${losers.length} loser${c.reset}, survivor trackCount → ${newTrackCount}`);
      log('');
    }

    if (APPLY) {
      invalidatedSnapshots = await invalidateRecommendationSnapshots(deletedAlbumIds);
      await client.query('COMMIT');
      ok(`ĐÃ GHI. Xoá ${deleted} album, chuyển ${tracksMoved} track + ${creditsMoved} credit, dọn ${draftsRemoved} draft, vô hiệu ${invalidatedSnapshots} snapshot Recommendation.`);
    } else {
      warn(`DRY-RUN — chưa ghi gì. Sẽ xoá ${deleted} album, chuyển ${tracksMoved} track + ${creditsMoved} credit.`);
      info(`Chạy lại với ${c.bold}--apply${c.reset} để thực thi.`);
    }
  } catch (err) {
    if (APPLY) {
      await client.query('ROLLBACK').catch(() => {});
      log(`${c.red}✗ Lỗi — đã ROLLBACK, DB không đổi.${c.reset}`);
    }
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`${c.red}${err.stack || err.message}${c.reset}`);
  process.exit(1);
});
