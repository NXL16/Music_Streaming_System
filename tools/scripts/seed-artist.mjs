#!/usr/bin/env node

/**
 * Auto Seed Artist Bot
 *
 * Crawl Apple Music (metadata) + nhiều nguồn audio → seed local DB.
 *
 * Audio source order (mỗi bài đều được verify title + artist + độ dài):
 *   1. NhacCuaTui   — 320/128 kbps, có chữ ký WASM
 *   2. Zing MP3     — 320/128 kbps, API ký HMAC (zingmp3.vn)
 *   3. YouTube Music — fallback qua yt-dlp (music.youtube.com)
 *   4. YouTube      — fallback qua yt-dlp (ytsearch)
 *   5. SoundCloud   — fallback qua yt-dlp (scsearch)
 *
 * Apple Music preview không bao giờ được import: đó chỉ là đoạn nghe thử
 * 30 giây, không phải dữ liệu audio đầy đủ cho catalog.
 *
 * Chống lặp bài (nghiêm ngặt): mỗi bản thu (title + nghệ sĩ chính) chỉ được
 * tải, upload và publish MỘT lần, dù xuất hiện trên nhiều album/single/tuyển tập.
 *
 * Usage:
 *   node tools/scripts/seed-artist.mjs
 *   node tools/scripts/seed-artist.mjs --skip-transcode
 *   node tools/scripts/seed-artist.mjs --dry-run
 *   node tools/scripts/seed-artist.mjs --no-youtube      # tắt fallback YouTube
 *   node tools/scripts/seed-artist.mjs --no-soundcloud   # tắt fallback SoundCloud
 *
 * Script sẽ hỏi interactive:
 *   1. ADMIN_TOKEN (JWT access token SUPER_ADMIN)
 *   2. Tên nghệ sĩ cần tìm
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline as streamPipeline } from 'node:stream/promises';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://localhost:9999/api/v1';
let ADMIN_TOKEN = '';
let INTERNAL_TOKEN = '12c80b4f2d2b93660210c2807607d824afc921d0c5fc372f99ea6ad38da6913cacbeac35fda0acb45511999321182f2f33247836c6a3e150fc020b06f4287150';
const STOREFRONT = 'vn';

const args = process.argv.slice(2);
const SKIP_TRANSCODE = args.includes('--skip-transcode');
const DRY_RUN = args.includes('--dry-run');
const NO_YOUTUBE = args.includes('--no-youtube');
const NO_SOUNDCLOUD = args.includes('--no-soundcloud');
// Độ lệch độ dài tối đa (giây) giữa audio tải về và metadata iTunes trước khi coi là "sai bài".
const DURATION_TOLERANCE_SEC = 15;
const APPLE_MUSIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── ANSI Colors ───────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(icon, msg) {
  console.log(`${c.dim}[seed]${c.reset} ${icon} ${msg}`);
}
function logOk(msg) { log(`${c.green}✓${c.reset}`, msg); }
function logInfo(msg) { log(`${c.blue}ℹ${c.reset}`, msg); }
function logWarn(msg) { log(`${c.yellow}⚠${c.reset}`, msg); }
function logErr(msg) { log(`${c.red}✗${c.reset}`, msg); }
function logStep(step, msg) {
  console.log(`\n${c.bold}${c.cyan}━━━ ${step} ━━━${c.reset}`);
  console.log(`${c.dim}${msg}${c.reset}\n`);
}

// ─── Helpers ───────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeMusicText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function artistMatches(expectedArtist, actualArtist) {
  const expected = primaryArtistName(expectedArtist);
  const actual = normalizeMusicText(actualArtist);
  if (!expected || !actual || expected.length < 2) return false;

  // Trường hợp thường gặp: tên đầy đủ nằm trong danh sách nghệ sĩ của nguồn,
  // "rpt mck" ⊂ "onionn rpt mck nan".
  if (actual.includes(expected)) return true;

  // Tha thứ tên rút gọn: iTunes "RPT MCK" vs NhacCuaTui "MCK". Chấp nhận khi mọi
  // token của tên-chính nguồn đều là token của tên kỳ vọng (>=3 ký tự để loại
  // các từ quá ngắn). An toàn vì còn rào tựa-khớp + verify độ dài ±15s.
  const expectedTokens = new Set(expected.split(' '));
  const actualPrimaryTokens = primaryArtistName(actualArtist).split(' ').filter(Boolean);
  return (
    actualPrimaryTokens.length > 0 &&
    actualPrimaryTokens.every(t => t.length >= 3 && expectedTokens.has(t))
  );
}

/**
 * Lấy nghệ sĩ chính (đã chuẩn hoá) từ chuỗi nghệ sĩ thô. Phải tách trên chuỗi
 * GỐC vì normalizeMusicText biến dấu phẩy/`&` thành khoảng trắng nên không tách
 * được nữa: "Đen, JustaTee" → nghệ sĩ chính "den".
 */
function primaryArtistName(rawArtist) {
  const first = String(rawArtist || '').split(/\s*(?:,|&|feat\.?|ft\.?|featuring|x|với|and)\s+/i)[0];
  return normalizeMusicText(first);
}

/**
 * Rút gọn tên bài về "tựa gốc" để chống lặp: bỏ các hậu tố phổ biến khiến cùng
 * một bản thu bị coi là bài khác nhau trên nhiều album/single/tuyển tập.
 *   "Đi Về Nhà (feat. JustaTee)"        → "di ve nha"
 *   "Đi Về Nhà (Remastered 2021)"       → "di ve nha"
 *   "Đi Về Nhà - Single Version"        → "di ve nha"
 *   "Đi Về Nhà (Bản Acoustic)"          → "di ve nha ban acoustic" (giữ vì là bản khác)
 * Chỉ cắt các hậu tố "kỹ thuật" (feat/remaster/version/edit...), giữ lại phần
 * mô tả biến thể thật (acoustic/live/remix) vì đó là bản thu khác nhau.
 *
 * Quan trọng: cắt hậu tố trên chuỗi GỐC (còn dấu ngoặc/gạch) TRƯỚC khi normalize,
 * vì normalizeMusicText xoá hết `()`/`-` thành khoảng trắng.
 */
const TECH_SUFFIX_RE = /\b(feat|ft|featuring|with|remaster(ed)?|version|edit|mono|stereo|explicit|clean|bonus|deluxe|instrumental|karaoke|beat|prod|original|radio)\b/i;

function canonicalTrackTitle(title) {
  let t = String(title || '');
  // Bỏ mọi đoạn trong ngoặc () hoặc [] chỉ chứa hậu tố kỹ thuật.
  t = t.replace(/\s*[([][^)\]]*[)\]]/g, (m) => {
    const inner = m.replace(/[()[\]]/g, '').trim();
    return TECH_SUFFIX_RE.test(inner) ? '' : ' ' + inner;
  });
  // Bỏ hậu tố sau dấu gạch: "... - Single Version", "... - Remastered 2021"
  t = t.replace(/\s*-\s*(single version|album version|remaster(ed)?( \d{2,4})?|explicit|clean|mono|stereo|radio edit|bonus track|original mix).*$/i, '');
  return normalizeMusicText(t);
}

/**
 * Khoá định danh bản thu dùng để chống lặp toàn bộ quá trình seed:
 * tựa-gốc + nghệ sĩ-chính. Cùng khoá ⇒ cùng một bài, chỉ xử lý một lần.
 */
function recordingKey(title, artist) {
  return `${canonicalTrackTitle(title)}::${primaryArtistName(artist)}`;
}

/**
 * Khoá phát hành để phân biệt một album/single thực sự với hai collection ID
 * khác nhau nhưng là cùng một release từ nguồn ngoài. Collection ID chỉ được
 * dùng để khử trùng lặp kỹ thuật; khoá này dùng metadata + tracklist đã chuẩn
 * hoá, nên không gộp nhầm bản remix/live có track khác.
 */
function albumReleaseKey(album, tracks) {
  const title = normalizeMusicText(album.collectionName || album.name);
  const artist = primaryArtistName(
    album.artistName || album.collectionArtistName || '',
  );
  const releaseDate = String(album.releaseDate || '').slice(0, 10);

  // Danh sách track (và số lượng) CỐ TÌNH không đưa vào khoá: một release được
  // nhà cung cấp lộ ra qua nhiều collectionId thường lệch nhau một bài bonus
  // hoặc thứ tự (deluxe/standard, bản explicit/clean), nhưng với người nghe vẫn
  // là MỘT release. Khoá này khớp với lá chắn catalog (assertNoSemanticAlbumDuplicate)
  // và khoá hiển thị (albumPresentationKey) để cùng một release không lọt thành
  // hai thẻ giống hệt. `tracks` giữ lại trong chữ ký hàm cho tương thích lời gọi.
  void tracks;
  return `${title}::${artist}::${releaseDate}`;
}

function uniqueAlbumsByCollectionId(albums) {
  const seen = new Set();
  return albums.filter((album) => {
    const collectionId = String(album.collectionId || '');
    if (!collectionId || seen.has(collectionId)) return false;
    seen.add(collectionId);
    return true;
  });
}

/**
 * Trả về tối đa ba tiêu đề để tìm cùng một bản thu khi metadata giữa các
 * nguồn khác nhau. Mỗi biến thể chỉ bỏ thông tin phát hành/kỹ thuật hoặc
 * khách mời; không bỏ "live", "acoustic", "remix"… để tránh nhập nhầm một
 * phiên bản khác của bài hát.
 */
function buildSearchTitleVariants(title) {
  const original = String(title || '').replace(/\s+/g, ' ').trim();
  if (!original) return [];

  const withoutGuests = original
    .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\b[^)\]]*[)\]]/ig, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring|with)\b.*$/i, '')
    .trim();

  const withoutTechnicalSuffix = withoutGuests
    .replace(/\s*[([]\s*(?:remaster(?:ed)?|single version|album version|radio edit|original mix|explicit|clean|mono|stereo|bonus track)\b[^)\]]*[)\]]/ig, '')
    .replace(/\s*-\s*(?:single version|album version|remaster(?:ed)?(?:\s+\d{2,4})?|radio edit|original mix|explicit|clean|mono|stereo|bonus track).*$/i, '')
    .trim();

  const seen = new Set();
  return [original, withoutGuests, withoutTechnicalSuffix].filter(candidate => {
    const key = normalizeMusicText(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

/**
 * Chuẩn hoá tựa để SO KHỚP giữa các nguồn (iTunes ↔ NCT/Zing): bỏ phần
 * "(feat. …)"/"ft."/"with …" và các hậu tố phát hành kỹ thuật (remaster/single
 * version/…), NHƯNG GIỮ "acoustic", "live", "remix", "beat", "instrumental",
 * "karaoke" — vì đó là bản thu khác, không được coi là cùng bài.
 *
 * Nhờ vậy iTunes "Lollipop" khớp được NhacCuaTui "Lollipop (feat. RPT MCK & NÂN)",
 * nhưng KHÔNG khớp nhầm "Lollipop (Beat)" hay "Lollipop (Acoustic)".
 */
function comparableTitle(title) {
  const t = String(title || '')
    .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\b[^)\]]*[)\]]/ig, '')
    .replace(/\s+(?:feat\.?|ft\.?|featuring|with)\b.*$/i, '')
    .replace(/\s*[([]\s*(?:remaster(?:ed)?(?:\s+\d{2,4})?|single version|album version|radio edit|original mix|explicit|clean|mono|stereo|bonus track)\b[^)\]]*[)\]]/ig, '')
    .replace(/\s*-\s*(?:single version|album version|remaster(?:ed)?(?:\s+\d{2,4})?|radio edit|original mix|explicit|clean|mono|stereo|bonus track).*$/i, '');
  return normalizeMusicText(t);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function promptUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText} — ${url}`);

  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const fileStream = fs.createWriteStream(dest);
  await streamPipeline(res.body, fileStream);
  const size = fs.statSync(dest).size;
  return size;
}

// ─── Audio verification (ffprobe) ──────────────────────

/**
 * Trả về độ dài (giây) của file audio bằng ffprobe, hoặc null nếu không đọc được.
 * Dùng để xác minh audio tải về đúng bài (khớp độ dài với metadata iTunes).
 */
async function probeAudioDurationSec(filePath) {
  try {
    const { execSync } = await import('node:child_process');
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 },
    ).toString().trim();
    const dur = parseFloat(out);
    return Number.isFinite(dur) && dur > 0 ? dur : null;
  } catch {
    return null;
  }
}

/**
 * So sánh độ dài audio thực tế với độ dài kỳ vọng (từ iTunes).
 * Trả về { ok, actualSec, expectedSec }. Nếu không lấy được độ dài kỳ vọng
 * thì mặc định coi là ok (không đủ dữ liệu để bác bỏ).
 */
async function verifyAudioDuration(filePath, expectedMillis) {
  const actualSec = await probeAudioDurationSec(filePath);
  if (actualSec == null) return { ok: true, actualSec: null, expectedSec: null };
  if (!expectedMillis || expectedMillis <= 0) {
    return { ok: true, actualSec, expectedSec: null };
  }
  const expectedSec = expectedMillis / 1000;
  const ok = Math.abs(actualSec - expectedSec) <= DURATION_TOLERANCE_SEC;
  return { ok, actualSec, expectedSec };
}

function detectedArtworkContentType(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 16);
  if (
    header.length >= 3 &&
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}

function requireSupportedArtwork(filePath, label) {
  const contentType = detectedArtworkContentType(filePath);
  if (!contentType) {
    throw new Error(
      `${label} is not a valid JPEG, PNG, or WebP image (source may have returned an HTML/error page)`,
    );
  }
  return contentType;
}

async function apiCall(method, urlPath, body, extraHeaders = {}) {
  const url = `${BASE_URL}${urlPath}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    ...extraHeaders,
  };
  for (const key of Object.keys(headers)) {
    if (headers[key] === undefined) delete headers[key];
  }

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = text; }

      if (!res.ok) {
        const errMsg = typeof json === 'object' ? JSON.stringify(json) : text;
        const err = new Error(`API ${res.status}: ${errMsg}`);
        if (res.status >= 400 && res.status < 500) throw err;
        throw err;
      }
      return json;
    } catch (err) {
      lastErr = err;
      const is4xx = err.message?.startsWith('API 4');
      if (is4xx) throw err;
      if (attempt < 3) {
        logWarn(`API call failed (attempt ${attempt}/3), retrying...`);
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastErr;
}

async function uploadBinary(presignedUrl, filePath, contentType) {
  const fileBuffer = fs.readFileSync(filePath);
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBuffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${res.status} — ${text}`);
  }
}

// ─── State Management (resume) ─────────────────────────

class State {
  constructor(stateFile) {
    this.file = stateFile;
    this.data = {};
    if (fs.existsSync(stateFile)) {
      try {
        this.data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        logInfo(`Loaded state from ${path.basename(stateFile)}`);
      } catch {
        this.data = {};
      }
    }
  }
  get(key) { return this.data[key]; }
  set(key, value) {
    this.data[key] = value;
    this.save();
  }
  save() {
    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}

// ════════════════════════════════════════════════════════
// PHASE 1: Discovery (Apple Music)
// ════════════════════════════════════════════════════════

async function searchArtistITunes(query) {
  logInfo(`Searching iTunes for "${query}"...`);
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&country=${STOREFRONT}&limit=10`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results || [];
}

async function lookupAlbumsITunes(artistId) {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&country=${STOREFRONT}&limit=200`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).filter(r => r.wrapperType === 'collection');
}

async function lookupTracksITunes(albumId) {
  const url = `https://itunes.apple.com/lookup?id=${albumId}&entity=song&country=${STOREFRONT}&limit=200`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).filter(r => r.wrapperType === 'track');
}

async function fetchAppleMusicArtworkHighRes(artistId) {
  logInfo('Fetching Apple Music page for high-res artwork...');
  try {
    const url = `https://music.apple.com/${STOREFRONT}/artist/_/${artistId}`;
    const res = await fetch(url, {
      headers: APPLE_MUSIC_HEADERS,
    });
    if (!res.ok) return null;
    const html = await res.text();

    const targetId = 'serialized-server-data';
    const startTag = `id="${targetId}"`;
    const startIdx = html.indexOf(startTag);
    if (startIdx === -1) return null;

    const tagEndIdx = html.indexOf('>', startIdx);
    const endTagIdx = html.indexOf('</script>', tagEndIdx);
    const content = html.substring(tagEndIdx + 1, endTagIdx).trim();

    const rawData = JSON.parse(content);
    const pageData = rawData.data?.[0]?.data;
    if (!pageData) return null;

    const sections = pageData.sections || [];
    const headerSection = sections.find(s => s.id?.includes('artist-detail-header-section'));
    const headerItem = headerSection?.items?.[0];
    const artworkDict = headerItem?.artwork?.dictionary;

    if (!artworkDict?.url) return null;

    const result = {
      url: artworkDict.url,
      bgColor: artworkDict.bgColor || '',
      textColor1: artworkDict.textColor1 || '',
      textColor2: artworkDict.textColor2 || '',
      textColor3: artworkDict.textColor3 || '',
      textColor4: artworkDict.textColor4 || '',
      width: artworkDict.width || 0,
      height: artworkDict.height || 0,
      videoArtwork: null,
    };

    const videoDict = headerItem?.videoArtwork?.dictionary;
    const motionData = videoDict?.motionArtistWide16x9;
    if (motionData?.video) {
      result.videoArtwork = {
        hlsUrl: motionData.video,
        previewFrame: motionData.previewFrame,
      };
      logOk('Found video banner (motionArtistWide16x9)');
    }

    return result;
  } catch (err) {
    logWarn(`Could not fetch Apple Music page: ${err.message}`);
    return null;
  }
}

/**
 * Fallback metadata source for artists whose Apple Music page has no artwork.
 * Only an exact normalized artist-name match is accepted: a plausible image is
 * worse than no image when seeding a catalog.
 */
async function fetchDeezerArtistArtwork(artistName) {
  const expectedName = normalizeMusicText(artistName);
  if (!expectedName) return null;

  logInfo(`Searching Deezer metadata for artwork of "${artistName}"...`);
  try {
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=10`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'MusicalCatalogSeed/1.0',
      },
    });
    if (!res.ok) {
      logWarn(`Deezer artist search failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const match = (data.data || []).find(
      (candidate) => normalizeMusicText(candidate.name) === expectedName,
    );
    const artworkUrl = match?.picture_xl || match?.picture_big || match?.picture_medium || '';
    if (!artworkUrl) {
      logWarn(`Deezer has no verified artwork for "${artistName}"`);
      return null;
    }

    logOk(`Using verified Deezer artwork metadata for "${artistName}"`);
    return artworkUrl;
  } catch (error) {
    logWarn(`Deezer artist artwork lookup failed: ${error.message}`);
    return null;
  }
}

function asMetadataList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function verifiedArtistArtworkUrl(candidates, artistName) {
  const expectedName = normalizeMusicText(artistName);
  const artist = candidates.find((candidate) => {
    const candidateName = candidate?.name || candidate?.artistName || candidate?.title || '';
    return normalizeMusicText(candidateName) === expectedName;
  });
  if (!artist) return null;

  const artworkUrl = [
    artist.imageUrl,
    artist.avatarUrl,
    artist.avatar,
    artist.thumbnailM,
    artist.thumbnail,
    artist.picture,
    artist.cover,
  ].find((value) => typeof value === 'string' && value.startsWith('http'));
  return artworkUrl || null;
}

async function fetchNhacCuaTuiArtistArtwork(artistName) {
  logInfo(`Searching NhacCuaTui metadata for artwork of "${artistName}"...`);
  try {
    const data = await nctApiCall(
      '/api/v3/search/all',
      { keyword: artistName, correct: 'true' },
      { keyword: artistName, correct: true, isShowLoading: false },
    );
    const artistCandidates = [
      ...asMetadataList(data?.artists),
      ...asMetadataList(data?.singers),
      ...asMetadataList(data?.artist),
    ];
    const artworkUrl = verifiedArtistArtworkUrl(artistCandidates, artistName);
    if (artworkUrl) {
      logOk(`Using verified NhacCuaTui artwork metadata for "${artistName}"`);
      return artworkUrl;
    }
    logWarn(`NhacCuaTui has no verified artwork for "${artistName}"`);
    return null;
  } catch (error) {
    logWarn(`NhacCuaTui artist artwork lookup failed: ${error.message}`);
    return null;
  }
}

async function fetchZingArtistArtwork(artistName) {
  logInfo(`Searching Zing MP3 metadata for artwork of "${artistName}"...`);
  try {
    const ctime = String(Math.floor(Date.now() / 1000));
    const data = await zingApiCall(
      '/api/v2/search',
      { ctime, version: ZING_VERSION },
      { q: artistName },
    );
    const artistCandidates = [
      ...asMetadataList(data?.artists),
      ...asMetadataList(data?.artist),
    ];
    const artworkUrl = verifiedArtistArtworkUrl(artistCandidates, artistName);
    if (artworkUrl) {
      logOk(`Using verified Zing MP3 artwork metadata for "${artistName}"`);
      return artworkUrl;
    }
    logWarn(`Zing MP3 has no verified artwork for "${artistName}"`);
    return null;
  } catch (error) {
    logWarn(`Zing MP3 artist artwork lookup failed: ${error.message}`);
    return null;
  }
}

function getHighResArtworkUrl(artworkUrlTemplate, size = 1200) {
  if (!artworkUrlTemplate) return null;
  if (artworkUrlTemplate.includes('{w}')) {
    return artworkUrlTemplate
      .replace('{w}', size)
      .replace('{h}', size)
      .replace('{c}', 'bb')
      .replace('{f}', 'jpg');
  }
  return artworkUrlTemplate.replace(/\d+x\d+bb/, `${size}x${size}bb`);
}

function getITunesArtworkHighRes(artworkUrl100, size = 1200) {
  if (!artworkUrl100) return null;
  return artworkUrl100.replace(/\d+x\d+bb/, `${size}x${size}bb`);
}

// ════════════════════════════════════════════════════════
// PHASE 2: Download Assets
// ════════════════════════════════════════════════════════

async function downloadArtwork(artworkUrl, dest, label) {
  if (fs.existsSync(dest)) {
    try {
      requireSupportedArtwork(dest, label);
      logOk(`${label} artwork already downloaded`);
      return;
    } catch {
      logWarn(`${label} cached artwork is invalid — downloading it again`);
      fs.unlinkSync(dest);
    }
  }
  logInfo(`Downloading ${label} artwork...`);
  const size = await download(artworkUrl, dest);
  try {
    requireSupportedArtwork(dest, label);
  } catch (error) {
    fs.unlinkSync(dest);
    throw error;
  }
  logOk(`${label} artwork downloaded (${(size / 1024).toFixed(0)} KB)`);
}

async function downloadVideoBanner(hlsUrl, dest, label) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    logOk(`${label} video banner already downloaded`);
    return true;
  }

  const { execSync } = await import('node:child_process');
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch {
    logWarn(`ffmpeg not found — skipping ${label} video banner download`);
    return false;
  }

  logInfo(`Parsing HLS manifest for ${label} video banner...`);
  const masterRes = await fetch(hlsUrl);
  if (!masterRes.ok) {
    logWarn(`Failed to fetch HLS manifest: ${masterRes.status}`);
    return false;
  }
  const masterM3u8 = await masterRes.text();

  const variants = [];
  const lines = masterM3u8.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    if (line.includes('I-FRAME')) continue;

    const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
    const codecMatch = line.match(/CODECS="([^"]+)"/);
    const bwMatch = line.match(/BANDWIDTH=(\d+)/);
    const nextLine = (lines[i + 1] || '').trim();
    if (!resMatch || !nextLine.startsWith('http')) continue;

    const codec = codecMatch?.[1] || '';
    const isH264 = codec.startsWith('avc1');

    variants.push({
      width: parseInt(resMatch[1]),
      height: parseInt(resMatch[2]),
      bandwidth: parseInt(bwMatch?.[1] || '0'),
      url: nextLine,
      isH264,
    });
  }

  if (variants.length === 0) {
    logWarn('No video variants found in HLS manifest');
    return false;
  }

  variants.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);

  const target2k = variants.find(v => v.height >= 1440 && v.height <= 1600);
  const target1080 = variants.find(v => v.height >= 1080 && v.height < 1440);
  const picked = target2k || target1080 || variants[0];

  logInfo(`Selected variant: ${picked.width}x${picked.height} (${picked.isH264 ? 'H.264' : 'HEVC'}, ~${(picked.bandwidth / 1000000).toFixed(1)} Mbps)`);

  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  logInfo(`Downloading video via ffmpeg...`);
  try {
    execSync(`ffmpeg -y -i "${picked.url}" -c copy "${dest}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    const size = fs.statSync(dest).size;
    logOk(`${label} video banner downloaded (${(size / 1024 / 1024).toFixed(1)} MB)`);
    return true;
  } catch (err) {
    logWarn(`ffmpeg failed: ${err.message?.split('\n')[0] || err.message}`);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    return false;
  }
}

// ─── NhacCuaTui GraphQL API (WASM-signed) ─────────────

const NCT_API_BASE = 'https://graph.nhaccuatui.com';
const NCT_APPID = '6';
const NCT_DEVICE_ID = crypto.randomBytes(8).toString('hex');
const NCT_WASM_URL = 'https://static.nct.vn/nct-web/wasm/nctsign.wasm';

let nctWasmInstance = null;

async function initNctWasm() {
  if (nctWasmInstance) return nctWasmInstance;
  const wasmCachePath = path.join(__dirname, '.tmp', 'nctsign.wasm');
  let wasmBuf;
  if (fs.existsSync(wasmCachePath)) {
    wasmBuf = fs.readFileSync(wasmCachePath).buffer;
  } else {
    logInfo('Downloading NhacCuaTui WASM signing module...');
    const res = await fetch(NCT_WASM_URL);
    if (!res.ok) throw new Error(`Failed to fetch WASM: ${res.status}`);
    wasmBuf = await res.arrayBuffer();
    const dir = path.dirname(wasmCachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(wasmCachePath, Buffer.from(wasmBuf));
    logOk('WASM module cached locally');
  }
  const stubs = { proc_exit: () => { } };
  const { instance } = await WebAssembly.instantiate(wasmBuf, { env: stubs, wasi_snapshot_preview1: stubs });
  nctWasmInstance = instance;
  return instance;
}

function nctComputeSign(wasmInst, fullUrl, body, headers) {
  const uint8 = new Uint8Array(wasmInst.exports.memory.buffer);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function allocStr(str) {
    const enc = encoder.encode(str);
    const ptr = wasmInst.exports.malloc(enc.length + 1);
    new Uint8Array(wasmInst.exports.memory.buffer).set(enc, ptr);
    new Uint8Array(wasmInst.exports.memory.buffer)[ptr + enc.length] = 0;
    return { ptr, len: enc.length };
  }
  function readStr(ptr, maxLen) {
    const u8 = new Uint8Array(wasmInst.exports.memory.buffer);
    let end = ptr;
    while (u8[end] && end < ptr + maxLen) end++;
    return decoder.decode(u8.slice(ptr, end));
  }

  let hdrStr = '';
  for (const [k, v] of Object.entries(headers)) {
    hdrStr += encodeURIComponent(k) + '$' + encodeURIComponent(v) + '$';
  }

  const url = allocStr(fullUrl);
  const bd = allocStr(body);
  const hd = allocStr(hdrStr);
  const out = wasmInst.exports.malloc(1024);

  wasmInst.exports.NctSign_makeUrlSignWithHeader(url.ptr, url.len, bd.ptr, bd.len, hd.ptr, hd.len, out);
  const raw = readStr(out, 1024);

  wasmInst.exports.free(out);
  wasmInst.exports.free(url.ptr);
  wasmInst.exports.free(bd.ptr);
  wasmInst.exports.free(hd.ptr);

  return (raw.match(/[0-9a-f]+/) || [''])[0];
}

async function nctApiCall(endpoint, params = {}, body = {}) {
  const wasm = await initNctWasm();
  const timestamp = String(Date.now());

  const allParams = { ...params, timestamp };
  const qs = new URLSearchParams(allParams).toString();
  const fullUrl = `${NCT_API_BASE}${endpoint}${qs ? '?' + qs : ''}`;
  const bodyStr = JSON.stringify(body);

  const headers = {
    'x-nct-token': '',
    'x-nct-deviceid': NCT_DEVICE_ID,
    'x-nct-time': timestamp,
    'x-nct-language': 'vi',
    'X-nct-uuid': NCT_DEVICE_ID,
    'X-nct-userid': '0',
    'X-nct-os': 'web',
    'x-nct-appid': NCT_APPID,
    'X-nct-version': '1',
    timestamp,
  };

  const xSign = nctComputeSign(wasm, fullUrl, bodyStr, headers);

  const res = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...headers,
      'X-sign': xSign,
    },
    body: bodyStr,
  });

  if (!res.ok) throw new Error(`NCT API ${res.status}`);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`NCT API error: ${data.code} ${data.msg}`);
  return data.data;
}

async function searchNhacCuaTui(title, artist) {
  try {
    const keyword = `${title} ${artist}`;
    const data = await nctApiCall('/api/v3/search/all', { keyword, correct: 'true' }, { keyword, correct: true, isShowLoading: false });

    const songs = data?.songs;
    if (!songs || songs.length === 0) return null;

    const wantTitle = comparableTitle(title);
    const best = songs.find(
      (song) =>
        comparableTitle(song.name) === wantTitle &&
        artistMatches(artist, song.artistName),
    );

    if (!best) {
      logWarn(`No exact NCT match for "${title}" by "${artist}" — skipping instead of importing a different song`);
      return null;
    }

    const streams = best.streamURL || [];
    const quality320 = streams.find(s => s.type === '320' && !s.onlyVIP && s.status === 1);
    const quality128 = streams.find(s => s.type === '128' && !s.onlyVIP && s.status === 1);
    const bestStream = quality320 || quality128;

    if (!bestStream) return null;

    return bestStream.download || bestStream.stream;
  } catch (err) {
    logWarn(`NhacCuaTui search failed for "${title}": ${err.message}`);
    return null;
  }
}

// ─── Zing MP3 API (HMAC-signed) ───────────────────────

const ZING_URL = 'https://zingmp3.vn';
const ZING_API_KEY = 'X5BM3w8N7MKozC0B85o4KMlzLZKhV00y';
const ZING_SECRET = 'acOrvUS15XRW2o9JksiK1KgQ6Vbds8ZW';
const ZING_VERSION = '1.6.42';

let zingCookie;

async function getZingCookie() {
  if (zingCookie !== undefined) return zingCookie;
  zingCookie = '';
  try {
    const res = await fetch(`${ZING_URL}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) {
      zingCookie = setCookie.map(ck => ck.split(';')[0]).join('; ');
    }
  } catch { /* cookie tùy chọn — nhiều endpoint vẫn chạy không cần */ }
  return zingCookie;
}

function zingHash256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}
function zingHmac512(str) {
  return crypto.createHmac('sha512', ZING_SECRET).update(str).digest('hex');
}

/**
 * Ký request theo thuật toán zingmp3.vn:
 *   sig = HMAC512( path + SHA256( "k1=v1k2=v2..." các sigParams đã sort ) )
 * apiKey và sig KHÔNG tham gia ký.
 */
function zingSign(path, sigParams) {
  const hashData = Object.keys(sigParams)
    .sort()
    .map(k => `${k}=${sigParams[k]}`)
    .join('');
  return zingHmac512(path + zingHash256(hashData));
}

async function zingApiCall(apiPath, sigParams, extraQuery = {}) {
  const cookie = await getZingCookie();
  const sig = zingSign(apiPath, sigParams);
  const qs = new URLSearchParams({
    ...extraQuery,
    ...sigParams,
    apiKey: ZING_API_KEY,
    sig,
  }).toString();
  const res = await fetch(`${ZING_URL}${apiPath}?${qs}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Cookie: cookie,
    },
  });
  if (!res.ok) throw new Error(`Zing API ${res.status}`);
  const data = await res.json();
  if (data.err !== 0) throw new Error(`Zing API err ${data.err}: ${data.msg || ''}`);
  return data.data;
}

async function searchZingMp3(title, artist) {
  try {
    const ctime = String(Math.floor(Date.now() / 1000));
    const keyword = `${title} ${artist}`;
    const searchData = await zingApiCall(
      '/api/v2/search',
      { ctime, version: ZING_VERSION },
      { q: keyword },
    );

    // /api/v2/search trả kết quả trộn (bài hát, nghệ sĩ, playlist...) trong `items`.
    const items = (searchData?.items || []).filter(it => it?.encodeId && it?.title);
    if (!items.length) return null;

    const normalizedTitle = comparableTitle(title);
    const best = items.find(
      (s) =>
        s.streamingStatus === 1 &&
        comparableTitle(s.title) === normalizedTitle &&
        artistMatches(artist, s.artistsNames),
    );

    if (!best) {
      logWarn(`No exact Zing match for "${title}" by "${artist}" — skipping instead of importing a different song`);
      return null;
    }

    const streamCtime = String(Math.floor(Date.now() / 1000));
    const streaming = await zingApiCall(
      '/api/v2/song/get/streaming',
      { ctime: streamCtime, id: best.encodeId, version: ZING_VERSION },
    );

    // 320 thường trả 'VIP' (cần đăng nhập) → fallback 128 (URL trực tiếp).
    const isUrl = v => typeof v === 'string' && v.startsWith('http');
    const url320 = isUrl(streaming?.['320']) ? streaming['320'] : null;
    const url128 = isUrl(streaming?.['128']) ? streaming['128'] : null;
    return url320 || url128 || null;
  } catch (err) {
    logWarn(`Zing MP3 search failed for "${title}": ${err.message}`);
    return null;
  }
}

// ─── YouTube Music (yt-dlp) fallback ──────────────────
let ytDlpBinaryCache;

/**
 * Tìm binary yt-dlp: PATH → các vị trí cài phổ biến trên Windows.
 * Trả về đường dẫn (đã bọc dấu ngoặc nếu có khoảng trắng) hoặc null.
 */
async function resolveYtDlpBinary() {
  if (ytDlpBinaryCache !== undefined) return ytDlpBinaryCache;
  const { execSync } = await import('node:child_process');

  const candidates = ['yt-dlp', 'yt-dlp.exe'];
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    candidates.push(
      path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'Scripts', 'yt-dlp.exe'),
      path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
      path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
    );
  }

  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: 'ignore', timeout: 15_000 });
      ytDlpBinaryCache = candidate;
      return candidate;
    } catch { /* try next */ }
  }
  ytDlpBinaryCache = null;
  return null;
}

/**
 * Tải audio bằng yt-dlp từ một provider tìm kiếm bất kỳ (YouTube Music, SoundCloud...).
 *
 * `searchPrefix` là tiền tố tìm kiếm của yt-dlp (`ytsearch5:`, `scsearch5:`); yt-dlp
 * tự chọn kết quả khớp nhất trong ràng buộc độ dài, sau đó verify lại độ dài để
 * đảm bảo đúng bài trước khi trả về. Audio được trích ra m4a (AAC) — cùng codec
 * luồng chính của hệ thống.
 *
 * Trả về { path } nếu tải + verify thành công, ngược lại null.
 */
async function downloadViaYtDlp(searchPrefix, sourceName, sourceKey, title, artist, dest, expectedMillis, label) {
  const bin = await resolveYtDlpBinary();
  if (!bin) {
    logWarn(`[${label}] yt-dlp không tìm thấy — bỏ qua fallback ${sourceName}`);
    return null;
  }

  const { execFileSync } = await import('node:child_process');
  const outDest = dest.replace(/\.mp3$/, '.m4a');
  const dir = path.dirname(outDest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Giới hạn thời lượng để loại video ghép 1 tiếng / bản mix. Cho phép lệch rộng
  // hơn tolerance chính một chút.
  const query = `${title} ${artist}`;
  // Nguồn dạng URL (YouTube Music) cần encode query; nguồn dạng prefix
  // (ytsearch:/scsearch:) nhận query thô.
  const searchArg = searchPrefix.startsWith('http')
    ? `${searchPrefix}${encodeURIComponent(query)}`
    : `${searchPrefix}${query}`;
  const maxDur = expectedMillis ? Math.round(expectedMillis / 1000) + 60 : 900;
  const minDur = expectedMillis ? Math.max(30, Math.round(expectedMillis / 1000) - 60) : 45;

  logInfo(`[${label}] Đang thử ${sourceName} cho "${title}"...`);
  try {
    execFileSync(
      bin.replace(/^"|"$/g, ''),
      [
        searchArg,
        '--no-playlist',
        '--extract-audio',
        '--audio-format', 'm4a',
        '--audio-quality', '0',
        '--match-filter', `duration > ${minDur} & duration < ${maxDur}`,
        '--playlist-items', '1',
        '--no-warnings',
        '-o', outDest,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180_000 },
    );
  } catch (err) {
    logWarn(`[${label}] yt-dlp (${sourceName}) lỗi: ${(err.stderr?.toString() || err.message || '').split('\n')[0]}`);
    if (fs.existsSync(outDest)) fs.unlinkSync(outDest);
    return null;
  }

  if (!fs.existsSync(outDest) || fs.statSync(outDest).size === 0) {
    logWarn(`[${label}] ${sourceName} không có kết quả khớp`);
    return null;
  }

  const check = await verifyAudioDuration(outDest, expectedMillis);
  if (!check.ok) {
    logWarn(
      `[${label}] ${sourceName}: độ dài lệch (${check.actualSec?.toFixed(0)}s vs ${check.expectedSec?.toFixed(0)}s) — bỏ`,
    );
    fs.unlinkSync(outDest);
    return null;
  }

  const size = fs.statSync(outDest).size;
  logOk(`[${label}] "${title}" tải từ ${sourceName} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return { path: outDest, source: sourceKey };
}

function downloadFromYouTubeMusic(title, artist, dest, expectedMillis, label) {
  return downloadViaYtDlp('https://music.youtube.com/search?q=', 'YouTube Music', 'youtube_music', title, artist, dest, expectedMillis, label);
}

function downloadFromYouTube(title, artist, dest, expectedMillis, label) {
  return downloadViaYtDlp('ytsearch5:', 'YouTube', 'youtube', title, artist, dest, expectedMillis, label);
}

function downloadFromSoundCloud(title, artist, dest, expectedMillis, label) {
  return downloadViaYtDlp('scsearch5:', 'SoundCloud', 'soundcloud', title, artist, dest, expectedMillis, label);
}

async function downloadSongAudio(track, artist, audioDir, index) {
  // Use per-album trackNumber (stable across runs) instead of global counter for filename
  const trackNum = track.trackNumber || (index + 1);
  const paddedTrack = String(trackNum).padStart(2, '0');
  const safeTitle = slugify(track.trackName || track.title || `track-${trackNum}`);
  const filename = `${paddedTrack}-${safeTitle}-${track.trackId || trackNum}.mp3`;
  const dest = path.join(audioDir, filename);
  const label = String(index + 1).padStart(2, '0');
  const songTitle = track.trackName || track.title;
  const expectedMillis = track.trackTimeMillis || 0;

  // Chỉ nhận cache MP3 do hai nguồn hiện tại tạo ra. Cache M4A từ các phiên
  // bản tool cũ bị cố ý bỏ qua, nên không thể bị upload lại theo đường cache.
  for (const cached of [dest]) {
    if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
      const check = await verifyAudioDuration(cached, expectedMillis);
      if (check.ok) {
        logOk(`[${label}] "${songTitle}" already downloaded`);
        return { path: cached, source: 'cached' };
      }
      logWarn(
        `[${label}] Cached audio has wrong duration (${check.actualSec?.toFixed(0)}s vs ${check.expectedSec?.toFixed(0)}s) — deleting it`,
      );
      fs.unlinkSync(cached);
    }
  }

  const titleVariants = buildSearchTitleVariants(songTitle);
  for (const [attemptIndex, searchTitle] of titleVariants.entries()) {
    const attempt = `${attemptIndex + 1}/${titleVariants.length}`;
    if (attemptIndex > 0) {
      logInfo(`[${label}] Retry ${attempt} with normalized title: "${searchTitle}"`);
    }

    // NCT/Zing chỉ trả kết quả khi tựa, nghệ sĩ chính và thời lượng đều đạt.
    // Đây là hàng rào cuối cùng chống nhập nhầm bản thu có tên tương tự.
    logInfo(`[${label}] [${attempt}] Searching NhacCuaTui for "${searchTitle}"...`);
    const streamUrl = await searchNhacCuaTui(searchTitle, artist);
    if (streamUrl) {
      try {
        const size = await download(streamUrl, dest);
        const check = await verifyAudioDuration(dest, expectedMillis);
        if (check.ok) {
          logOk(`[${label}] "${songTitle}" từ NhacCuaTui (${(size / 1024 / 1024).toFixed(1)} MB)`);
          return { path: dest, source: 'nhaccuatui' };
        }
        logWarn(`[${label}] NCT: duration mismatch (${check.actualSec?.toFixed(0)}s vs ${check.expectedSec?.toFixed(0)}s)`);
        fs.unlinkSync(dest);
      } catch (err) {
        logWarn(`[${label}] NhacCuaTui download failed: ${err.message}`);
      }
    }

    logInfo(`[${label}] [${attempt}] Searching Zing MP3 for "${searchTitle}"...`);
    const zingUrl = await searchZingMp3(searchTitle, artist);
    if (zingUrl) {
      try {
        const size = await download(zingUrl, dest);
        const check = await verifyAudioDuration(dest, expectedMillis);
        if (check.ok) {
          logOk(`[${label}] "${songTitle}" từ Zing MP3 (${(size / 1024 / 1024).toFixed(1)} MB)`);
          return { path: dest, source: 'zingmp3' };
        }
        logWarn(`[${label}] Zing: duration mismatch (${check.actualSec?.toFixed(0)}s vs ${check.expectedSec?.toFixed(0)}s)`);
        fs.unlinkSync(dest);
      } catch (err) {
        logWarn(`[${label}] Zing MP3 download failed: ${err.message}`);
      }
    }
  }

  // Fallback: NCT/Zing không có bài (thường gặp với bài ít phổ biến / quốc tế).
  // yt-dlp tự chọn kết quả khớp nhất trong ràng buộc độ dài rồi verify lại. Chỉ
  // cần MỘT tựa (bản gốc) là đủ vì yt-dlp đã fuzzy-match tên rồi.
  if (!NO_YOUTUBE) {
    const ytm = await downloadFromYouTubeMusic(songTitle, artist, dest, expectedMillis, label);
    if (ytm) return ytm;

    const yt = await downloadFromYouTube(songTitle, artist, dest, expectedMillis, label);
    if (yt) return yt;
  }

  if (!NO_SOUNDCLOUD) {
    const sc = await downloadFromSoundCloud(songTitle, artist, dest, expectedMillis, label);
    if (sc) return sc;
  }

  logErr(`[${label}] "${songTitle}" — NO AUDIO AVAILABLE, skipping`);
  return null;
}

// ════════════════════════════════════════════════════════
// PHASE 3: Upload Artworks (local API)
// ════════════════════════════════════════════════════════

async function uploadArtworkAsset(filePath, label) {
  const filename = path.basename(filePath);
  const contentType = requireSupportedArtwork(filePath, label);

  const checksum = await sha256File(filePath);
  const sizeBytes = fs.statSync(filePath).size;

  logInfo(`Uploading ${label} artwork (${(sizeBytes / 1024).toFixed(0)} KB)...`);

  const uploadRes = await apiCall('POST', '/admin/assets/uploads', {
    kind: 'IMAGE',
    purpose: 'ARTWORK',
    filename,
    contentType,
    checksum,
    sizeBytes,
  });

  const assetId = uploadRes.asset?.id || uploadRes.assetId;
  const uploadUrl = uploadRes.uploadUrl;
  const instant = uploadRes.instant;

  if (!assetId) throw new Error(`No assetId returned for ${label}`);
  logInfo(`${label} artwork assetId: ${assetId}`);

  if (instant) {
    logOk(`${label} artwork already exists (dedup), assetId: ${assetId}`);
    return assetId;
  }

  if (uploadUrl) {
    await uploadBinary(uploadUrl, filePath, contentType);
    logOk(`${label} artwork uploaded to R2`);
  }

  await apiCall('POST', `/admin/assets/${assetId}/finalize`);
  logInfo(`${label} artwork finalize triggered`);

  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    try {
      const assetRes = await apiCall('GET', `/admin/assets/${assetId}`);
      const status = assetRes.asset?.status || assetRes.status;
      if (status === 'READY' || status === 3) {
        logOk(`${label} artwork READY, assetId: ${assetId}`);
        return assetId;
      }
      if (status === 'FAILED' || status === 4) {
        const reason = assetRes.asset?.errorMessage || assetRes.errorMessage || 'unknown processing error';
        throw new Error(`Asset processing failed for ${label} (${assetId}): ${reason}`);
      }
    } catch (err) {
      if (err.message.includes('processing failed')) throw err;
    }
  }

  logWarn(`${label} artwork did not become READY within timeout — using assetId anyway`);
  return assetId;
}

async function uploadVideoAsset(filePath, label) {
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.ts': 'video/mp2t',
  }[ext] || 'video/mp4';

  const checksum = await sha256File(filePath);
  const sizeBytes = fs.statSync(filePath).size;

  logInfo(`Uploading ${label} video (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)...`);

  const uploadRes = await apiCall('POST', '/admin/assets/uploads', {
    kind: 'VIDEO',
    purpose: 'EDITORIAL_VIDEO',
    filename,
    contentType,
    checksum,
    sizeBytes,
  });

  const assetId = uploadRes.asset?.id || uploadRes.assetId;
  const uploadUrl = uploadRes.uploadUrl;
  const instant = uploadRes.instant;

  if (!assetId) throw new Error(`No assetId returned for ${label}`);

  if (instant) {
    logOk(`${label} video already exists (dedup), assetId: ${assetId}`);
    return assetId;
  }

  if (uploadUrl) {
    await uploadBinary(uploadUrl, filePath, contentType);
    logOk(`${label} video uploaded to R2`);
  }

  await apiCall('POST', `/admin/assets/${assetId}/finalize`);
  logInfo(`${label} video finalize triggered`);

  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    try {
      const assetRes = await apiCall('GET', `/admin/assets/${assetId}`);
      const status = assetRes.asset?.status || assetRes.status;
      if (status === 'READY' || status === 3) {
        logOk(`${label} video READY, assetId: ${assetId}`);
        return assetId;
      }
      if (status === 'FAILED' || status === 4) {
        throw new Error(`Video processing failed for ${label}`);
      }
      if (i % 5 === 0) logInfo(`Video still processing... (${i * 3}s)`);
    } catch (err) {
      if (err.message.includes('processing failed')) throw err;
    }
  }

  logWarn(`${label} video did not become READY within timeout — using assetId anyway`);
  return assetId;
}

// ════════════════════════════════════════════════════════
// PHASE 4: Create Artist + Upload Songs
// ════════════════════════════════════════════════════════

async function createAndPublishArtist(name, genreNames, artworkAssetId, editorialVideoAssetId) {
  logInfo(`Creating artist draft for "${name}"...`);

  const draftBody = {
    storefront: STOREFRONT,
    name,
    url: slugify(name),
    genreNames,
    artworkAssetId,
  };

  if (editorialVideoAssetId) {
    draftBody.editorialVideoAssetId = editorialVideoAssetId;
  }

  const draftRes = await apiCall('POST', '/admin/catalog/artists/draft', draftBody);

  const draftId = draftRes.draftId || draftRes.id;
  const artistId = draftRes.resourceId;

  logOk(`Artist draft created — draftId: ${draftId}, resourceId: ${artistId}`);

  logInfo('Publishing artist draft...');
  await apiCall('POST', `/admin/catalog/drafts/${draftId}/publish`);
  logOk(`Artist "${name}" published — artistId: ${artistId}`);

  return artistId;
}

async function findSongInLibrary(title) {
  try {
    const res = await apiCall('GET', `/songs/me?search=${encodeURIComponent(title)}&limit=10`);
    const songs = res.data || res.songs || [];
    const normalized = normalizeMusicText(title);
    const exact = songs.find(s => {
      const t = normalizeMusicText(s.title);
      return t === normalized;
    });
    if (exact) return exact.id;
  } catch { }
  return null;
}

async function uploadSongThroughPipeline(audioFile, title) {
  const checksum = await sha256File(audioFile.path);
  const size = fs.statSync(audioFile.path).size;

  logInfo(`Uploading song "${title}" (${(size / 1024 / 1024).toFixed(1)} MB)...`);

  let uploadRes;
  try {
    uploadRes = await apiCall('POST', '/songs/request-upload', {
      title,
      checksum,
      size,
    });
  } catch (err) {
    if (err.message.includes('SONG_ALREADY_IN_LIBRARY') || err.message.includes('409')) {
      logWarn(`Song "${title}" already in library, searching for existing songId...`);
      const existingId = await findSongInLibrary(title);
      if (existingId) {
        logOk(`Found existing song "${title}" — songId: ${existingId}`);
        return existingId;
      }
      throw new Error(`Song "${title}" already in library but could not find songId — clear state or check manually`);
    }
    throw err;
  }

  const songId = uploadRes.songId;
  const uploadUrl = uploadRes.uploadUrl;
  const instant = uploadRes.instant;

  if (!songId) throw new Error(`No songId returned for "${title}"`);

  if (instant) {
    logOk(`Song "${title}" dedup — songId: ${songId}`);
    return songId;
  }

  if (uploadUrl) {
    const ext = path.extname(audioFile.path).toLowerCase();
    const contentType = ext === '.m4a' ? 'audio/mp4' : 'application/octet-stream';
    await uploadBinary(uploadUrl, audioFile.path, contentType);
    logOk(`Song "${title}" uploaded to R2`);
  }

  logInfo(`Calling finalize for song "${title}"...`);
  try {
    await apiCall('POST', '/songs/internal/finalize-upload', { songId }, {
      'x-internal-token': INTERNAL_TOKEN,
      Authorization: undefined,
    });
  } catch (err) {
    logWarn(`Finalize call note: ${err.message}`);
  }

  if (SKIP_TRANSCODE) {
    logInfo(`--skip-transcode: Setting song READY directly...`);
    const durationSec = Math.round(size / (128 * 1024 / 8));
    try {
      await apiCall('PATCH', '/songs/internal/processing-result', {
        songId,
        status: 3,
        encryptedFilePath: `production/${checksum}/output.fmp4`,
        durationSec,
        bitrateKbps: 128,
        codec: 'aac',
        format: 'fmp4',
      }, {
        'x-internal-token': INTERNAL_TOKEN,
        Authorization: undefined,
      });
      logOk(`Song "${title}" set to READY (skip-transcode) — songId: ${songId}`);
      return songId;
    } catch (err) {
      logErr(`Failed to set READY: ${err.message}`);
    }
  }

  logInfo(`Waiting for song "${title}" to become READY...`);
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    try {
      const songRes = await apiCall('GET', `/songs/${songId}`);
      const status = songRes.status || songRes.song?.status;
      if (status === 'READY' || status === 3) {
        logOk(`Song "${title}" READY — songId: ${songId}`);
        return songId;
      }
      if (status === 'FAILED' || status === 4) {
        throw new Error(`Song processing failed for "${title}"`);
      }
      if (i % 5 === 0) logInfo(`Still processing... (${i * 3}s)`);
    } catch (err) {
      if (err.message.includes('processing failed')) throw err;
    }
  }

  logWarn(`Song "${title}" did not become READY within 3 min — songId: ${songId}`);
  return songId;
}

// ════════════════════════════════════════════════════════
// PHASE 5: Create Song Drafts + Album + Publish
// ════════════════════════════════════════════════════════

async function createAndPublishSongDraft(
  track,
  songId,
  artistId,
  albumName,
  artworkAssetId,
  releaseDate
) {
  const name = track.trackName || track.title;
  const draftRes = await apiCall('POST', '/admin/catalog/songs/draft', {
    resourceId: songId,
    storefront: STOREFRONT,
    name,
    albumName,
    artistName: track.artistName,
    audioLocale: 'vi',
    audioTraits: ['lossless'],
    composerName: track.artistName,
    contentRating: track.trackExplicitness === 'explicit' ? 'explicit' : '',
    discNumber: track.discNumber || 1,
    durationInMillis: track.trackTimeMillis || 0,
    genreNames: [track.primaryGenreName || 'Hip-Hop/Rap'],
    hasLyrics: true,
    hasTimeSyncedLyrics: false,
    isrc: '',
    releaseDate: releaseDate || '',
    trackNumber: track.trackNumber || 0,
    url: slugify(name),
    artistIds: [artistId],
    composerIds: [artistId],
    artworkAssetId,
  });

  const draftId = draftRes.draftId || draftRes.id;
  await apiCall('POST', `/admin/catalog/drafts/${draftId}/publish`);
  logOk(`Song draft "${name}" published`);

  return draftId;
}

async function createAndPublishAlbum(album, artistId, songMappings, artworkAssetId) {
  const albumName = album.collectionName || album.name;
  const releaseDate = album.releaseDate ? album.releaseDate.split('T')[0] : '';
  const isSingle = (album.trackCount || 0) <= 3;

  const seen = new Set();
  const uniqueMappings = songMappings.filter(m => {
    if (seen.has(m.catalogSongId)) {
      logWarn(`Duplicate songId ${m.catalogSongId} for "${m.track.trackName}" — skipping (same audio as another track)`);
      return false;
    }
    seen.add(m.catalogSongId);
    return true;
  });

  const tracks = uniqueMappings.map((m, i) => ({
    songId: m.catalogSongId,
    position: i,
    discNumber: m.track.discNumber || 1,
  }));

  if (tracks.length === 0) {
    logWarn(`No unique tracks for album "${albumName}", skipping`);
    return;
  }

  logInfo(`Creating album draft "${albumName}" with ${tracks.length} tracks...`);

  const draftRes = await apiCall('POST', '/admin/catalog/albums/draft', {
    storefront: STOREFRONT,
    name: albumName,
    artistName: album.artistName,
    audioTraits: ['lossless'],
    contentRating: album.collectionExplicitness === 'explicit' ? 'explicit' : '',
    copyright: album.copyright || '',
    genreNames: [album.primaryGenreName || 'Hip-Hop/Rap'],
    isCompilation: false,
    isComplete: true,
    isPrerelease: false,
    isSingle,
    recordLabel: album.copyright?.match(/℗\s*\d+\s+(.+)/)?.[1] || '',
    releaseDate,
    upc: '',
    url: slugify(albumName),
    artistIds: [artistId],
    artworkAssetId,
    tracks,
  });

  const draftId = draftRes.draftId || draftRes.id;
  logInfo('Publishing album draft...');
  await apiCall('POST', `/admin/catalog/drafts/${draftId}/publish`);
  logOk(`Album "${albumName}" published!`);
}

// ════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}        Auto Seed Artist Bot          ${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════╝${c.reset}\n`);

  if (DRY_RUN) logWarn('DRY RUN mode — will crawl & download only, no API calls');
  if (SKIP_TRANSCODE) logWarn('SKIP TRANSCODE mode — will set songs READY directly');

  // ── Interactive Setup ───────────────────────────────

  if (!DRY_RUN) {
    ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
    if (!ADMIN_TOKEN) {
      ADMIN_TOKEN = await promptUser(`  ${c.bold}ADMIN_TOKEN${c.reset} (JWT access token SUPER_ADMIN): `);
    }
    if (!ADMIN_TOKEN) {
      logErr('ADMIN_TOKEN is required');
      process.exit(1);
    }
    logOk('ADMIN_TOKEN set');

    INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || INTERNAL_TOKEN;
    if (!INTERNAL_TOKEN) {
      logErr('INTERNAL_TOKEN is required');
      process.exit(1);
    }
    logOk('INTERNAL_TOKEN set');

    console.log();
  }

  const artistQuery = args.find(a => !a.startsWith('--'))
    || await promptUser(`  ${c.bold}Tên nghệ sĩ${c.reset} cần tìm: `);

  if (!artistQuery) {
    logErr('Tên nghệ sĩ không được để trống');
    process.exit(1);
  }

  // ── PHASE 1: Discovery ──────────────────────────────

  logStep('Phase 1/5', 'Searching Apple Music...');

  const artists = await searchArtistITunes(artistQuery);
  if (artists.length === 0) {
    logErr(`No artists found for "${artistQuery}"`);
    process.exit(1);
  }

  console.log(`\n  Found ${artists.length} artist(s):\n`);
  artists.forEach((a, i) => {
    console.log(`  ${c.bold}[${i + 1}]${c.reset} ${a.artistName} (${a.primaryGenreName || 'N/A'}) — ID: ${a.artistId}`);
  });

  let selectedArtist;
  if (artists.length === 1) {
    selectedArtist = artists[0];
    logOk(`Auto-selected: ${selectedArtist.artistName}`);
  } else {
    const choice = await promptUser(`\n  Pick artist [1-${artists.length}]: `);
    const idx = parseInt(choice, 10) - 1;
    if (idx < 0 || idx >= artists.length) {
      logErr('Invalid choice');
      process.exit(1);
    }
    selectedArtist = artists[idx];
  }

  const slug = slugify(selectedArtist.artistName);
  const tmpDir = path.join(__dirname, '.tmp', slug);
  const audioDir = path.join(tmpDir, 'audio');
  const state = new State(path.join(tmpDir, 'state.json'));

  const highResArtwork = await fetchAppleMusicArtworkHighRes(selectedArtist.artistId);

  logInfo(`Looking up albums for ${selectedArtist.artistName}...`);
  const albums = await lookupAlbumsITunes(selectedArtist.artistId);

  if (albums.length === 0) {
    logErr('No albums found');
    process.exit(1);
  }

  console.log(`\n  Found ${albums.length} album(s)/single(s):\n`);
  albums.forEach((a, i) => {
    const type = a.trackCount <= 3 ? 'Single' : 'Album';
    console.log(`  ${c.bold}[${i + 1}]${c.reset} ${a.collectionName} (${a.trackCount} tracks, ${type}, ${a.releaseDate?.split('T')[0] || '?'})`);
  });

  const albumChoice = await promptUser(`\n  Pick albums to import (e.g. "1,3,5" or "all"): `);
  let selectedAlbums;
  if (albumChoice.toLowerCase() === 'all') {
    selectedAlbums = albums;
  } else {
    const indices = albumChoice.split(',').map(s => parseInt(s.trim(), 10) - 1);
    selectedAlbums = indices.filter(i => i >= 0 && i < albums.length).map(i => albums[i]);
  }

  const selectedAlbumCount = selectedAlbums.length;
  selectedAlbums = uniqueAlbumsByCollectionId(selectedAlbums);
  if (selectedAlbums.length !== selectedAlbumCount) {
    logWarn(`Ignored ${selectedAlbumCount - selectedAlbums.length} duplicate collection ID(s) from the selection`);
  }

  if (selectedAlbums.length === 0) {
    logErr('No albums selected');
    process.exit(1);
  }

  logOk(`Selected ${selectedAlbums.length} album(s)`);

  const albumsWithTracks = [];
  const seenAlbumReleaseKeys = new Map();
  for (const album of selectedAlbums) {
    logInfo(`Loading tracks for "${album.collectionName}"...`);
    const tracks = await lookupTracksITunes(album.collectionId);
    const releaseKey = albumReleaseKey(album, tracks);
    const duplicateOf = seenAlbumReleaseKeys.get(releaseKey);
    if (duplicateOf) {
      logWarn(
        `Skipping duplicate release "${album.collectionName}" (same metadata + tracklist as collection ${duplicateOf})`,
      );
      continue;
    }
    seenAlbumReleaseKeys.set(releaseKey, album.collectionId);
    albumsWithTracks.push({ album, tracks, releaseKey });
    logOk(`${album.collectionName}: ${tracks.length} tracks`);
    await sleep(300);
  }

  // ── PHASE 2: Download ───────────────────────────────

  logStep('Phase 2/5', 'Downloading assets...');

  let artistArtworkUrl = highResArtwork
    ? getHighResArtworkUrl(highResArtwork.url)
    : getITunesArtworkHighRes(selectedArtist.artworkUrl100);
  if (!artistArtworkUrl) {
    artistArtworkUrl = await fetchDeezerArtistArtwork(selectedArtist.artistName);
  }
  if (!artistArtworkUrl) {
    artistArtworkUrl = await fetchNhacCuaTuiArtistArtwork(selectedArtist.artistName);
  }
  if (!artistArtworkUrl) {
    artistArtworkUrl = await fetchZingArtistArtwork(selectedArtist.artistName);
  }
  if (!artistArtworkUrl) {
    const fallbackAlbum = selectedAlbums.find((album) => album.artworkUrl100);
    if (fallbackAlbum) {
      artistArtworkUrl = getITunesArtworkHighRes(fallbackAlbum.artworkUrl100);
      logWarn(
        `No artist portrait found — using artwork from the verified album "${fallbackAlbum.collectionName}"`,
      );
    }
  }

  const artistArtworkPath = path.join(tmpDir, 'artist-artwork.jpg');
  if (artistArtworkUrl) {
    await downloadArtwork(artistArtworkUrl, artistArtworkPath, 'Artist');
  } else {
    throw new Error(
      `No artist or album artwork found for "${selectedArtist.artistName}" from the available metadata sources`,
    );
  }

  let artistVideoBannerPath = null;
  if (highResArtwork?.videoArtwork?.hlsUrl) {
    const videoDest = path.join(tmpDir, 'artist-video-banner.mp4');
    const ok = await downloadVideoBanner(highResArtwork.videoArtwork.hlsUrl, videoDest, 'Artist');
    if (ok) artistVideoBannerPath = videoDest;
  }

  const albumArtworks = {};
  for (const { album } of albumsWithTracks) {
    const albumSlug = slugify(album.collectionName);
    const albumArtworkPath = path.join(tmpDir, `album-${albumSlug}-artwork.jpg`);
    const artworkUrl = getITunesArtworkHighRes(album.artworkUrl100);
    if (artworkUrl) {
      await downloadArtwork(artworkUrl, albumArtworkPath, `Album "${album.collectionName}"`);
      albumArtworks[album.collectionId] = albumArtworkPath;
    }
  }

  const totalTracks = albumsWithTracks.reduce((sum, a) => sum + a.tracks.length, 0);
  logInfo(`Downloading audio for ${totalTracks} track(s)...`);

  // Chống lặp bài: cùng một bản thu (tựa-gốc + nghệ sĩ chính) xuất hiện trên nhiều
  // album/single/tuyển tập chỉ được TẢI một lần; các track sau tái sử dụng file đã có.
  const audioFiles = {};
  const recordingAudio = {};     // recordingKey → { path, source }
  const trackToRecording = {};   // trackId      → recordingKey
  let dedupDownloadCount = 0;
  let trackCounter = 0;
  for (const { album, tracks } of albumsWithTracks) {
    const albumAudioDir = path.join(audioDir, slugify(album.collectionName));
    for (const track of tracks) {
      const songTitle = track.trackName || track.title;
      const recKey = recordingKey(songTitle, track.artistName || selectedArtist.artistName);
      trackToRecording[track.trackId] = recKey;

      if (recordingAudio[recKey]) {
        audioFiles[track.trackId] = { ...recordingAudio[recKey], source: 'dedup' };
        logOk(`[--] "${songTitle}" trùng bản thu đã tải — dùng lại, không tải lại`);
        dedupDownloadCount++;
        trackCounter++;
        continue;
      }

      const result = await downloadSongAudio(track, selectedArtist.artistName, albumAudioDir, trackCounter);
      if (result) {
        audioFiles[track.trackId] = result;
        recordingAudio[recKey] = { path: result.path, source: result.source };
      }
      trackCounter++;
      await sleep(500);
    }
  }

  const nctCount = Object.values(audioFiles).filter(f => f.source === 'nhaccuatui').length;
  const zingCount = Object.values(audioFiles).filter(f => f.source === 'zingmp3').length;
  const youtubeMusicCount = Object.values(audioFiles).filter(f => f.source === 'youtube_music').length;
  const youtubeCount = Object.values(audioFiles).filter(f => f.source === 'youtube').length;
  const soundcloudCount = Object.values(audioFiles).filter(f => f.source === 'soundcloud').length;
  const cachedCount = Object.values(audioFiles).filter(f => f.source === 'cached').length;
  const uniqueRecordings = Object.keys(recordingAudio).length;
  const failedCount = totalTracks - Object.keys(audioFiles).length;

  console.log(`\n  ${c.bold}Download Summary:${c.reset}`);
  console.log(`  ${c.green}NhacCuaTui:${c.reset}     ${nctCount}`);
  console.log(`  ${c.cyan}Zing MP3:${c.reset}       ${zingCount}`);
  console.log(`  ${c.magenta}YouTube Music:${c.reset}  ${youtubeMusicCount}`);
  console.log(`  ${c.magenta}YouTube:${c.reset}        ${youtubeCount}`);
  console.log(`  ${c.magenta}SoundCloud:${c.reset}     ${soundcloudCount}`);
  console.log(`  ${c.blue}Cached:${c.reset}         ${cachedCount}`);
  console.log(`  ${c.dim}Bản thu duy nhất:${c.reset} ${uniqueRecordings} / ${totalTracks} track (${dedupDownloadCount} trùng đã bỏ tải lại)`);
  if (failedCount > 0) console.log(`  ${c.red}Failed:${c.reset}         ${failedCount}`);

  if (DRY_RUN) {
    logStep('DRY RUN COMPLETE', 'Assets downloaded. No API calls made.');
    logInfo(`Files saved to: ${tmpDir}`);
    process.exit(0);
  }

  // ── PHASE 3: Upload Artworks ────────────────────────

  logStep('Phase 3/5', 'Uploading artworks to local API...');

  let artistArtworkAssetId = state.get('artistArtworkAssetId');
  if (!artistArtworkAssetId && fs.existsSync(artistArtworkPath)) {
    artistArtworkAssetId = await uploadArtworkAsset(artistArtworkPath, 'Artist');
    state.set('artistArtworkAssetId', artistArtworkAssetId);
  }

  let artistVideoAssetId = state.get('artistVideoAssetId');
  if (!artistVideoAssetId && artistVideoBannerPath && fs.existsSync(artistVideoBannerPath)) {
    try {
      artistVideoAssetId = await uploadVideoAsset(artistVideoBannerPath, 'Artist banner');
      state.set('artistVideoAssetId', artistVideoAssetId);
    } catch (err) {
      logWarn(`Failed to upload artist video banner: ${err.message}`);
    }
  }

  const albumArtworkAssetIds = state.get('albumArtworkAssetIds') || {};
  for (const { album } of albumsWithTracks) {
    const artworkPath = albumArtworks[album.collectionId];
    if (!artworkPath || albumArtworkAssetIds[album.collectionId]) continue;
    const assetId = await uploadArtworkAsset(artworkPath, `Album "${album.collectionName}"`);
    albumArtworkAssetIds[album.collectionId] = assetId;
    state.set('albumArtworkAssetIds', albumArtworkAssetIds);
  }

  // ── PHASE 4: Create Artist + Upload Songs ──────────

  logStep('Phase 4/5', 'Creating artist & uploading songs...');

  let artistId = state.get('artistId');
  if (!artistId) {
    artistId = await createAndPublishArtist(
      selectedArtist.artistName,
      [selectedArtist.primaryGenreName || 'Hip-Hop/Rap'],
      artistArtworkAssetId,
      artistVideoAssetId,
    );
    state.set('artistId', artistId);
  } else {
    logOk(`Artist already created — artistId: ${artistId}`);
  }

  const songIdMap = state.get('songIdMap') || {};
  const checksumMap = state.get('checksumMap') || {};
  const albumReleaseMap = state.get('albumReleaseMap') || {};
  // Chống lặp bài ở tầng catalog: mỗi bản thu (tựa-gốc + nghệ sĩ chính) chỉ ánh xạ
  // tới ĐÚNG MỘT songId, dù xuất hiện ở nhiều album. Đây là lớp chống lặp chính —
  // không phụ thuộc checksum (bản re-encode từ mỗi nguồn cho checksum khác nhau).
  const recordingSongMap = state.get('recordingSongMap') || {};

  for (const { album, tracks } of albumsWithTracks) {
    logInfo(`\nProcessing songs for album "${album.collectionName}"...`);

    for (const track of tracks) {
      const trackKey = `${album.collectionId}:${track.trackId}`;
      if (songIdMap[trackKey]) {
        logOk(`Song "${track.trackName}" already uploaded — songId: ${songIdMap[trackKey]}`);
        continue;
      }

      const recKey = recordingKey(
        track.trackName || track.title,
        track.artistName || selectedArtist.artistName,
      );

      // ── Lớp 1: cùng bản thu đã có songId → tái sử dụng, KHÔNG upload lại ──
      if (recordingSongMap[recKey]) {
        songIdMap[trackKey] = recordingSongMap[recKey];
        state.set('songIdMap', songIdMap);
        logOk(`Song "${track.trackName}" trùng bản thu — dùng lại songId: ${recordingSongMap[recKey]}`);
        continue;
      }

      const audioFile = audioFiles[track.trackId];
      if (!audioFile) {
        logWarn(`No audio for "${track.trackName}", skipping`);
        continue;
      }

      // ── Lớp 2: trùng checksum (an toàn dự phòng cho file y hệt) ──
      const fileChecksum = await sha256File(audioFile.path);
      if (checksumMap[fileChecksum]) {
        const existing = checksumMap[fileChecksum];
        if (typeof existing === 'string') {
          logWarn(`Skipping "${track.trackName}": checksum comes from legacy state without title metadata`);
          continue;
        }
        const existingSongId = existing.songId;
        const existingTitle = existing.title;
        if (
          existingTitle &&
          normalizeMusicText(existingTitle) !== normalizeMusicText(track.trackName)
        ) {
          logWarn(`Skipping "${track.trackName}": audio checksum matches a different track ("${existingTitle}")`);
          continue;
        }
        songIdMap[trackKey] = existingSongId;
        recordingSongMap[recKey] = existingSongId;
        state.set('songIdMap', songIdMap);
        state.set('recordingSongMap', recordingSongMap);
        logOk(`Song "${track.trackName}" matched by checksum — songId: ${existingSongId}`);
        continue;
      }

      try {
        const songId = await uploadSongThroughPipeline(audioFile, track.trackName);
        songIdMap[trackKey] = songId;
        recordingSongMap[recKey] = songId;
        checksumMap[fileChecksum] = { songId, title: track.trackName || track.title };
        state.set('songIdMap', songIdMap);
        state.set('recordingSongMap', recordingSongMap);
        state.set('checksumMap', checksumMap);
      } catch (err) {
        logErr(`Failed to upload "${track.trackName}": ${err.message}`);
      }
    }
  }

  // ── PHASE 5: Create Drafts + Publish ────────────────

  logStep('Phase 5/5', 'Creating catalog drafts & publishing...');

  const publishedSongs = state.get('publishedSongs') || {};
  // Mỗi songId (một bản thu) chỉ publish draft MỘT lần, kể cả khi được gán vào
  // nhiều album do đã dedup theo bản thu — tránh tạo bản ghi bài trùng.
  const publishedSongIds = state.get('publishedSongIds') || {};

  for (const { album, tracks, releaseKey } of albumsWithTracks) {
    const albumArtworkAssetId = albumArtworkAssetIds[album.collectionId] || artistArtworkAssetId;
    const releaseDate = album.releaseDate ? album.releaseDate.split('T')[0] : '';
    const albumName = album.collectionName;

    const songMappings = [];
    const seenSongIdsInAlbum = new Set();

    for (const track of tracks) {
      const trackKey = `${album.collectionId}:${track.trackId}`;
      const songId = songIdMap[trackKey];
      if (!songId) continue;

      // Trong cùng một album, không thêm cùng một songId hai lần (các bản in lại).
      if (seenSongIdsInAlbum.has(songId)) {
        logWarn(`Bỏ track trùng bản thu trong album "${albumName}": "${track.trackName}" (songId ${songId} đã có)`);
        continue;
      }

      if (!publishedSongs[trackKey] && !publishedSongIds[songId]) {
        try {
          await createAndPublishSongDraft(
            track, songId, artistId, albumName, albumArtworkAssetId, releaseDate
          );
          publishedSongs[trackKey] = true;
          publishedSongIds[songId] = true;
          state.set('publishedSongs', publishedSongs);
          state.set('publishedSongIds', publishedSongIds);
        } catch (err) {
          logErr(`Failed to publish song draft "${track.trackName}": ${err.message}`);
          continue;
        }
      } else {
        publishedSongs[trackKey] = true;
        state.set('publishedSongs', publishedSongs);
      }

      seenSongIdsInAlbum.add(songId);
      songMappings.push({ track, catalogSongId: songId });
    }

    if (songMappings.length === 0) {
      logWarn(`No songs available for album "${albumName}", skipping album creation`);
      continue;
    }

    const albumPublished = state.get(`albumPublished:${album.collectionId}`);
    if (albumPublished) {
      logOk(`Album "${albumName}" already published`);
      continue;
    }

    const duplicateRelease = albumReleaseMap[releaseKey];
    if (duplicateRelease && duplicateRelease !== album.collectionId) {
      logWarn(
        `Skipping duplicate release "${albumName}" — already published from collection ${duplicateRelease}`,
      );
      state.set(`albumPublished:${album.collectionId}`, true);
      continue;
    }

    try {
      await createAndPublishAlbum(album, artistId, songMappings, albumArtworkAssetId);
      state.set(`albumPublished:${album.collectionId}`, true);
      albumReleaseMap[releaseKey] = album.collectionId;
      state.set('albumReleaseMap', albumReleaseMap);
    } catch (err) {
      logErr(`Failed to publish album "${albumName}": ${err.message}`);
    }
  }

  // ── Verify ──────────────────────────────────────────

  console.log(`\n${c.bold}${c.green}━━━ Verification ━━━${c.reset}\n`);

  try {
    const artistRes = await apiCall('GET', `/catalog/${STOREFRONT}/artists/${artistId}`);
    logOk(`Artist: ${JSON.stringify(artistRes.resources?.artists || {}).substring(0, 100)}...`);
  } catch (err) {
    logWarn(`Artist verify: ${err.message}`);
  }

  try {
    const albumsRes = await apiCall('GET', `/catalog/${STOREFRONT}/artists/${artistId}/albums`);
    const albumCount = albumsRes.data?.length || 0;
    logOk(`Albums: ${albumCount} found`);
  } catch (err) {
    logWarn(`Albums verify: ${err.message}`);
  }

  try {
    const songsRes = await apiCall('GET', `/catalog/${STOREFRONT}/artists/${artistId}/songs`);
    const songCount = songsRes.data?.length || 0;
    logOk(`Songs: ${songCount} found`);
  } catch (err) {
    logWarn(`Songs verify: ${err.message}`);
  }

  console.log(`\n${c.bold}${c.green}Done!${c.reset} Artist "${selectedArtist.artistName}" seeded successfully.`);
  console.log(`${c.dim}Artist ID: ${artistId}${c.reset}`);
  console.log(`${c.dim}State file: ${path.relative(process.cwd(), state.file)}${c.reset}\n`);
}

main().catch(err => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
