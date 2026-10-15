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
 *   node tools/scripts/seed-artist.mjs --dry-run
 *   node tools/scripts/seed-artist.mjs --no-youtube      # tắt fallback YouTube
 *   node tools/scripts/seed-artist.mjs --no-soundcloud   # tắt fallback SoundCloud
 *   node tools/scripts/seed-artist.mjs --no-static-lyrics # không lấy lyric Apple Music
 *
 * Script sẽ hỏi interactive:
 *   1. ADMIN_TOKEN (JWT access token SUPER_ADMIN)
 *   2. Tên nghệ sĩ cần tìm
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline as streamPipeline } from "node:stream/promises";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  AppleMusicStaticLyricsUnavailableError,
  closeAppleMusicBrowser,
  fetchAppleMusicBrowserStaticLyrics,
} from "./apple-music-browser-lyrics.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const projectRoot = path.resolve(__dirname, "..", "..");
const FALLBACK_ARTIST_ARTWORK_PATH = path.join(
  projectRoot,
  "tools",
  "seed-studio",
  "assets",
  "fallback.jpg",
);
const { SONG_CREDIT_ROLE_IDS } = require(
  path.join(projectRoot, "packages", "shared-constants", "dist", "index.js"),
);

// ─── Config ────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "http://localhost:9999/v1";
let ADMIN_TOKEN = "";
let SEED_ARTIST_PASSWORD = "";
let SEED_ARTIST_ACCESS_TOKEN = "";
let SEED_ARTIST_OWNER_EMAIL = "";
let SEED_ARTIST_OWNER_STATE = null;
let seedArtistOwnerRefreshInFlight = null;
// Increment when seed-derived credits change so resumed seeds repair existing
// song-to-artist relations as well as newly imported songs.
const CATALOG_SONG_PUBLISH_VERSION = 16;
const CATALOG_ALBUM_PUBLISH_VERSION = 4;

function catalogIngestionKey(collectionId) {
  return crypto
    .createHash("sha256")
    .update(
      `music-streaming-system:catalog-seed:v1:${STOREFRONT}:${collectionId}`,
    )
    .digest("hex");
}
let FINALIZER_INTERNAL_TOKEN = "";
const STOREFRONT = "vn";

const args = process.argv.slice(2);
if (args.includes("--skip-transcode")) {
  throw new Error(
    "--skip-transcode was removed: seeded songs must use the real transcode and completion queues",
  );
}
const DRY_RUN = args.includes("--dry-run");
const NO_YOUTUBE = args.includes("--no-youtube");
const NO_SOUNDCLOUD = args.includes("--no-soundcloud");
const STATIC_LYRICS_ENABLED = !args.includes("--no-static-lyrics");
const METADATA_ONLY = args.includes("--metadata-only");

function parsePositiveIntegerEnv(name, fallback, min, max) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

// A normal queue can legitimately take longer than the old three-minute
// polling window, especially while a worker is restarting or draining work.
// Keep the wait bounded, but make it configurable for slower environments.
const READY_WAIT_TIMEOUT_MS = parsePositiveIntegerEnv(
  "SEED_READY_WAIT_TIMEOUT_MS",
  20 * 60 * 1000,
  60 * 1000,
  2 * 60 * 60 * 1000,
);
const READY_WAIT_POLL_MS = parsePositiveIntegerEnv(
  "SEED_READY_WAIT_POLL_MS",
  3000,
  1000,
  60 * 1000,
);
const ASSET_READY_WAIT_TIMEOUT_MS = parsePositiveIntegerEnv(
  "SEED_ASSET_READY_WAIT_TIMEOUT_MS",
  10 * 60 * 1000,
  60 * 1000,
  60 * 60 * 1000,
);
const ASSET_READY_WAIT_POLL_MS = parsePositiveIntegerEnv(
  "SEED_ASSET_READY_WAIT_POLL_MS",
  3000,
  1000,
  60 * 1000,
);
const API_REQUEST_TIMEOUT_MS = parsePositiveIntegerEnv(
  "SEED_API_REQUEST_TIMEOUT_MS",
  30 * 1000,
  5000,
  2 * 60 * 1000,
);
function optionValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || "").trim() : "";
}
function firstPositionalArgument() {
  const optionsWithValues = new Set([
    "--artist-id",
    "--album-ids",
    "--audio-mode",
    "--catalog-artist-id",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (optionsWithValues.has(argument)) {
      index += 1;
      continue;
    }
    if (!argument.startsWith("--")) return argument;
  }
  return "";
}
const SELECTED_ARTIST_ID = optionValue("--artist-id");
const CATALOG_ARTIST_ID = optionValue("--catalog-artist-id");
const SELECTED_ALBUM_IDS = new Set(
  optionValue("--album-ids")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const AUDIO_MODE = (optionValue("--audio-mode") || "STANDARD").toUpperCase();
if (!["STANDARD", "SING"].includes(AUDIO_MODE)) {
  throw new Error("--audio-mode must be STANDARD or SING");
}
// Độ lệch độ dài tối đa (giây) giữa audio tải về và metadata iTunes trước khi coi là "sai bài".
const DURATION_TOLERANCE_SEC = 15;
const APPLE_MUSIC_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};
// Static lyrics come only from the full-lyrics dialog rendered in the user's
// signed-in Apple Music browser session. Bump this when its DOM parser changes
// so previously captured lines are refreshed.
const STATIC_LYRIC_SEED_VERSION = 3;

// ─── ANSI Colors ───────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(icon, msg) {
  console.log(`${c.dim}[seed]${c.reset} ${icon} ${msg}`);
}
function logOk(msg) {
  log(`${c.green}✓${c.reset}`, msg);
}
function logInfo(msg) {
  log(`${c.blue}ℹ${c.reset}`, msg);
}
function logWarn(msg) {
  log(`${c.yellow}⚠${c.reset}`, msg);
}
function logErr(msg) {
  log(`${c.red}✗${c.reset}`, msg);
}
function logStep(step, msg) {
  console.log(`\n${c.bold}${c.cyan}━━━ ${step} ━━━${c.reset}`);
  console.log(`${c.dim}${msg}${c.reset}\n`);
}

// ─── Helpers ───────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    // Keep non-Latin letters in filesystem-safe slugs. Otherwise CJK artist
    // and release names collapse to an empty path and share the same state.
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeMusicText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    // Artist and release matching must retain letters outside the Latin
    // alphabet (for example, 叶炫清). Stripping them made every CJK artist
    // name empty, so its own releases were rejected as unrelated.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasHanCharacters(value) {
  return /\p{Script=Han}/u.test(String(value || ""));
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
  const expectedTokens = new Set(expected.split(" "));
  const actualPrimaryTokens = primaryArtistName(actualArtist)
    .split(" ")
    .filter(Boolean);
  return (
    actualPrimaryTokens.length > 0 &&
    actualPrimaryTokens.every((t) => t.length >= 3 && expectedTokens.has(t))
  );
}

/**
 * Lấy nghệ sĩ chính (đã chuẩn hoá) từ chuỗi nghệ sĩ thô. Phải tách trên chuỗi
 * GỐC vì normalizeMusicText biến dấu phẩy/`&` thành khoảng trắng nên không tách
 * được nữa: "Đen, JustaTee" → nghệ sĩ chính "den".
 */
function primaryArtistName(rawArtist) {
  const first = String(rawArtist || "").split(
    /\s*(?:,|&|feat\.?|ft\.?|featuring|x|với|and)\s+/i,
  )[0];
  return normalizeMusicText(first);
}

function creditedArtistNames(rawArtist) {
  const seen = new Set();
  return String(rawArtist || "")
    .split(/\s*(?:,|&|feat\.?|ft\.?|featuring|x|với|and)\s+/i)
    .map((name) => name.trim())
    .filter((name) => {
      const key = normalizeMusicText(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function trackCreditNames(track) {
  // The iTunes track artist field is the only source of song artists. A
  // "feat." suffix belongs to the title, not to authoritative artist data.
  return creditedArtistNames(track.artistName || track.collectionArtistName);
}

function featuredArtistNamesFromTitle(title) {
  const seen = new Set();
  const names = [];
  const pattern = /[\[(]\s*(?:feat(?:uring)?|ft)\.?\s+([^\])]+)[\])]/gi;

  for (const match of String(title || "").matchAll(pattern)) {
    for (const name of creditedArtistNames(match[1])) {
      const key = normalizeMusicText(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }

  return names;
}

function trackFeaturedArtistNames(track, album) {
  const namesFromTrack = featuredArtistNamesFromTitle(
    track.trackName || track.title,
  );
  if (namesFromTrack.length || releaseTypeForSeedAlbum(album) !== "single") {
    return namesFromTrack;
  }

  // iTunes often gives a Single's featured billing only on collectionName.
  // Do not apply that fallback to multi-track releases: a featured album title
  // must not turn every track into a collaboration.
  return featuredArtistNamesFromTitle(album.collectionName || album.name);
}

function songArtistNames(track, album) {
  const seen = new Set();
  return [
    ...trackCreditNames(track),
    ...trackFeaturedArtistNames(track, album),
  ].filter((name) => {
    const key = normalizeMusicText(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedArtistAliasKeys(albumsWithTracks, selectedArtist) {
  const aliases = new Set([normalizeMusicText(selectedArtist?.artistName)]);
  const selectedArtistId = String(selectedArtist?.artistId || "");

  for (const { album, tracks } of albumsWithTracks) {
    if (String(album.artistId || "") === selectedArtistId) {
      for (const name of creditedArtistNames(
        album.artistName || album.collectionArtistName,
      )) {
        aliases.add(normalizeMusicText(name));
      }
    }
    for (const track of tracks) {
      if (String(track.artistId || "") !== selectedArtistId) continue;
      for (const name of trackCreditNames(track)) {
        aliases.add(normalizeMusicText(name));
      }
    }
  }

  aliases.delete("");
  return aliases;
}

function isSelectedArtistName(name, selectedArtist, selectedArtistAliases) {
  return (
    selectedArtistAliases?.has(normalizeMusicText(name)) ||
    artistMatches(selectedArtist?.artistName, name)
  );
}

function displayTrackArtistName(track) {
  // Keep iTunes' billed-artist display text verbatim. Parsed credit names are
  // only for relational records; they must not rewrite display punctuation.
  return String(track.artistName || track.collectionArtistName || "").trim();
}

function preferredArtistDisplayName(rawName, selectedArtist, selectedArtistAliases) {
  const name = String(rawName || "").trim();
  return isSelectedArtistName(name, selectedArtist, selectedArtistAliases)
    ? selectedArtist.artistName
    : name;
}

function albumBelongsToArtist(album, artist) {
  // The lookup may contain a release where this artist is only on one track.
  // Prefer the stable iTunes artist ID: display names can switch between CJK
  // and a Latin transliteration across the artist and collection endpoints.
  if (String(album.artistId || "") === String(artist?.artistId || "")) {
    return true;
  }

  // Keep the name fallback for releases where iTunes assigns the first billed
  // collaborator as artistId, while the selected artist remains a collection
  // artist.
  return creditedArtistNames(
    album.artistName || album.collectionArtistName,
  ).some((name) => artistMatches(artist?.artistName, name));
}

function releaseTypeForSeedAlbum(album) {
  const name = String(album.collectionName || album.name || "").trim();

  // iTunes Lookup does not expose a release-type field. Only use unambiguous
  // labels from the provider name; an ambiguous multi-track release remains an
  // album until an editor corrects it in Catalog.
  if (/\bep\s*$/i.test(name)) return "ep";
  if (/\bsingle\s*$/i.test(name) || Number(album.trackCount) === 1) {
    return "single";
  }
  return "album";
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
const TECH_SUFFIX_RE =
  /\b(feat|ft|featuring|with|remaster(ed)?|version|edit|mono|stereo|explicit|clean|bonus|deluxe|instrumental|karaoke|beat|prod|original|radio)\b/i;

function canonicalTrackTitle(title) {
  let t = String(title || "");
  // Bỏ mọi đoạn trong ngoặc () hoặc [] chỉ chứa hậu tố kỹ thuật.
  t = t.replace(/\s*[([][^)\]]*[)\]]/g, (m) => {
    const inner = m.replace(/[()[\]]/g, "").trim();
    return TECH_SUFFIX_RE.test(inner) ? "" : " " + inner;
  });
  // Bỏ hậu tố sau dấu gạch: "... - Single Version", "... - Remastered 2021"
  t = t.replace(
    /\s*-\s*(single version|album version|remaster(ed)?( \d{2,4})?|explicit|clean|mono|stereo|radio edit|bonus track|original mix).*$/i,
    "",
  );
  return normalizeMusicText(t);
}

/**
 * Khoá định danh bản thu dùng để chống lặp toàn bộ quá trình seed:
 * tựa-gốc + nghệ sĩ-chính. Cùng khoá ⇒ cùng một bài, chỉ xử lý một lần.
 */
function recordingKey(title, artist) {
  return `${canonicalTrackTitle(title)}::${primaryArtistName(artist)}`;
}

// Những biến thể này là release khác, dù có thể dùng gần như cùng tracklist.
// Chúng không được tự động gộp chỉ dựa vào metadata từ iTunes.
const AUTO_GROUP_BLOCKED_EDITION_RE =
  /\b(?:live|remaster(?:ed)?|re[- ]?recorded|acoustic|instrumental|karaoke|remix|soundtrack|greatest hits|compilation)\b/i;
const EXPANDED_EDITION_SUFFIX_RE =
  /\s*(?:[\[(]\s*)?(?:deluxe|expanded|extended|complete|anniversary)(?:\s+(?:edition|version))?(?:\s*[\])])?(?:\s*-\s*(?:deluxe|expanded|extended|complete|anniversary)(?:\s+(?:edition|version))?)?\s*$/i;

/**
 * A release-family key is intentionally conservative. A Single is not an
 * edition of an album merely because its only song also appears in that album.
 * A same-name provider variant is also allowed, but only after strict track
 * containment proves that it is the richer edition.
 */
function albumEditionFamilyKey(album) {
  const rawTitle = String(album.collectionName || album.name || "").trim();
  if (!rawTitle || AUTO_GROUP_BLOCKED_EDITION_RE.test(rawTitle)) return "";

  const baseTitle = rawTitle.replace(EXPANDED_EDITION_SUFFIX_RE, "").trim();
  if (!baseTitle) return "";

  const artist = primaryArtistName(
    album.artistName || album.collectionArtistName || "",
  );
  const title = normalizeMusicText(baseTitle);
  return title && artist ? `${title}::${artist}` : "";
}

function albumTrackKeys(tracks) {
  return new Set(
    tracks
      .map((track) =>
        recordingKey(
          track.trackName || track.title,
          track.artistName || track.collectionArtistName || "",
        ),
      )
      .filter(Boolean),
  );
}

function isStrictTrackSubset(smaller, larger) {
  return (
    smaller.size > 0 &&
    smaller.size < larger.size &&
    [...smaller].every((trackKey) => larger.has(trackKey))
  );
}

/**
 * Returns the richer edition only when we can prove a Standard/Deluxe relation:
 * same conservative family key and every Standard recording exists in Deluxe.
 * Otherwise returns null and both releases remain eligible for import.
 */
function preferredAlbumEdition(first, second) {
  const firstFamily = albumEditionFamilyKey(first.album);
  const secondFamily = albumEditionFamilyKey(second.album);
  if (!firstFamily || firstFamily !== secondFamily) return null;

  const firstTracks = albumTrackKeys(first.tracks);
  const secondTracks = albumTrackKeys(second.tracks);
  if (isStrictTrackSubset(firstTracks, secondTracks)) return second;
  if (isStrictTrackSubset(secondTracks, firstTracks)) return first;
  return null;
}

function selectPreferredAlbumEditions(candidates) {
  const selected = [];

  for (const candidate of candidates) {
    let handled = false;
    for (let index = 0; index < selected.length; index += 1) {
      const current = selected[index];
      const preferred = preferredAlbumEdition(current, candidate);
      if (!preferred) continue;

      const skipped = preferred === current ? candidate : current;
      logWarn(
        `Keeping richer edition "${preferred.album.collectionName}" (${preferred.tracks.length} tracks); skipping Standard/Deluxe variant "${skipped.album.collectionName}" (${skipped.tracks.length} tracks)`,
      );
      if (preferred === candidate) selected[index] = candidate;
      handled = true;
      break;
    }
    if (!handled) selected.push(candidate);
  }

  return selected;
}

function uniqueAlbumsByCollectionId(albums) {
  const seen = new Set();
  return albums.filter((album) => {
    const collectionId = String(album.collectionId || "");
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
  const original = String(title || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!original) return [];

  const withoutGuests = original
    .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\b[^)\]]*[)\]]/gi, "")
    .replace(/\s+(?:feat\.?|ft\.?|featuring|with)\b.*$/i, "")
    .trim();

  const withoutTechnicalSuffix = withoutGuests
    .replace(
      /\s*[([]\s*(?:remaster(?:ed)?|single version|album version|radio edit|original mix|explicit|clean|mono|stereo|bonus track)\b[^)\]]*[)\]]/gi,
      "",
    )
    .replace(
      /\s*-\s*(?:single version|album version|remaster(?:ed)?(?:\s+\d{2,4})?|radio edit|original mix|explicit|clean|mono|stereo|bonus track).*$/i,
      "",
    )
    .trim();

  const seen = new Set();
  return [original, withoutGuests, withoutTechnicalSuffix]
    .filter((candidate) => {
      const key = normalizeMusicText(candidate);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
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
  const t = String(title || "")
    .replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\b[^)\]]*[)\]]/gi, "")
    .replace(/\s+(?:feat\.?|ft\.?|featuring|with)\b.*$/i, "")
    .replace(
      /\s*[([]\s*(?:remaster(?:ed)?(?:\s+\d{2,4})?|single version|album version|radio edit|original mix|explicit|clean|mono|stereo|bonus track)\b[^)\]]*[)\]]/gi,
      "",
    )
    .replace(
      /\s*-\s*(?:single version|album version|remaster(?:ed)?(?:\s+\d{2,4})?|radio edit|original mix|explicit|clean|mono|stereo|bonus track).*$/i,
      "",
    );
  return normalizeMusicText(t);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    redirect: "follow",
  });
  if (!res.ok)
    throw new Error(
      `Download failed: ${res.status} ${res.statusText} — ${url}`,
    );

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
    const { execSync } = await import("node:child_process");
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 },
    )
      .toString()
      .trim();
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
  if (actualSec == null)
    return { ok: true, actualSec: null, expectedSec: null };
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
    return "image/jpeg";
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
    return "image/png";
  }
  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString("ascii") === "RIFF" &&
    header.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
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
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (!Object.hasOwn(extraHeaders, "Authorization")) {
    headers.Authorization = `Bearer ${await getAdminToken()}`;
  }
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
        signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }

      if (!res.ok) {
        const errMsg = typeof json === "object" ? JSON.stringify(json) : text;
        const err = new Error(`API ${res.status}: ${errMsg}`);
        if (res.status >= 400 && res.status < 500) throw err;
        throw err;
      }
      return json;
    } catch (err) {
      lastErr = err;
      const is4xx = err.message?.startsWith("API 4");
      if (is4xx) throw err;
      if (attempt < 3) {
        logWarn(`API call failed (attempt ${attempt}/3), retrying...`);
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastErr;
}

function responseData(payload) {
  return payload && typeof payload === "object" && payload.data
    ? payload.data
    : payload;
}

function artistAuthorization() {
  if (!SEED_ARTIST_ACCESS_TOKEN) {
    throw new Error("Seed Artist owner session is not available");
  }
  return { Authorization: "Bearer " + SEED_ARTIST_ACCESS_TOKEN };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isExpiredArtistOwnerTokenError(error) {
  const message = errorMessage(error);
  return message.includes("API 401") || message.includes("AUTH_INVALID_TOKEN");
}

async function refreshSeedArtistOwnerSession() {
  if (!SEED_ARTIST_OWNER_EMAIL || !SEED_ARTIST_OWNER_STATE) {
    throw new Error(
      "Seed Artist owner session cannot be refreshed because its login context is unavailable",
    );
  }

  if (!seedArtistOwnerRefreshInFlight) {
    seedArtistOwnerRefreshInFlight = (async () => {
      logWarn(
        "Artist owner access token expired; signing in again before retrying upload",
      );
      await loginSeedArtistOwner(
        SEED_ARTIST_OWNER_EMAIL,
        SEED_ARTIST_OWNER_STATE,
      );
    })().finally(() => {
      seedArtistOwnerRefreshInFlight = null;
    });
  }

  await seedArtistOwnerRefreshInFlight;
}

async function requestSongUpload(payload) {
  try {
    return await apiCall(
      "POST",
      "/songs/request-upload",
      payload,
      artistAuthorization(),
    );
  } catch (error) {
    if (!isExpiredArtistOwnerTokenError(error)) throw error;

    await refreshSeedArtistOwnerSession();
    return apiCall(
      "POST",
      "/songs/request-upload",
      payload,
      artistAuthorization(),
    );
  }
}

async function getAdminToken() {
  const tokenUrl = process.env.SEED_STUDIO_TOKEN_URL?.trim();
  if (!tokenUrl) return ADMIN_TOKEN;

  const jobSecret = process.env.SEED_STUDIO_JOB_SECRET?.trim();
  const response = await fetch(tokenUrl, {
    headers: { "x-seed-job-secret": jobSecret || "" },
  });
  if (!response.ok) {
    throw new Error(`Seed Studio token unavailable: ${response.status}`);
  }
  const payload = await response.json();
  if (!payload.accessToken || typeof payload.accessToken !== "string") {
    throw new Error("Seed Studio returned an invalid access token");
  }
  return payload.accessToken;
}

const APPLE_MUSIC_CREDIT_ROLE_MAP = Object.freeze({
  performer: "performer",
  vocals: "vocals",
  "lead vocals": "lead_vocals",
  "background vocals": "background_vocals",
  musician: "musician",
  instrumentalist: "instrumentalist",
  guitar: "guitar",
  "bass guitar": "bass_guitar",
  drums: "drums",
  percussion: "percussion",
  keyboards: "keyboards",
  piano: "piano",
  synthesizer: "synthesizer",
  strings: "strings",
  violin: "violin",
  programming: "programming",
  composer: "composer",
  lyrics: "lyrics",
  lyricist: "lyrics",
  songwriter: "songwriter",
  arranger: "arranger",
  "vocal arranger": "vocal_arranger",
  translator: "translator",
  producer: "producer",
  "co-producer": "co_producer",
  "executive producer": "executive_producer",
  "recording engineer": "recording_engineer",
  "mixing engineer": "mixing_engineer",
  "mastering engineer": "mastering_engineer",
  "immersive engineer": "immersive_engineer",
  "assistant engineer": "assistant_engineer",
  engineer: "engineer",
  remixer: "remixer",
});

function appleMusicSongUrl(track) {
  // Apple includes its serialized credit payload on the opaque route. The
  // localized title-slug route can render but omit the detailed credits.
  if (track.trackId) {
    return `https://music.apple.com/${STOREFRONT}/song/_/${encodeURIComponent(track.trackId)}`;
  }
  const trackUrl = String(track.trackViewUrl || "").trim();
  if (trackUrl.includes("music.apple.com/") && trackUrl.includes("/song/")) {
    return trackUrl;
  }

  return "";
}

function collectAppleMusicSongCredits(value, credits, seenObjects = new Set()) {
  if (!value || typeof value !== "object" || seenObjects.has(value)) return;
  seenObjects.add(value);

  if (value.itemKind === "songDetailItemLockup" && Array.isArray(value.items)) {
    for (const item of value.items) {
      const name = String(item?.name || "").trim();
      const roleNames = Array.isArray(item?.roleNames) ? item.roleNames : [];
      for (const roleName of roleNames) {
        const role = APPLE_MUSIC_CREDIT_ROLE_MAP[normalizeMusicText(roleName)];
        if (name && role) credits.push({ name, role });
      }
    }
  }

  for (const child of Object.values(value)) {
    collectAppleMusicSongCredits(child, credits, seenObjects);
  }
}

async function fetchAppleMusicSongCredits(track) {
  const title = track.trackName || track.title || "";
  const url = appleMusicSongUrl(track);
  if (!url) {
    logWarn(
      `Apple Music credit lookup skipped for "${title}": missing song URL`,
    );
    return [];
  }

  try {
    const response = await fetch(url, { headers: APPLE_MUSIC_HEADERS });
    if (!response.ok) {
      logWarn(
        `Apple Music credit lookup failed for "${title}": HTTP ${response.status}`,
      );
      return [];
    }

    const data = parseAppleMusicServerData(await response.text());
    const rawCredits = [];
    collectAppleMusicSongCredits(data, rawCredits);
    const seen = new Set();
    const credits = rawCredits.filter((credit) => {
      const key = `${normalizeMusicText(credit.name)}:${credit.role}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (credits.length) {
      logOk(`Apple Music found ${credits.length} credit(s) for "${title}"`);
    } else {
      logInfo(
        `Apple Music has no detailed credits for "${title}"; continuing without credits`,
      );
    }
    return credits;
  } catch (error) {
    logWarn(
      `Could not fetch Apple Music credits for "${title}": ${errorMessage(error)}`,
    );
    return [];
  }
}

async function fetchAppleMusicStaticLyrics(track) {
  const title = track.trackName || track.title || "";
  try {
    const lines = await fetchAppleMusicBrowserStaticLyrics(track, { log: logInfo });
    if (lines.length)
      logOk(
        `Apple Music found ${lines.length} static lyric section(s) for "${title}"`,
      );
    return lines;
  } catch (error) {
    if (error instanceof AppleMusicStaticLyricsUnavailableError) {
      logInfo(`Apple Music has no static lyric for "${title}"; continuing.`);
      return [];
    }
    logWarn(
      `Could not fetch static lyric for "${title}": ${errorMessage(error)}`,
    );
    // Do not mark this song as processed: a missing Apple Music login or a
    // temporary browser failure must be retryable on the next Seed Studio run.
    throw error;
  }
}

async function upsertSongStaticLyrics(songId, lines) {
  await apiCall(
    "POST",
    `/admin/catalog/songs/${encodeURIComponent(songId)}/static-lyrics`,
    {
      lines,
    },
  );
}

function normalizeReviewedCredits(rawCredits) {
  const seen = new Set();
  return (Array.isArray(rawCredits) ? rawCredits : []).flatMap((credit) => {
    const name = String(credit?.name || "").trim();
    const role = String(credit?.role || "")
      .trim()
      .toLowerCase();
    const key = `${normalizeMusicText(name)}:${role}`;
    if (!name || !SONG_CREDIT_ROLE_IDS.has(role) || seen.has(key)) return [];
    seen.add(key);
    return [{ name, role }];
  });
}

async function uploadBinary(presignedUrl, filePath, contentType) {
  const fileBuffer = fs.readFileSync(filePath);
  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
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
        this.data = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        logInfo(`Loaded state from ${path.basename(stateFile)}`);
      } catch {
        this.data = {};
      }
    }
  }
  get(key) {
    return this.data[key];
  }
  set(key, value) {
    this.data[key] = value;
    this.save();
  }
  delete(key) {
    delete this.data[key];
    this.save();
  }
  save() {
    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Never truncate the only resume state in place. A process crash while
    // saving used to leave invalid JSON, which made the next run start from an
    // empty state and could recreate catalog work unnecessarily.
    const tempFile = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), {
        encoding: "utf8",
        flush: true,
      });
      fs.renameSync(tempFile, this.file);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
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

async function lookupArtistITunes(artistId) {
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&country=${STOREFRONT}`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`iTunes artist lookup failed: HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).filter(
    (result) => result.wrapperType === "artist",
  );
}

async function lookupAlbumsITunes(artistId) {
  const url = `https://itunes.apple.com/lookup?id=${artistId}&entity=album&country=${STOREFRONT}&limit=200`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).filter((r) => r.wrapperType === "collection");
}

async function lookupTracksITunes(albumId) {
  const url = `https://itunes.apple.com/lookup?id=${albumId}&entity=song&country=${STOREFRONT}&limit=200`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).filter((r) => r.wrapperType === "track");
}

async function fetchAppleMusicArtworkHighRes(artistId) {
  logInfo("Fetching Apple Music page for high-res artwork...");
  try {
    const url = `https://music.apple.com/${STOREFRONT}/artist/_/${artistId}`;
    const res = await fetch(url, {
      headers: APPLE_MUSIC_HEADERS,
    });
    if (!res.ok) return null;
    const rawData = parseAppleMusicServerData(await res.text());
    const headerItem = findAppleMusicArtistHeader(rawData, artistId);
    const artworkDict = headerItem?.artwork?.dictionary;
    const videoArtwork = videoArtworkFromArtistHeader(headerItem);
    if (!artworkDict?.url && !videoArtwork) {
      logWarn(
        `Apple Music returned no artist portrait or motion artwork for ID ${artistId}`,
      );
      return null;
    }
    if (!artworkDict?.url)
      logWarn(`Apple Music returned no artist portrait for ID ${artistId}`);

    const result = {
      url: artworkDict?.url || "",
      bgColor: artworkDict?.bgColor || "",
      textColor1: artworkDict?.textColor1 || "",
      textColor2: artworkDict?.textColor2 || "",
      textColor3: artworkDict?.textColor3 || "",
      textColor4: artworkDict?.textColor4 || "",
      width: artworkDict?.width || 0,
      height: artworkDict?.height || 0,
      videoArtwork,
    };

    if (result.videoArtwork) logOk("Found artist motion artwork");

    return result;
  } catch (err) {
    logWarn(`Could not fetch Apple Music page: ${err.message}`);
    return null;
  }
}

function appleMusicDescriptorId(value) {
  return String(value?.contentDescriptor?.identifiers?.storeAdamID || "");
}

function appleMusicDescriptorMatches(value, resourceId) {
  const descriptorId = appleMusicDescriptorId(value);
  const canonicalId = String(resourceId);
  // Artist radio/header records can prefix the same Apple artist ID (for
  // example `ra.a-1648018194`). Treat it as the same resource only when the
  // object itself carries artwork or motion-artwork metadata.
  return (
    descriptorId === canonicalId || descriptorId.endsWith(`-${canonicalId}`)
  );
}

/**
 * Apple has changed the section identifier for artist pages more than once.
 * The artist ID is stable, so select the resource header by that ID instead
 * of relying on a presentational section name.
 */
function findAppleMusicArtistHeader(value, artistId, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (
    appleMusicDescriptorMatches(value, artistId) &&
    (value.artwork ||
      value.videoArtwork ||
      value.wideVideoArtwork ||
      value.tallVideoArtwork)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findAppleMusicArtistHeader(child, artistId, seen);
    if (found) return found;
  }

  return null;
}

function videoArtworkFromDictionary(dictionary) {
  if (!dictionary || typeof dictionary !== "object") return null;

  for (const motion of Object.values(dictionary)) {
    if (
      !motion ||
      typeof motion !== "object" ||
      typeof motion.video !== "string"
    )
      continue;
    if (motion.video.startsWith("https://")) {
      return {
        hlsUrl: motion.video,
        previewFrame: motion.previewFrame || null,
      };
    }
  }

  return null;
}

/** Artist detail pages use a wide hero. Keep square motion only as a last resort. */
function videoArtworkFromArtistHeader(headerItem) {
  const wide = videoArtworkFromDictionary(
    headerItem?.wideVideoArtwork?.dictionary,
  );
  if (wide) return { ...wide, presentation: "16:9" };

  const square = videoArtworkFromDictionary(
    headerItem?.videoArtwork?.dictionary,
  );
  if (square) return { ...square, presentation: "1:1 fallback" };

  const tall = videoArtworkFromDictionary(
    headerItem?.tallVideoArtwork?.dictionary,
  );
  return tall ? { ...tall, presentation: "tall fallback" } : null;
}

async function discoverArtistMotionArtwork(artists) {
  const profilesById = new Map();
  logInfo(`Checking motion artwork for ${artists.length} artist result(s)...`);

  for (const artist of artists) {
    const profile = await fetchAppleMusicArtworkHighRes(artist.artistId);
    profilesById.set(String(artist.artistId), profile);
    await sleep(150);
  }

  return profilesById;
}

function parseAppleMusicServerData(html) {
  const targetId = "serialized-server-data";
  const startTag = `id="${targetId}"`;
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) return null;

  const tagEndIdx = html.indexOf(">", startIdx);
  const endTagIdx = html.indexOf("</script>", tagEndIdx);
  if (tagEndIdx === -1 || endTagIdx === -1) return null;

  return JSON.parse(html.substring(tagEndIdx + 1, endTagIdx).trim());
}

/**
 * Apple Music keeps motion artwork in the page's serialized data, but the
 * motion key differs by resource type and storefront. Find the first valid
 * videoArtwork dictionary instead of depending on a single layout key.
 */
function findAppleMusicVideoArtwork(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (value.videoArtwork?.dictionary) {
    const found = videoArtworkFromDictionary(value.videoArtwork.dictionary);
    if (found) return found;
  }

  for (const child of Object.values(value)) {
    const found = findAppleMusicVideoArtwork(child, seen);
    if (found) return found;
  }

  return null;
}

function findAppleMusicAlbumHeader(value, albumId, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (
    appleMusicDescriptorId(value) === String(albumId) &&
    value.contentDescriptor?.kind === "album" &&
    Array.isArray(value.subtitleLinks)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findAppleMusicAlbumHeader(child, albumId, seen);
    if (found) return found;
  }

  return null;
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    const normalized = token.toLowerCase();
    if (normalized.startsWith("#x")) {
      return (
        String.fromCodePoint(Number.parseInt(normalized.slice(2), 16)) || entity
      );
    }
    if (normalized.startsWith("#")) {
      return (
        String.fromCodePoint(Number.parseInt(normalized.slice(1), 10)) || entity
      );
    }
    return namedEntities[normalized] || entity;
  });
}

function appleMusicAlbumEditorialDescription(html) {
  const descriptionIndex = html.indexOf('data-testid="description"');
  if (descriptionIndex === -1) return "";
  const startMarker = "<!-- HTML_TAG_START -->";
  const endMarker = "<!-- HTML_TAG_END -->";
  const start = html.indexOf(startMarker, descriptionIndex);
  const end =
    start === -1 ? -1 : html.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) return "";

  return decodeHtmlEntities(
    html.slice(start + startMarker.length, end).replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function collectAppleMusicArtistLinks(value, ids, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);

  for (const links of [
    value.subtitleLinks,
    value.tertiaryTitleLinks,
    value.artistLinks,
  ]) {
    if (!Array.isArray(links)) continue;
    for (const link of links) {
      const artistId =
        link?.segue?.destination?.contentDescriptor?.identifiers?.storeAdamID;
      if (link?.title && artistId && !ids[normalizeMusicText(link.title)]) {
        ids[normalizeMusicText(link.title)] = String(artistId);
      }
    }
  }

  for (const child of Object.values(value)) {
    collectAppleMusicArtistLinks(child, ids, seen);
  }
}

/**
 * Album headers expose the authoritative artist IDs for a release's credits.
 * This avoids globally searching a non-unique display name such as "AMEE".
 */
async function fetchAppleMusicAlbumArtistIds(album) {
  const albumId = album.collectionId;
  if (!albumId) return {};

  try {
    const url = `https://music.apple.com/${STOREFRONT}/album/_/${albumId}`;
    const res = await fetch(url, { headers: APPLE_MUSIC_HEADERS });
    if (!res.ok) return {};

    const rawData = parseAppleMusicServerData(await res.text());
    const header = findAppleMusicAlbumHeader(rawData, albumId);
    const ids = {};
    // Process the album header first, then track credit links. This preserves
    // the release's direct credit if another section repeats the same name.
    collectAppleMusicArtistLinks(header, ids);
    collectAppleMusicArtistLinks(rawData?.data?.[0]?.data?.sections, ids);
    return ids;
  } catch (err) {
    logWarn(
      `Could not resolve artist credits for "${album.collectionName}": ${err.message}`,
    );
    return {};
  }
}

async function fetchAppleMusicAlbumEditorialMetadata(album) {
  const albumName = album.collectionName || album.name || album.collectionId;
  const albumId = album.collectionId;
  if (!albumId) return { videoArtwork: null, description: "" };

  logInfo(
    `Fetching Apple Music editorial metadata for album "${albumName}"...`,
  );
  try {
    const url = `https://music.apple.com/${STOREFRONT}/album/_/${albumId}`;
    const res = await fetch(url, { headers: APPLE_MUSIC_HEADERS });
    if (!res.ok) return { videoArtwork: null, description: "" };

    const pageHtml = await res.text();
    const pageData = parseAppleMusicServerData(pageHtml);
    const videoArtwork = findAppleMusicVideoArtwork(pageData);
    const description = appleMusicAlbumEditorialDescription(pageHtml);
    if (videoArtwork) logOk(`Found motion artwork for album "${albumName}"`);
    if (description)
      logOk(`Found editorial description for album "${albumName}"`);
    return { videoArtwork, description };
  } catch (err) {
    logWarn(
      `Could not fetch editorial metadata for "${albumName}": ${err.message}`,
    );
    return { videoArtwork: null, description: "" };
  }
}

async function discoverAlbumEditorialMetadata(albums) {
  const metadataByAlbumId = new Map();
  logInfo(
    `Checking editorial metadata for ${albums.length} album(s)/single(s)...`,
  );

  for (const album of albums) {
    const metadata = await fetchAppleMusicAlbumEditorialMetadata(album);
    metadataByAlbumId.set(String(album.collectionId), metadata);
    await sleep(150);
  }

  return metadataByAlbumId;
}

function getHighResArtworkUrl(artworkUrlTemplate, size = 1200) {
  if (!artworkUrlTemplate) return null;
  if (artworkUrlTemplate.includes("{w}")) {
    return artworkUrlTemplate
      .replace("{w}", size)
      .replace("{h}", size)
      .replace("{c}", "bb")
      .replace("{f}", "jpg");
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

  const { execSync } = await import("node:child_process");
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
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
  const lines = masterM3u8.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    if (line.includes("I-FRAME")) continue;

    const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
    const codecMatch = line.match(/CODECS="([^"]+)"/);
    const bwMatch = line.match(/BANDWIDTH=(\d+)/);
    const nextLine = (lines[i + 1] || "").trim();
    if (!resMatch || !nextLine.startsWith("http")) continue;

    const codec = codecMatch?.[1] || "";
    const isH264 = codec.startsWith("avc1");

    variants.push({
      width: parseInt(resMatch[1]),
      height: parseInt(resMatch[2]),
      bandwidth: parseInt(bwMatch?.[1] || "0"),
      url: nextLine,
      isH264,
    });
  }

  if (variants.length === 0) {
    logWarn("No video variants found in HLS manifest");
    return false;
  }

  variants.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);

  const target2k = variants.find((v) => v.height >= 1440 && v.height <= 1600);
  const target1080 = variants.find((v) => v.height >= 1080 && v.height < 1440);
  const picked = target2k || target1080 || variants[0];

  logInfo(
    `Selected variant: ${picked.width}x${picked.height} (${picked.isH264 ? "H.264" : "HEVC"}, ~${(picked.bandwidth / 1000000).toFixed(1)} Mbps)`,
  );

  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  logInfo(`Downloading video via ffmpeg...`);
  try {
    execSync(`ffmpeg -y -i "${picked.url}" -c copy "${dest}"`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    const size = fs.statSync(dest).size;
    logOk(
      `${label} video banner downloaded (${(size / 1024 / 1024).toFixed(1)} MB)`,
    );
    return true;
  } catch (err) {
    logWarn(`ffmpeg failed: ${err.message?.split("\n")[0] || err.message}`);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    return false;
  }
}

// ─── NhacCuaTui GraphQL API (WASM-signed) ─────────────

const NCT_API_BASE = "https://graph.nhaccuatui.com";
const NCT_APPID = "6";
const NCT_DEVICE_ID = crypto.randomBytes(8).toString("hex");
const NCT_WASM_URL = "https://static.nct.vn/nct-web/wasm/nctsign.wasm";

let nctWasmInstance = null;

async function initNctWasm() {
  if (nctWasmInstance) return nctWasmInstance;
  const wasmCachePath = path.join(__dirname, ".tmp", "nctsign.wasm");
  let wasmBuf;
  if (fs.existsSync(wasmCachePath)) {
    wasmBuf = fs.readFileSync(wasmCachePath).buffer;
  } else {
    logInfo("Downloading NhacCuaTui WASM signing module...");
    const res = await fetch(NCT_WASM_URL);
    if (!res.ok) throw new Error(`Failed to fetch WASM: ${res.status}`);
    wasmBuf = await res.arrayBuffer();
    const dir = path.dirname(wasmCachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(wasmCachePath, Buffer.from(wasmBuf));
    logOk("WASM module cached locally");
  }
  const stubs = { proc_exit: () => { } };
  const { instance } = await WebAssembly.instantiate(wasmBuf, {
    env: stubs,
    wasi_snapshot_preview1: stubs,
  });
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

  let hdrStr = "";
  for (const [k, v] of Object.entries(headers)) {
    hdrStr += encodeURIComponent(k) + "$" + encodeURIComponent(v) + "$";
  }

  const url = allocStr(fullUrl);
  const bd = allocStr(body);
  const hd = allocStr(hdrStr);
  const out = wasmInst.exports.malloc(1024);

  wasmInst.exports.NctSign_makeUrlSignWithHeader(
    url.ptr,
    url.len,
    bd.ptr,
    bd.len,
    hd.ptr,
    hd.len,
    out,
  );
  const raw = readStr(out, 1024);

  wasmInst.exports.free(out);
  wasmInst.exports.free(url.ptr);
  wasmInst.exports.free(bd.ptr);
  wasmInst.exports.free(hd.ptr);

  return (raw.match(/[0-9a-f]+/) || [""])[0];
}

async function nctApiCall(endpoint, params = {}, body = {}) {
  const wasm = await initNctWasm();
  const timestamp = String(Date.now());

  const allParams = { ...params, timestamp };
  const qs = new URLSearchParams(allParams).toString();
  const fullUrl = `${NCT_API_BASE}${endpoint}${qs ? "?" + qs : ""}`;
  const bodyStr = JSON.stringify(body);

  const headers = {
    "x-nct-token": "",
    "x-nct-deviceid": NCT_DEVICE_ID,
    "x-nct-time": timestamp,
    "x-nct-language": "vi",
    "X-nct-uuid": NCT_DEVICE_ID,
    "X-nct-userid": "0",
    "X-nct-os": "web",
    "x-nct-appid": NCT_APPID,
    "X-nct-version": "1",
    timestamp,
  };

  const xSign = nctComputeSign(wasm, fullUrl, bodyStr, headers);

  const res = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...headers,
      "X-sign": xSign,
    },
    body: bodyStr,
  });

  if (!res.ok) throw new Error(`NCT API ${res.status}`);
  const data = await res.json();
  if (data.code !== 0)
    throw new Error(`NCT API error: ${data.code} ${data.msg}`);
  return data.data;
}

async function searchNhacCuaTui(title, artist) {
  try {
    const keyword = `${title} ${artist}`;
    const data = await nctApiCall(
      "/api/v3/search/all",
      { keyword, correct: "true" },
      { keyword, correct: true, isShowLoading: false },
    );

    const songs = data?.songs;
    if (!songs || songs.length === 0) return null;

    const wantTitle = comparableTitle(title);
    const best = songs.find(
      (song) =>
        comparableTitle(song.name) === wantTitle &&
        artistMatches(artist, song.artistName),
    );

    if (!best) {
      logWarn(
        `No exact NCT match for "${title}" by "${artist}" — skipping instead of importing a different song`,
      );
      return null;
    }

    const streams = best.streamURL || [];
    const quality320 = streams.find(
      (s) => s.type === "320" && !s.onlyVIP && s.status === 1,
    );
    const quality128 = streams.find(
      (s) => s.type === "128" && !s.onlyVIP && s.status === 1,
    );
    const bestStream = quality320 || quality128;

    if (!bestStream) return null;

    return bestStream.download || bestStream.stream;
  } catch (err) {
    logWarn(`NhacCuaTui search failed for "${title}": ${err.message}`);
    return null;
  }
}

// ─── Zing MP3 API (HMAC-signed) ───────────────────────

const ZING_URL = "https://zingmp3.vn";
const ZING_API_KEY = "X5BM3w8N7MKozC0B85o4KMlzLZKhV00y";
const ZING_SECRET = "acOrvUS15XRW2o9JksiK1KgQ6Vbds8ZW";
const ZING_VERSION = "1.6.42";

let zingCookie;

async function getZingCookie() {
  if (zingCookie !== undefined) return zingCookie;
  zingCookie = "";
  try {
    const res = await fetch(`${ZING_URL}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) {
      zingCookie = setCookie.map((ck) => ck.split(";")[0]).join("; ");
    }
  } catch {
    /* cookie tùy chọn — nhiều endpoint vẫn chạy không cần */
  }
  return zingCookie;
}

function zingHash256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}
function zingHmac512(str) {
  return crypto.createHmac("sha512", ZING_SECRET).update(str).digest("hex");
}

/**
 * Ký request theo thuật toán zingmp3.vn:
 *   sig = HMAC512( path + SHA256( "k1=v1k2=v2..." các sigParams đã sort ) )
 * apiKey và sig KHÔNG tham gia ký.
 */
function zingSign(path, sigParams) {
  const hashData = Object.keys(sigParams)
    .sort()
    .map((k) => `${k}=${sigParams[k]}`)
    .join("");
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
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Cookie: cookie,
    },
  });
  if (!res.ok) throw new Error(`Zing API ${res.status}`);
  const data = await res.json();
  if (data.err !== 0)
    throw new Error(`Zing API err ${data.err}: ${data.msg || ""}`);
  return data.data;
}

async function searchZingMp3(title, artist) {
  try {
    const ctime = String(Math.floor(Date.now() / 1000));
    const keyword = `${title} ${artist}`;
    const searchData = await zingApiCall(
      "/api/v2/search",
      { ctime, version: ZING_VERSION },
      { q: keyword },
    );

    // /api/v2/search trả kết quả trộn (bài hát, nghệ sĩ, playlist...) trong `items`.
    const items = (searchData?.items || []).filter(
      (it) => it?.encodeId && it?.title,
    );
    if (!items.length) return null;

    const normalizedTitle = comparableTitle(title);
    const best = items.find(
      (s) =>
        s.streamingStatus === 1 &&
        comparableTitle(s.title) === normalizedTitle &&
        artistMatches(artist, s.artistsNames),
    );

    if (!best) {
      logWarn(
        `No exact Zing match for "${title}" by "${artist}" — skipping instead of importing a different song`,
      );
      return null;
    }

    const streamCtime = String(Math.floor(Date.now() / 1000));
    const streaming = await zingApiCall("/api/v2/song/get/streaming", {
      ctime: streamCtime,
      id: best.encodeId,
      version: ZING_VERSION,
    });

    // 320 thường trả 'VIP' (cần đăng nhập) → fallback 128 (URL trực tiếp).
    const isUrl = (v) => typeof v === "string" && v.startsWith("http");
    const url320 = isUrl(streaming?.["320"]) ? streaming["320"] : null;
    const url128 = isUrl(streaming?.["128"]) ? streaming["128"] : null;
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
  const { execSync } = await import("node:child_process");

  const candidates = ["yt-dlp", "yt-dlp.exe"];
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (home) {
    candidates.push(
      path.join(
        home,
        "AppData",
        "Local",
        "Programs",
        "Python",
        "Python310",
        "Scripts",
        "yt-dlp.exe",
      ),
      path.join(
        home,
        "AppData",
        "Local",
        "Programs",
        "Python",
        "Python311",
        "Scripts",
        "yt-dlp.exe",
      ),
      path.join(
        home,
        "AppData",
        "Local",
        "Programs",
        "Python",
        "Python312",
        "Scripts",
        "yt-dlp.exe",
      ),
    );
  }

  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, {
        stdio: "ignore",
        timeout: 15_000,
      });
      ytDlpBinaryCache = candidate;
      return candidate;
    } catch {
      /* try next */
    }
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
async function downloadViaYtDlp(
  searchPrefix,
  sourceName,
  sourceKey,
  title,
  artist,
  dest,
  expectedMillis,
  label,
) {
  const bin = await resolveYtDlpBinary();
  if (!bin) {
    logWarn(`[${label}] yt-dlp không tìm thấy — bỏ qua fallback ${sourceName}`);
    return null;
  }

  const { execFileSync } = await import("node:child_process");
  const outDest = dest.replace(/\.mp3$/, ".m4a");
  const dir = path.dirname(outDest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Giới hạn thời lượng để loại video ghép 1 tiếng / bản mix. Cho phép lệch rộng
  // hơn tolerance chính một chút.
  const query = `${title} ${artist}`;
  // Nguồn dạng URL (YouTube Music) cần encode query; nguồn dạng prefix
  // (ytsearch:/scsearch:) nhận query thô.
  const searchArg = searchPrefix.startsWith("http")
    ? `${searchPrefix}${encodeURIComponent(query)}`
    : `${searchPrefix}${query}`;
  const maxDur = expectedMillis ? Math.round(expectedMillis / 1000) + 60 : 900;
  const minDur = expectedMillis
    ? Math.max(30, Math.round(expectedMillis / 1000) - 60)
    : 45;

  logInfo(`[${label}] Đang thử ${sourceName} cho "${title}"...`);
  try {
    execFileSync(
      bin.replace(/^"|"$/g, ""),
      [
        searchArg,
        "--no-playlist",
        "--extract-audio",
        "--audio-format",
        "m4a",
        "--audio-quality",
        "0",
        "--match-filter",
        `duration > ${minDur} & duration < ${maxDur}`,
        "--playlist-items",
        "1",
        "--no-warnings",
        "-o",
        outDest,
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: 180_000 },
    );
  } catch (err) {
    logWarn(
      `[${label}] yt-dlp (${sourceName}) lỗi: ${(err.stderr?.toString() || err.message || "").split("\n")[0]}`,
    );
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
  logOk(
    `[${label}] "${title}" tải từ ${sourceName} (${(size / 1024 / 1024).toFixed(1)} MB)`,
  );
  return { path: outDest, source: sourceKey };
}

function downloadFromYouTubeMusic(title, artist, dest, expectedMillis, label) {
  return downloadViaYtDlp(
    "https://music.youtube.com/search?q=",
    "YouTube Music",
    "youtube_music",
    title,
    artist,
    dest,
    expectedMillis,
    label,
  );
}

function downloadFromYouTube(title, artist, dest, expectedMillis, label) {
  return downloadViaYtDlp(
    "ytsearch5:",
    "YouTube",
    "youtube",
    title,
    artist,
    dest,
    expectedMillis,
    label,
  );
}

function downloadFromSoundCloud(title, artist, dest, expectedMillis, label) {
  return downloadViaYtDlp(
    "scsearch5:",
    "SoundCloud",
    "soundcloud",
    title,
    artist,
    dest,
    expectedMillis,
    label,
  );
}

async function downloadSongAudio(track, artist, audioDir, index) {
  // Use per-album trackNumber (stable across runs) instead of global counter for filename
  const trackNum = track.trackNumber || index + 1;
  const paddedTrack = String(trackNum).padStart(2, "0");
  const safeTitle = slugify(
    track.trackName || track.title || `track-${trackNum}`,
  );
  const filename = `${paddedTrack}-${safeTitle}-${track.trackId || trackNum}.mp3`;
  const dest = path.join(audioDir, filename);
  const label = String(index + 1).padStart(2, "0");
  const songTitle = track.trackName || track.title;
  const expectedMillis = track.trackTimeMillis || 0;

  // Chỉ nhận cache MP3 do hai nguồn hiện tại tạo ra. Cache M4A từ các phiên
  // bản tool cũ bị cố ý bỏ qua, nên không thể bị upload lại theo đường cache.
  for (const cached of [dest]) {
    if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
      const check = await verifyAudioDuration(cached, expectedMillis);
      if (check.ok) {
        logOk(`[${label}] "${songTitle}" already downloaded`);
        return { path: cached, source: "cached" };
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
      logInfo(
        `[${label}] Retry ${attempt} with normalized title: "${searchTitle}"`,
      );
    }

    // NCT/Zing chỉ trả kết quả khi tựa, nghệ sĩ chính và thời lượng đều đạt.
    // Đây là hàng rào cuối cùng chống nhập nhầm bản thu có tên tương tự.
    logInfo(
      `[${label}] [${attempt}] Searching NhacCuaTui for "${searchTitle}"...`,
    );
    const streamUrl = await searchNhacCuaTui(searchTitle, artist);
    if (streamUrl) {
      try {
        const size = await download(streamUrl, dest);
        const check = await verifyAudioDuration(dest, expectedMillis);
        if (check.ok) {
          logOk(
            `[${label}] "${songTitle}" từ NhacCuaTui (${(size / 1024 / 1024).toFixed(1)} MB)`,
          );
          return { path: dest, source: "nhaccuatui" };
        }
        logWarn(
          `[${label}] NCT: duration mismatch (${check.actualSec?.toFixed(0)}s vs ${check.expectedSec?.toFixed(0)}s)`,
        );
        fs.unlinkSync(dest);
      } catch (err) {
        logWarn(`[${label}] NhacCuaTui download failed: ${err.message}`);
      }
    }

    logInfo(
      `[${label}] [${attempt}] Searching Zing MP3 for "${searchTitle}"...`,
    );
    const zingUrl = await searchZingMp3(searchTitle, artist);
    if (zingUrl) {
      try {
        const size = await download(zingUrl, dest);
        const check = await verifyAudioDuration(dest, expectedMillis);
        if (check.ok) {
          logOk(
            `[${label}] "${songTitle}" từ Zing MP3 (${(size / 1024 / 1024).toFixed(1)} MB)`,
          );
          return { path: dest, source: "zingmp3" };
        }
        logWarn(
          `[${label}] Zing: duration mismatch (${check.actualSec?.toFixed(0)}s vs ${check.expectedSec?.toFixed(0)}s)`,
        );
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
    const ytm = await downloadFromYouTubeMusic(
      songTitle,
      artist,
      dest,
      expectedMillis,
      label,
    );
    if (ytm) return ytm;

    const yt = await downloadFromYouTube(
      songTitle,
      artist,
      dest,
      expectedMillis,
      label,
    );
    if (yt) return yt;
  }

  if (!NO_SOUNDCLOUD) {
    const sc = await downloadFromSoundCloud(
      songTitle,
      artist,
      dest,
      expectedMillis,
      label,
    );
    if (sc) return sc;
  }

  logErr(`[${label}] "${songTitle}" — NO AUDIO AVAILABLE, skipping`);
  return null;
}

// ════════════════════════════════════════════════════════
// PHASE 3: Upload Artworks (local API)
// ════════════════════════════════════════════════════════

async function waitForAssetReady(assetId, label) {
  logInfo(`Waiting for ${label} to become READY...`);
  const startedAt = Date.now();
  const deadline = startedAt + ASSET_READY_WAIT_TIMEOUT_MS;
  let nextProgressLogAt = startedAt + 15_000;
  let nextTransientErrorLogAt = startedAt;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    await sleep(Math.min(ASSET_READY_WAIT_POLL_MS, remainingMs));
    try {
      const assetRes = await apiCall("GET", `/admin/assets/${assetId}`);
      const status = assetRes.asset?.status || assetRes.status;
      if (status === "READY" || status === 3) {
        logOk(`${label} READY, assetId: ${assetId}`);
        return;
      }
      if (status === "FAILED" || status === 4) {
        const reason =
          assetRes.asset?.errorMessage ||
          assetRes.errorMessage ||
          "unknown processing error";
        throw new Error(`${label} processing failed (${assetId}): ${reason}`);
      }
    } catch (error) {
      const message = errorMessage(error);
      if (
        message.includes("processing failed") ||
        /^API 4\d\d:/.test(message)
      ) {
        throw error;
      }

      const now = Date.now();
      if (now >= nextTransientErrorLogAt) {
        logWarn(`Could not read ${label} status; retrying: ${message}`);
        nextTransientErrorLogAt = now + 30_000;
      }
    }

    const now = Date.now();
    if (now >= nextProgressLogAt) {
      const elapsedSec = Math.floor((now - startedAt) / 1000);
      logInfo(`${label} still processing... (${elapsedSec}s)`);
      nextProgressLogAt = now + 15_000;
    }
  }

  throw new Error(
    `${label} did not become READY within ${Math.round(ASSET_READY_WAIT_TIMEOUT_MS / 60_000)} min`,
  );
}

async function uploadArtworkAsset(filePath, label) {
  const filename = path.basename(filePath);
  const contentType = requireSupportedArtwork(filePath, label);

  const checksum = await sha256File(filePath);
  const sizeBytes = fs.statSync(filePath).size;

  logInfo(
    `Uploading ${label} artwork (${(sizeBytes / 1024).toFixed(0)} KB)...`,
  );

  const uploadRes = await apiCall("POST", "/admin/assets/uploads", {
    kind: "IMAGE",
    purpose: "ARTWORK",
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

  await apiCall("POST", `/admin/assets/${assetId}/finalize`);
  logInfo(`${label} artwork finalize triggered`);
  await waitForAssetReady(assetId, `${label} artwork`);
  return assetId;
}

async function uploadVideoAsset(filePath, label) {
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    {
      ".mp4": "video/mp4",
      ".mkv": "video/x-matroska",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".ts": "video/mp2t",
    }[ext] || "video/mp4";

  const checksum = await sha256File(filePath);
  const sizeBytes = fs.statSync(filePath).size;

  logInfo(
    `Uploading ${label} video (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)...`,
  );

  const uploadRes = await apiCall("POST", "/admin/assets/uploads", {
    kind: "VIDEO",
    purpose: "EDITORIAL_VIDEO",
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

  await apiCall("POST", `/admin/assets/${assetId}/finalize`);
  logInfo(`${label} video finalize triggered`);
  await waitForAssetReady(assetId, `${label} video`);
  return assetId;
}

// ════════════════════════════════════════════════════════
// PHASE 4: Create Artist + Upload Songs
// ════════════════════════════════════════════════════════

async function createAndPublishArtist({
  name,
  genreNames,
  artworkAssetId,
  editorialVideoAssetId,
}) {
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

  const draftRes = await apiCall(
    "POST",
    "/admin/catalog/artists/draft",
    draftBody,
  );

  const draftId = draftRes.draftId || draftRes.id;
  const artistId = draftRes.resourceId;

  logOk(`Artist draft created — draftId: ${draftId}, resourceId: ${artistId}`);

  await apiCall("POST", "/admin/catalog/drafts/" + draftId + "/submit");
  logInfo("Publishing artist draft...");
  await apiCall("POST", `/admin/catalog/drafts/${draftId}/publish`);
  logOk(`Artist "${name}" published — artistId: ${artistId}`);

  return artistId;
}

async function catalogArtistResource(artistId) {
  const response = await apiCall(
    "GET",
    `/catalog/${STOREFRONT}/artists/${artistId}`,
  );
  const artists =
    response?.resources?.artists || response?.data?.resources?.artists || {};
  const artist =
    artists[artistId] ||
    Object.values(artists).find((entry) => entry?.id === artistId);
  if (!artist) throw new Error(`Catalog artist not found: ${artistId}`);
  return artist;
}

async function assertArtistMetadataUpdateAllowed(artistId) {
  const response = await apiCall(
    "GET",
    `/admin/catalog/drafts?storefront=${STOREFRONT}&resourceType=artists&resourceId=${encodeURIComponent(artistId)}&status=SUBMITTED&limit=1`,
  );
  const drafts = response?.drafts || response?.data?.drafts || [];
  const submittedDraft = drafts.find((draft) =>
    ["3", "SUBMITTED", "CATALOG_DRAFT_STATUS_SUBMITTED"].includes(
      String(draft?.status),
    ),
  );
  if (submittedDraft?.id) {
    throw new Error(
      `Artist ${artistId} has draft ${submittedDraft.id} awaiting review. Publish, request changes, or delete that draft before refreshing metadata.`,
    );
  }
}

async function updateAndPublishArtistMetadata({
  catalogArtistId,
  selectedArtist,
  artworkAssetId,
  editorialVideoAssetId,
}) {
  const existingArtist = await catalogArtistResource(catalogArtistId);
  const attributes = existingArtist.attributes || existingArtist;
  const genreNames = selectedArtist.primaryGenreName
    ? [selectedArtist.primaryGenreName]
    : attributes.genreNames || [];
  // iTunes search can expose a Romanized name while the artist lookup for the
  // same Apple ID returns the official Han-script name. Keep the catalog's
  // existing editorial fields, but replace that transliterated display name.
  const replaceRomanizedName =
    hasHanCharacters(selectedArtist.artistName) &&
    !hasHanCharacters(attributes.name);
  const draft = await apiCall("POST", "/admin/catalog/artists/draft", {
    resourceId: catalogArtistId,
    storefront: STOREFRONT,
    // Preserve the catalog-owned fields this import does not author.
    name: replaceRomanizedName
      ? selectedArtist.artistName
      : attributes.name || selectedArtist.artistName,
    url: replaceRomanizedName
      ? slugify(selectedArtist.artistName)
      : attributes.url || slugify(selectedArtist.artistName),
    genreNames,
    artworkAssetId,
    editorialVideoAssetId:
      editorialVideoAssetId || attributes.editorialVideoAssetId || "",
    origin: attributes.origin || "",
    birthDate: attributes.birthDate || "",
    biography: attributes.biography || "",
    biographySourceUrl: attributes.biographySourceUrl || "",
  });
  const draftId = draft.draftId || draft.id;
  if (!draftId)
    throw new Error(
      `Artist metadata draft was not created for ${catalogArtistId}`,
    );

  await apiCall("POST", `/admin/catalog/drafts/${draftId}/submit`);
  await apiCall("POST", `/admin/catalog/drafts/${draftId}/publish`);
  logOk(`Artist metadata updated — artistId: ${catalogArtistId}`);
}

async function refreshExistingArtistMetadata({
  catalogArtistId,
  selectedArtist,
  appleMusicProfile,
  state,
  tmpDir,
}) {
  if (!catalogArtistId)
    throw new Error("--catalog-artist-id is required with --metadata-only");
  await assertArtistMetadataUpdateAllowed(catalogArtistId);

  const artworkPath = path.join(tmpDir, "artist-metadata-artwork.jpg");
  const artworkUrl = await downloadArtistArtwork(
    resolveArtistArtworkUrls(appleMusicProfile, selectedArtist.artworkUrl100),
    artworkPath,
    "Artist metadata",
    true,
  );
  let artworkAssetId;
  if (artworkUrl) {
    artworkAssetId = await uploadArtworkAsset(artworkPath, "Artist metadata");
  } else {
    if (!fs.existsSync(FALLBACK_ARTIST_ARTWORK_PATH)) {
      throw new Error(
        `Default artist avatar is missing: ${FALLBACK_ARTIST_ARTWORK_PATH}`,
      );
    }
    artworkAssetId = await uploadArtworkAsset(
      FALLBACK_ARTIST_ARTWORK_PATH,
      "Default artist avatar",
    );
    logWarn(
      `No Apple Music or iTunes portrait for "${selectedArtist.artistName}"; applied the default artist avatar`,
    );
  }

  let editorialVideoAssetId = "";
  if (appleMusicProfile?.videoArtwork?.hlsUrl) {
    const videoPath = path.join(tmpDir, "artist-metadata-video-banner.mp4");
    try {
      if (
        await downloadVideoBanner(
          appleMusicProfile.videoArtwork.hlsUrl,
          videoPath,
          "Artist metadata",
        )
      ) {
        editorialVideoAssetId = await uploadVideoAsset(
          videoPath,
          "Artist metadata banner",
        );
      }
    } catch (error) {
      logWarn(`Could not refresh artist motion artwork: ${error.message}`);
    }
  }

  await updateAndPublishArtistMetadata({
    catalogArtistId,
    selectedArtist,
    artworkAssetId,
    editorialVideoAssetId,
  });
  state.set("artistArtworkAssetId", artworkAssetId);
  state.set("artistArtworkSource", artworkUrl ? "apple-or-itunes" : "fallback");
  if (editorialVideoAssetId)
    state.set("artistVideoAssetId", editorialVideoAssetId);
}

async function findCatalogArtistByExactName(name) {
  const response = await apiCall(
    "GET",
    `/catalog/${STOREFRONT}/search?q=${encodeURIComponent(name)}&types=artists&limit=20`,
  );
  const artists =
    response?.resources?.artists || response?.data?.resources?.artists || {};
  const wanted = normalizeMusicText(name);
  const entry = Object.values(artists).find(
    (artist) =>
      normalizeMusicText(artist?.attributes?.name || artist?.name) === wanted,
  );
  return entry?.id || null;
}

async function findExactITunesArtist(name) {
  const wanted = normalizeMusicText(name);
  const candidates = await searchArtistITunes(name);
  return (
    candidates.find(
      (candidate) => normalizeMusicText(candidate.artistName) === wanted,
    ) || null
  );
}

function resolveArtistArtworkUrls(appleMusicProfile, iTunesArtworkUrl) {
  return [
    ...new Set(
      [
        appleMusicProfile?.url
          ? getHighResArtworkUrl(appleMusicProfile.url)
          : null,
        getITunesArtworkHighRes(iTunesArtworkUrl),
      ].filter(Boolean),
    ),
  ];
}

async function downloadArtistArtwork(
  artworkUrls,
  destination,
  label,
  force = false,
) {
  for (const artworkUrl of artworkUrls) {
    try {
      if (force && fs.existsSync(destination)) fs.unlinkSync(destination);
      await downloadArtwork(artworkUrl, destination, label);
      return artworkUrl;
    } catch (error) {
      logWarn(`Could not import ${label} portrait: ${error.message}`);
    }
  }
  return null;
}

async function buildAppleArtistIdsByName(albumsWithTracks, state) {
  const idsByAlbum = state.get("appleArtistIdsByAlbum") || {};
  const idsByName = {};

  for (const { album } of albumsWithTracks) {
    const albumId = String(album.collectionId);
    if (!Object.hasOwn(idsByAlbum, albumId)) {
      logInfo(
        `Resolving Apple Music artist credits for "${album.collectionName}"...`,
      );
      idsByAlbum[albumId] = await fetchAppleMusicAlbumArtistIds(album);
      state.set("appleArtistIdsByAlbum", idsByAlbum);
    }

    for (const [name, artistId] of Object.entries(idsByAlbum[albumId] || {})) {
      if (!idsByName[name]) idsByName[name] = artistId;
    }
  }

  return idsByName;
}

async function collaboratorProfileSeedData(
  name,
  sourceArtistId,
  fallbackArtistArtworkAssetId,
  state,
  tmpDir,
) {
  const iTunesArtist = await findExactITunesArtist(name);
  const artistId = sourceArtistId || iTunesArtist?.artistId;
  const genreName = iTunesArtist?.primaryGenreName || "Music";
  if (!artistId) {
    logWarn(
      `No verified Apple Music artist ID for "${name}"; portrait can only come from an exact iTunes match`,
    );
  }

  const artworkAssetIds = state.get("collaboratorArtworkAssetIds") || {};
  const artworkSources = state.get("collaboratorArtworkSources") || {};
  const videoAssetIds = state.get("collaboratorVideoAssetIds") || {};
  const key = normalizeMusicText(name);
  let artworkAssetId = artworkAssetIds[key];
  if (!artworkSources[key]) {
    // Do not keep a legacy collaborator avatar whose source could have been a
    // release cover or a third-party provider.
    artworkAssetId = "";
  }
  let editorialVideoAssetId = videoAssetIds[key];
  const appleMusicProfile = artistId
    ? await fetchAppleMusicArtworkHighRes(artistId)
    : null;

  if (!artworkAssetId) {
    const artworkUrls = resolveArtistArtworkUrls(
      appleMusicProfile,
      iTunesArtist?.artworkUrl100,
    );
    if (artworkUrls.length) {
      const artworkPath = path.join(
        tmpDir,
        "collaborator-artwork",
        `${slugify(name) || artistId || "artist"}.jpg`,
      );
      const artworkUrl = await downloadArtistArtwork(
        artworkUrls,
        artworkPath,
        `Collaborator "${name}"`,
      );
      if (artworkUrl) {
        artworkAssetId = await uploadArtworkAsset(
          artworkPath,
          `Collaborator "${name}"`,
        );
        artworkAssetIds[key] = artworkAssetId;
        artworkSources[key] = "apple-or-itunes";
        state.set("collaboratorArtworkAssetIds", artworkAssetIds);
        state.set("collaboratorArtworkSources", artworkSources);
      }
    }
  }

  if (!artworkAssetId) {
    logWarn(
      `No Apple Music or iTunes portrait for collaborator "${name}"; using the default artist avatar`,
    );
    artworkAssetId = fallbackArtistArtworkAssetId;
    artworkAssetIds[key] = artworkAssetId;
    artworkSources[key] = "fallback";
    state.set("collaboratorArtworkAssetIds", artworkAssetIds);
    state.set("collaboratorArtworkSources", artworkSources);
  }

  if (!editorialVideoAssetId && appleMusicProfile?.videoArtwork?.hlsUrl) {
    const videoPath = path.join(
      tmpDir,
      "collaborator-video",
      `${slugify(name) || artistId || "artist"}.mp4`,
    );
    try {
      const downloaded = await downloadVideoBanner(
        appleMusicProfile.videoArtwork.hlsUrl,
        videoPath,
        `Collaborator "${name}"`,
      );
      if (downloaded) {
        editorialVideoAssetId = await uploadVideoAsset(
          videoPath,
          `Collaborator "${name}" banner`,
        );
        videoAssetIds[key] = editorialVideoAssetId;
        state.set("collaboratorVideoAssetIds", videoAssetIds);
      }
    } catch (err) {
      logWarn(
        `Could not import video for collaborator "${name}": ${err.message}`,
      );
    }
  }

  return {
    genreNames: [genreName],
    artworkAssetId,
    editorialVideoAssetId,
  };
}

async function ensureCollaboratorArtists(
  albumsWithTracks,
  selectedArtist,
  selectedArtistAliases,
  primaryArtistId,
  fallbackArtistArtworkAssetId,
  state,
  tmpDir,
) {
  const idsByName = state.get("collaboratorArtistIds") || {};
  const collaborators = new Map();
  const appleArtistIdsByName = await buildAppleArtistIdsByName(
    albumsWithTracks,
    state,
  );

  for (const { album, tracks } of albumsWithTracks) {
    for (const name of creditedArtistNames(
      album.artistName || album.collectionArtistName,
    )) {
      if (isSelectedArtistName(name, selectedArtist, selectedArtistAliases)) continue;
      const key = normalizeMusicText(name);
      if (!collaborators.has(key)) collaborators.set(key, { name });
    }
    for (const track of tracks) {
      for (const name of songArtistNames(track, album)) {
        if (isSelectedArtistName(name, selectedArtist, selectedArtistAliases)) continue;
        const key = normalizeMusicText(name);
        if (!collaborators.has(key)) collaborators.set(key, { name });
      }
    }
  }

  for (const [key, collaborator] of collaborators) {
    const { name } = collaborator;
    if (idsByName[key]) continue;

    const existingId = await findCatalogArtistByExactName(name);
    if (existingId) {
      idsByName[key] = existingId;
      logOk(`Reusing collaborator artist "${name}" — artistId: ${existingId}`);
    } else {
      const profile = await collaboratorProfileSeedData(
        name,
        appleArtistIdsByName[key],
        fallbackArtistArtworkAssetId,
        state,
        tmpDir,
      );
      idsByName[key] = await createAndPublishArtist({ name, ...profile });
      logOk(`Created collaborator artist "${name}"`);
    }
    state.set("collaboratorArtistIds", idsByName);
  }

  return {
    ...idsByName,
    ...Object.fromEntries(
      [...selectedArtistAliases].map((alias) => [alias, primaryArtistId]),
    ),
  };
}

async function ensureAppleMusicCreditArtist(
  name,
  fallbackArtistArtworkAssetId,
  state,
  tmpDir,
  collaboratorArtistIds,
) {
  const key = normalizeMusicText(name);
  if (!key) return null;
  if (collaboratorArtistIds[key]) return collaboratorArtistIds[key];

  const lookupState = state.get("creditArtistLookups") || {};
  if (Object.hasOwn(lookupState, key) && !lookupState[key]) return null;

  const iTunesArtist = await findExactITunesArtist(name);
  lookupState[key] = iTunesArtist?.artistId
    ? String(iTunesArtist.artistId)
    : "";
  state.set("creditArtistLookups", lookupState);
  if (!iTunesArtist?.artistId) {
    logInfo(
      `Credit "${name}" has no exact Apple Music artist; keeping text credit`,
    );
    return null;
  }

  const existingId = await findCatalogArtistByExactName(name);
  if (existingId) {
    collaboratorArtistIds[key] = existingId;
    state.set("collaboratorArtistIds", collaboratorArtistIds);
    logOk(`Reusing credit artist "${name}" — artistId: ${existingId}`);
    return existingId;
  }

  const profile = await collaboratorProfileSeedData(
    name,
    String(iTunesArtist.artistId),
    fallbackArtistArtworkAssetId,
    state,
    tmpDir,
  );
  const artistId = await createAndPublishArtist({ name, ...profile });
  collaboratorArtistIds[key] = artistId;
  state.set("collaboratorArtistIds", collaboratorArtistIds);
  logOk(`Created credit artist "${name}" — artistId: ${artistId}`);
  return artistId;
}

function sortSongOccurrencesByCreditCompleteness(occurrences) {
  return [...occurrences].sort(
    (left, right) =>
      trackCreditNames(right.track).length -
      trackCreditNames(left.track).length,
  );
}

function songArtistIds(
  occurrences,
  selectedArtist,
  selectedArtistAliases,
  primaryArtistId,
  collaboratorArtistIds,
) {
  const ids = [];
  for (const { album, track } of sortSongOccurrencesByCreditCompleteness(
    occurrences,
  )) {
    for (const name of songArtistNames(track, album)) {
      const id = isSelectedArtistName(name, selectedArtist, selectedArtistAliases)
        ? primaryArtistId
        : collaboratorArtistIds[normalizeMusicText(name)];
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  // Some album tracks omit their display credit. Across all occurrences of
  // the same recording, retain every verified billed or title-featured artist.
  return ids.length ? ids : [primaryArtistId];
}

function songPrimaryArtistIds(
  occurrences,
  selectedArtist,
  selectedArtistAliases,
  primaryArtistId,
  collaboratorArtistIds,
) {
  const ids = [];
  const featuredNames = new Set(
    occurrences.flatMap(({ album, track }) =>
      trackFeaturedArtistNames(track, album).map(normalizeMusicText),
    ),
  );
  for (const { track } of sortSongOccurrencesByCreditCompleteness(
    occurrences,
  )) {
    for (const name of trackCreditNames(track)) {
      if (featuredNames.has(normalizeMusicText(name))) continue;
      const id = isSelectedArtistName(name, selectedArtist, selectedArtistAliases)
        ? primaryArtistId
        : collaboratorArtistIds[normalizeMusicText(name)];
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids.length ? ids : [primaryArtistId];
}

function albumArtistIds(
  album,
  selectedArtist,
  selectedArtistAliases,
  primaryArtistId,
  collaboratorArtistIds,
) {
  const ids = [primaryArtistId];
  for (const name of creditedArtistNames(
    album.artistName || album.collectionArtistName,
  )) {
    if (isSelectedArtistName(name, selectedArtist, selectedArtistAliases)) continue;
    const id = collaboratorArtistIds[normalizeMusicText(name)];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function createSeedArtistOwner(name, slug, state) {
  const existingUserId = state.get("artistOwnerUserId");
  if (existingUserId) return existingUserId;

  // Identity usernames allow only letters, numbers, and underscores. Keep a
  // deterministic suffix so artists whose slugs normalize similarly never
  // collide, while making retries use the same account.
  const safeSlug = slug
    .replace(/-/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const usernameSuffix = crypto
    .createHash("sha256")
    .update(slug)
    .digest("hex")
    .slice(0, 8);
  const username = (
    (safeSlug || "artist").slice(0, 41) +
    "_" +
    usernameSuffix
  ).slice(0, 50);
  const email = slug.replace(/-/g, "") + "@artist.404hz.local";
  logInfo("Creating Artist Owner account " + email + "...");
  const signup = responseData(
    await apiCall("POST", "/artist/auth/signup", {
      username,
      email,
      password: SEED_ARTIST_PASSWORD,
      displayName: name,
    }),
  );
  const userId = signup.userId;
  if (!userId) throw new Error("Artist signup did not return userId");

  await apiCall("PATCH", "/auth/admin/users/" + userId + "/role", {
    role: "ARTIST",
  });
  state.set("artistOwnerUserId", userId);
  state.set("artistOwnerEmail", email);
  logOk("Artist Owner approved — userId: " + userId);
  return userId;
}

async function loginSeedArtistOwner(email, state) {
  let deviceId = state.get("artistOwnerDeviceId");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    state.set("artistOwnerDeviceId", deviceId);
  }
  const login = responseData(
    await apiCall("POST", "/artist/auth/login", {
      identifier: email,
      password: SEED_ARTIST_PASSWORD,
      deviceId,
    }),
  );
  if (login.twoFactorRequired || !login.accessToken) {
    throw new Error(
      "Seed Artist Owner login requires unsupported 2FA or returned no token",
    );
  }
  SEED_ARTIST_ACCESS_TOKEN = login.accessToken;
  SEED_ARTIST_OWNER_EMAIL = email;
  SEED_ARTIST_OWNER_STATE = state;
}

async function findSongByChecksum(checksum) {
  const response = responseData(await apiCall(
    "GET",
    `/songs/internal/by-checksum?checksum=${encodeURIComponent(checksum)}`,
    undefined,
    {
      "x-internal-token": FINALIZER_INTERNAL_TOKEN,
      Authorization: undefined,
    },
  ));
  return response?.found && typeof response.songId === "string"
    ? response.songId
    : null;
}

async function waitForSongReady(songId, title) {
  logInfo(`Waiting for song "${title}" to become READY...`);
  const startedAt = Date.now();
  const deadline = startedAt + READY_WAIT_TIMEOUT_MS;
  let nextProgressLogAt = startedAt + 15_000;
  let nextTransientErrorLogAt = startedAt;

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    await sleep(Math.min(READY_WAIT_POLL_MS, remainingMs));
    try {
      const songRes = await apiCall("GET", `/songs/${songId}`);
      const status = songRes.status || songRes.song?.status;
      if (status === "READY" || status === 3) {
        logOk(`Song "${title}" READY — songId: ${songId}`);
        return;
      }
      if (status === "FAILED" || status === 4) {
        throw new Error(`Song processing failed for "${title}"`);
      }
    } catch (error) {
      const message = errorMessage(error);
      // An authentication, validation, or visibility error will never become
      // healthy by polling again. Surface it immediately instead of masking a
      // bad finalizer token as a generic timeout.
      if (
        message.includes("processing failed") ||
        /^API 4\d\d:/.test(message)
      ) {
        throw error;
      }

      const now = Date.now();
      if (now >= nextTransientErrorLogAt) {
        logWarn(
          `Could not read processing status for "${title}"; retrying: ${message}`,
        );
        nextTransientErrorLogAt = now + 30_000;
      }
    }

    const now = Date.now();
    if (now >= nextProgressLogAt) {
      const elapsedSec = Math.floor((now - startedAt) / 1000);
      logInfo(`Still processing "${title}"... (${elapsedSec}s)`);
      nextProgressLogAt = now + 15_000;
    }
  }

  throw new Error(
    `Song "${title}" did not become READY within ${Math.round(READY_WAIT_TIMEOUT_MS / 60_000)} min`,
  );
}

async function uploadSongThroughPipeline(audioFile, title, artistId) {
  const checksum = await sha256File(audioFile.path);
  const size = fs.statSync(audioFile.path).size;

  logInfo(
    `Uploading song "${title}" (${(size / 1024 / 1024).toFixed(1)} MB)...`,
  );

  let uploadRes;
  try {
    uploadRes = await requestSongUpload({
      title,
      artistId,
      checksum,
      size,
      audioMode: AUDIO_MODE,
    });
  } catch (err) {
    if (
      err.message.includes("SONG_ALREADY_IN_LIBRARY") ||
      err.message.includes("409")
    ) {
      logWarn(
        `Song "${title}" already in library, looking up its checksum...`,
      );
      const existingId = await findSongByChecksum(checksum);
      if (existingId) {
        logOk(`Found existing song "${title}" — songId: ${existingId}`);
        await waitForSongReady(existingId, title);
        return existingId;
      }
      throw new Error(
        `Song "${title}" already in library but could not find songId — clear state or check manually`,
      );
    }
    throw err;
  }

  const songId = uploadRes.songId;
  const uploadUrl = uploadRes.uploadUrl;
  const instant = uploadRes.instant;

  if (!songId) throw new Error(`No songId returned for "${title}"`);

  if (instant) {
    logOk(`Song "${title}" dedup — songId: ${songId}`);
    await waitForSongReady(songId, title);
    return songId;
  }

  if (uploadUrl) {
    const ext = path.extname(audioFile.path).toLowerCase();
    const contentType =
      ext === ".m4a" ? "audio/mp4" : "application/octet-stream";
    await uploadBinary(uploadUrl, audioFile.path, contentType);
    logOk(`Song "${title}" uploaded to R2`);
  }

  logInfo(`Calling finalize for song "${title}"...`);
  // Finalize creates the durable outbox record. Do not continue when it
  // fails: waiting for READY after an unauthorized or failed finalize only
  // obscures the real issue and leaves the song permanently pending.
  await apiCall(
    "POST",
    "/songs/internal/finalize-upload",
    { songId },
    {
      "x-internal-token": FINALIZER_INTERNAL_TOKEN,
      Authorization: undefined,
    },
  );

  await waitForSongReady(songId, title);
  return songId;
}

// ════════════════════════════════════════════════════════
// PHASE 5: Create Song Drafts + Album + Publish
// ════════════════════════════════════════════════════════

async function createAndPublishSongDraft(
  track,
  songId,
  artistIds,
  credits,
  contributorCredits,
  albumName,
  releaseDate,
  selectedArtist,
  selectedArtistAliases,
) {
  const name = track.trackName || track.title;
  // The seed owns only the primary artist workspace.  Collaborators are
  // system-created profiles, so this cross-artist credit must use the admin
  // catalog route rather than pretending the seed owner manages them.
  const draftPayload = {
    resourceId: songId,
    storefront: STOREFRONT,
    name,
    albumName,
    artistName: preferredArtistDisplayName(
      displayTrackArtistName(track),
      selectedArtist,
      selectedArtistAliases,
    ),
    audioLocale: "vi",
    // Playback quality is determined from the uploaded source by Worker.
    // Never label every provider import as lossless: most catalog sources are
    // AAC/MP3 and a false trait would leak into production metadata.
    audioTraits: [],
    composerName: "",
    contentRating: track.trackExplicitness === "explicit" ? "explicit" : "",
    discNumber: track.discNumber || 1,
    durationInMillis: track.trackTimeMillis || 0,
    genreNames: [track.primaryGenreName || "Hip-Hop/Rap"],
    hasLyrics: false,
    hasTimeSyncedLyrics: false,
    isrc: "",
    releaseDate: releaseDate || "",
    trackNumber: track.trackNumber || 0,
    url: slugify(name),
    artistIds,
    composerIds: [],
    credits,
    contributorCredits,
  };

  let draftId;
  try {
    const draftRes = await apiCall(
      "POST",
      "/admin/catalog/songs/draft",
      draftPayload,
    );
    draftId = draftRes.draftId || draftRes.id;
    await apiCall("POST", "/admin/catalog/drafts/" + draftId + "/submit");
  } catch (error) {
    if (!String(error?.message || "").includes("CATALOG_DRAFT_IN_REVIEW")) {
      throw error;
    }
    const drafts = responseData(
      await apiCall(
        "GET",
        `/admin/catalog/drafts?storefront=${encodeURIComponent(STOREFRONT)}&resourceType=songs&resourceId=${encodeURIComponent(songId)}&limit=1`,
      ),
    );
    const existingDraft = drafts?.drafts?.[0];
    draftId = existingDraft?.draftId || existingDraft?.id;
    if (!draftId) throw error;
    logInfo(`Resuming submitted Song draft "${name}"...`);
  }

  await apiCall("POST", `/admin/catalog/drafts/${draftId}/publish`);
  logOk(`Song draft "${name}" published`);

  return draftId;
}

async function createAndPublishAlbum(
  album,
  artistIds,
  songMappings,
  artworkAssetId,
  editorialVideoAssetId,
  editorialDescription,
  selectedArtist,
  selectedArtistAliases,
) {
  const albumName = album.collectionName || album.name;
  const releaseDate = album.releaseDate ? album.releaseDate.split("T")[0] : "";
  const releaseType = releaseTypeForSeedAlbum(album);

  const seen = new Set();
  const uniqueMappings = songMappings.filter((m) => {
    if (seen.has(m.catalogSongId)) {
      logWarn(
        `Duplicate songId ${m.catalogSongId} for "${m.track.trackName}" — skipping (same audio as another track)`,
      );
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

  logInfo(
    `Creating album draft "${albumName}" with ${tracks.length} tracks...`,
  );

  const draftBody = {
    // The public catalog ID must always be opaque and internal. The provider
    // identifier is stored separately and makes repeated seeds an upsert.
    resourceId: crypto.randomUUID(),
    storefront: STOREFRONT,
    ingestionSource: "catalog-seed",
    ingestionKey: catalogIngestionKey(album.collectionId),
    name: albumName,
    artistName: preferredArtistDisplayName(
      album.artistName || album.collectionArtistName,
      selectedArtist,
      selectedArtistAliases,
    ),
    // An album can contain tracks with different source qualities. Its
    // catalog trait must not claim lossless unless that is independently
    // verified for every track.
    audioTraits: [],
    contentRating:
      album.collectionExplicitness === "explicit" ? "explicit" : "",
    copyright: album.copyright || "",
    genreNames: [album.primaryGenreName || "Hip-Hop/Rap"],
    isCompilation: false,
    isComplete: true,
    isPrerelease: false,
    releaseType,
    recordLabel: album.copyright?.match(/℗\s*\d+\s+(.+)/)?.[1] || "",
    releaseDate,
    upc: "",
    url: slugify(albumName),
    artistIds,
    artworkAssetId,
    tracks,
  };

  if (editorialVideoAssetId) {
    draftBody.editorialVideoAssetId = editorialVideoAssetId;
  }
  if (editorialDescription) {
    draftBody.editorialNotes = { standard: editorialDescription };
  }

  // A seed is an administrative import. Keep create, submit, and publish on
  // one admin identity; Artist Studio correctly rejects a submitter different
  // from the user that created the draft.
  const draftRes = await apiCall(
    "POST",
    "/admin/catalog/albums/draft",
    draftBody,
  );
  const draftId = draftRes.draftId || draftRes.id;
  await apiCall("POST", "/admin/catalog/drafts/" + draftId + "/submit");
  logInfo("Publishing album draft...");

  try {
    await apiCall("POST", `/admin/catalog/drafts/${draftId}/publish`);
  } catch (error) {
    // Albums seeded before ingestionKey was introduced cannot be found by the
    // normal upsert. The catalog guard returns their ID, which lets us migrate
    // that exact existing album instead of creating a duplicate.
    const existingAlbumId = String(error.message || "").match(
      /ALBUM_SEMANTIC_DUPLICATE: matches existing album ([a-z0-9-]+)/i,
    )?.[1];
    if (!existingAlbumId) throw error;

    logWarn(
      `Album "${albumName}" exists from an older seed — updating ${existingAlbumId} with the new metadata`,
    );
    await apiCall("DELETE", `/admin/catalog/drafts/${draftId}`);

    const migrationDraftRes = await apiCall(
      "POST",
      "/admin/catalog/albums/draft",
      {
        ...draftBody,
        resourceId: existingAlbumId,
      },
    );
    const migrationDraftId = migrationDraftRes.draftId || migrationDraftRes.id;
    await apiCall(
      "POST",
      "/admin/catalog/drafts/" + migrationDraftId + "/submit",
    );
    await apiCall("POST", `/admin/catalog/drafts/${migrationDraftId}/publish`);
  }

  logOk(`Album "${albumName}" published!`);
}

// ════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════

async function main() {
  console.log(
    `\n${c.bold}${c.magenta}╔══════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}${c.magenta}        Auto Seed Artist Bot          ${c.reset}`,
  );
  console.log(
    `${c.bold}${c.magenta}╚══════════════════════════════════════╝${c.reset}\n`,
  );

  if (DRY_RUN)
    logWarn("DRY RUN mode — will crawl & download only, no API calls");
  logInfo(`Audio mode: ${AUDIO_MODE}`);
  logInfo(`Static lyric collection: ${STATIC_LYRICS_ENABLED ? "enabled" : "disabled"}`);

  // ── Interactive Setup ───────────────────────────────

  if (!DRY_RUN) {
    const managedBySeedStudio = Boolean(process.env.SEED_STUDIO_TOKEN_URL);
    ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
    if (!managedBySeedStudio && !ADMIN_TOKEN) {
      ADMIN_TOKEN = await promptUser(
        `  ${c.bold}ADMIN_TOKEN${c.reset} (JWT access token SUPER_ADMIN): `,
      );
    }
    if (!managedBySeedStudio && !ADMIN_TOKEN) {
      logErr("ADMIN_TOKEN is required");
      process.exit(1);
    }
    logOk(
      managedBySeedStudio
        ? "Seed Studio managed session connected"
        : "ADMIN_TOKEN set",
    );

    FINALIZER_INTERNAL_TOKEN = process.env.FINALIZER_INTERNAL_TOKEN || "";
    if (!FINALIZER_INTERNAL_TOKEN) {
      logErr("FINALIZER_INTERNAL_TOKEN is required");
      process.exit(1);
    }
    logOk("FINALIZER_INTERNAL_TOKEN set");

    SEED_ARTIST_PASSWORD = process.env.SEED_ARTIST_PASSWORD || "";
    if (!METADATA_ONLY && !SEED_ARTIST_PASSWORD) {
      logErr(
        "SEED_ARTIST_PASSWORD is required to create the Artist Owner account",
      );
      process.exit(1);
    }

    console.log();
  }

  const artistQuery =
    firstPositionalArgument() ||
    (await promptUser(`  ${c.bold}Tên nghệ sĩ${c.reset} cần tìm: `));

  if (!artistQuery) {
    logErr("Tên nghệ sĩ không được để trống");
    process.exit(1);
  }

  // ── PHASE 1: Discovery ──────────────────────────────

  logStep(
    "Phase 1/5",
    SELECTED_ARTIST_ID
      ? "Looking up selected Apple Music artist..."
      : "Searching Apple Music...",
  );

  // Seed Studio has already selected a concrete iTunes artist ID. Looking it
  // up directly keeps song-search results (including names with "&") from
  // being reinterpreted as a new fuzzy artist search.
  const artists = SELECTED_ARTIST_ID
    ? await lookupArtistITunes(SELECTED_ARTIST_ID)
    : await searchArtistITunes(artistQuery);
  if (artists.length === 0) {
    logErr(`No artists found for "${artistQuery}"`);
    process.exit(1);
  }

  console.log(`\n  Found ${artists.length} artist(s):\n`);
  const artistMotionProfiles = await discoverArtistMotionArtwork(artists);
  artists.forEach((a, i) => {
    const video = artistMotionProfiles.get(String(a.artistId))?.videoArtwork;
    const videoStatus = video ? `video ${video.presentation}` : "no video";
    console.log(`      motion artwork: ${videoStatus}`);
    console.log(
      `  ${c.bold}[${i + 1}]${c.reset} ${a.artistName} (${a.primaryGenreName || "N/A"}) — ID: ${a.artistId}`,
    );
  });

  let selectedArtist;
  if (SELECTED_ARTIST_ID) {
    selectedArtist = artists.find(
      (artist) => String(artist.artistId) === SELECTED_ARTIST_ID,
    );
    if (!selectedArtist) {
      logErr(
        `Selected artist ID ${SELECTED_ARTIST_ID} is not in the search results`,
      );
      process.exit(1);
    }
    logOk(`Selected by Seed Studio: ${selectedArtist.artistName}`);
  } else if (artists.length === 1) {
    selectedArtist = artists[0];
    logOk(`Auto-selected: ${selectedArtist.artistName}`);
  } else {
    const choice = await promptUser(`\n  Pick artist [1-${artists.length}]: `);
    const idx = parseInt(choice, 10) - 1;
    if (idx < 0 || idx >= artists.length) {
      logErr("Invalid choice");
      process.exit(1);
    }
    selectedArtist = artists[idx];
  }

  const slug = slugify(selectedArtist.artistName);
  const tmpDir = path.join(__dirname, ".tmp", slug);
  const audioDir = path.join(tmpDir, "audio");
  const state = new State(path.join(tmpDir, "state.json"));
  const selectedArtistProfileKey = String(selectedArtist.artistId);
  const highResArtwork = artistMotionProfiles.has(selectedArtistProfileKey)
    ? artistMotionProfiles.get(selectedArtistProfileKey)
    : await fetchAppleMusicArtworkHighRes(selectedArtist.artistId);

  if (METADATA_ONLY) {
    if (!CATALOG_ARTIST_ID) {
      logErr("--catalog-artist-id is required when updating metadata");
      process.exit(1);
    }
    logStep(
      "Metadata update",
      `Refreshing artist metadata for ${selectedArtist.artistName}...`,
    );
    if (DRY_RUN) {
      logOk(
        `Would update catalog artist ${CATALOG_ARTIST_ID} without changing albums, songs, or audio`,
      );
      process.exit(0);
    }
    await refreshExistingArtistMetadata({
      catalogArtistId: CATALOG_ARTIST_ID,
      selectedArtist,
      appleMusicProfile: highResArtwork,
      state,
      tmpDir,
    });
    console.log(
      `\n${c.bold}${c.green}Done!${c.reset} Metadata updated for artist ${CATALOG_ARTIST_ID}.\n`,
    );
    return;
  }

  logInfo(`Looking up albums for ${selectedArtist.artistName}...`);
  const discoveredAlbums = await lookupAlbumsITunes(selectedArtist.artistId);
  const albums = discoveredAlbums.filter((album) =>
    albumBelongsToArtist(album, selectedArtist),
  );

  const relatedOnlyCount = discoveredAlbums.length - albums.length;
  if (relatedOnlyCount > 0) {
    logInfo(
      `Ignored ${relatedOnlyCount} related release(s): ${selectedArtist.artistName} is not a release artist`,
    );
  }

  if (albums.length === 0) {
    logErr("No albums found");
    process.exit(1);
  }

  console.log(`\n  Found ${albums.length} album(s)/single(s):\n`);
  const albumEditorialMetadataById =
    await discoverAlbumEditorialMetadata(albums);
  albums.forEach((a, i) => {
    const metadata = albumEditorialMetadataById.get(String(a.collectionId));
    const videoStatus = metadata?.videoArtwork?.hlsUrl
      ? "video artwork"
      : "no video";
    const descriptionStatus = metadata?.description
      ? "editorial description"
      : "no description";
    console.log(`      editorial: ${videoStatus}, ${descriptionStatus}`);
    const type = a.trackCount <= 3 ? "Single" : "Album";
    console.log(
      `  ${c.bold}[${i + 1}]${c.reset} ${a.collectionName} (${a.trackCount} tracks, ${type}, ${a.releaseDate?.split("T")[0] || "?"})`,
    );
  });

  const albumChoice = SELECTED_ALBUM_IDS.size
    ? [...SELECTED_ALBUM_IDS].join(",")
    : await promptUser(`\n  Pick albums to import (e.g. "1,3,5" or "all"): `);
  let selectedAlbums;
  if (SELECTED_ALBUM_IDS.size) {
    selectedAlbums = albums.filter((album) =>
      SELECTED_ALBUM_IDS.has(String(album.collectionId)),
    );
    if (selectedAlbums.length !== SELECTED_ALBUM_IDS.size) {
      logErr(
        "One or more selected album IDs are not available for this artist",
      );
      process.exit(1);
    }
  } else if (albumChoice.toLowerCase() === "all") {
    selectedAlbums = albums;
  } else {
    const indices = albumChoice
      .split(",")
      .map((s) => parseInt(s.trim(), 10) - 1);
    selectedAlbums = indices
      .filter((i) => i >= 0 && i < albums.length)
      .map((i) => albums[i]);
  }

  const selectedAlbumCount = selectedAlbums.length;
  selectedAlbums = uniqueAlbumsByCollectionId(selectedAlbums);
  if (selectedAlbums.length !== selectedAlbumCount) {
    logWarn(
      `Ignored ${selectedAlbumCount - selectedAlbums.length} duplicate collection ID(s) from the selection`,
    );
  }

  if (selectedAlbums.length === 0) {
    logErr("No albums selected");
    process.exit(1);
  }

  logOk(`Selected ${selectedAlbums.length} album(s)`);

  const albumCandidates = [];
  for (const album of selectedAlbums) {
    logInfo(`Loading tracks for "${album.collectionName}"...`);
    const tracks = await lookupTracksITunes(album.collectionId);
    albumCandidates.push({
      album,
      tracks,
    });
    logOk(`${album.collectionName}: ${tracks.length} tracks`);
    await sleep(300);
  }

  const albumsWithTracks = selectPreferredAlbumEditions(albumCandidates);
  if (albumsWithTracks.length !== albumCandidates.length) {
    logOk(
      `Selected ${albumsWithTracks.length} release(s) after Standard/Deluxe resolution`,
    );
  }
  // Apple can localize the selected artist in CJK on its artist endpoint,
  // while album/track metadata uses a Latin transliteration. Both names map
  // to the selected artist ID and must never create separate catalog artists.
  const selectedArtistAliases = selectedArtistAliasKeys(
    albumsWithTracks,
    selectedArtist,
  );

  // ── PHASE 2: Download ───────────────────────────────

  logStep("Phase 2/5", "Downloading assets...");

  const artistArtworkPath = path.join(tmpDir, "artist-artwork.jpg");
  const artistArtworkUrl = await downloadArtistArtwork(
    resolveArtistArtworkUrls(highResArtwork, selectedArtist.artworkUrl100),
    artistArtworkPath,
    "Artist",
  );
  if (!artistArtworkUrl) {
    logWarn(
      `No Apple Music or iTunes portrait for "${selectedArtist.artistName}"; using the default artist avatar`,
    );
  }

  let artistVideoBannerPath = null;
  if (highResArtwork?.videoArtwork?.hlsUrl) {
    const videoDest = path.join(tmpDir, "artist-video-banner.mp4");
    const ok = await downloadVideoBanner(
      highResArtwork.videoArtwork.hlsUrl,
      videoDest,
      "Artist",
    );
    if (ok) artistVideoBannerPath = videoDest;
  }

  const albumArtworks = {};
  const albumVideoBanners = {};
  for (const { album } of albumsWithTracks) {
    const albumSlug = slugify(album.collectionName);
    const albumArtworkPath = path.join(
      tmpDir,
      `album-${albumSlug}-artwork.jpg`,
    );
    const artworkUrl = getITunesArtworkHighRes(album.artworkUrl100);
    if (artworkUrl) {
      await downloadArtwork(
        artworkUrl,
        albumArtworkPath,
        `Album "${album.collectionName}"`,
      );
      albumArtworks[album.collectionId] = albumArtworkPath;
    }

    const metadata = albumEditorialMetadataById.has(String(album.collectionId))
      ? albumEditorialMetadataById.get(String(album.collectionId))
      : await fetchAppleMusicAlbumEditorialMetadata(album);
    const videoArtwork = metadata?.videoArtwork;
    if (!videoArtwork?.hlsUrl) continue;

    const albumVideoPath = path.join(tmpDir, `album-${albumSlug}-video.mp4`);
    if (
      await downloadVideoBanner(
        videoArtwork.hlsUrl,
        albumVideoPath,
        `Album "${album.collectionName}"`,
      )
    ) {
      albumVideoBanners[album.collectionId] = albumVideoPath;
    }
  }

  const totalTracks = albumsWithTracks.reduce(
    (sum, a) => sum + a.tracks.length,
    0,
  );
  logInfo(`Downloading audio for ${totalTracks} track(s)...`);

  // Chống lặp bài: cùng một bản thu (tựa-gốc + nghệ sĩ chính) xuất hiện trên nhiều
  // album/single/tuyển tập chỉ được TẢI một lần; các track sau tái sử dụng file đã có.
  const audioFiles = {};
  const recordingAudio = {}; // recordingKey → { path, source }
  const trackToRecording = {}; // trackId      → recordingKey
  let dedupDownloadCount = 0;
  let trackCounter = 0;
  for (const { album, tracks } of albumsWithTracks) {
    const albumAudioDir = path.join(audioDir, slugify(album.collectionName));
    for (const track of tracks) {
      const songTitle = track.trackName || track.title;
      const recKey = recordingKey(
        songTitle,
        track.artistName || selectedArtist.artistName,
      );
      trackToRecording[track.trackId] = recKey;

      if (recordingAudio[recKey]) {
        audioFiles[track.trackId] = {
          ...recordingAudio[recKey],
          source: "dedup",
        };
        logOk(
          `[--] "${songTitle}" trùng bản thu đã tải — dùng lại, không tải lại`,
        );
        dedupDownloadCount++;
        trackCounter++;
        continue;
      }

      const result = await downloadSongAudio(
        track,
        selectedArtist.artistName,
        albumAudioDir,
        trackCounter,
      );
      if (result) {
        audioFiles[track.trackId] = result;
        recordingAudio[recKey] = { path: result.path, source: result.source };
      }
      trackCounter++;
      await sleep(500);
    }
  }

  const nctCount = Object.values(audioFiles).filter(
    (f) => f.source === "nhaccuatui",
  ).length;
  const zingCount = Object.values(audioFiles).filter(
    (f) => f.source === "zingmp3",
  ).length;
  const youtubeMusicCount = Object.values(audioFiles).filter(
    (f) => f.source === "youtube_music",
  ).length;
  const youtubeCount = Object.values(audioFiles).filter(
    (f) => f.source === "youtube",
  ).length;
  const soundcloudCount = Object.values(audioFiles).filter(
    (f) => f.source === "soundcloud",
  ).length;
  const cachedCount = Object.values(audioFiles).filter(
    (f) => f.source === "cached",
  ).length;
  const uniqueRecordings = Object.keys(recordingAudio).length;
  const failedCount = totalTracks - Object.keys(audioFiles).length;

  console.log(`\n  ${c.bold}Download Summary:${c.reset}`);
  console.log(`  ${c.green}NhacCuaTui:${c.reset}     ${nctCount}`);
  console.log(`  ${c.cyan}Zing MP3:${c.reset}       ${zingCount}`);
  console.log(`  ${c.magenta}YouTube Music:${c.reset}  ${youtubeMusicCount}`);
  console.log(`  ${c.magenta}YouTube:${c.reset}        ${youtubeCount}`);
  console.log(`  ${c.magenta}SoundCloud:${c.reset}     ${soundcloudCount}`);
  console.log(`  ${c.blue}Cached:${c.reset}         ${cachedCount}`);
  console.log(
    `  ${c.dim}Bản thu duy nhất:${c.reset} ${uniqueRecordings} / ${totalTracks} track (${dedupDownloadCount} trùng đã bỏ tải lại)`,
  );
  if (failedCount > 0)
    console.log(`  ${c.red}Failed:${c.reset}         ${failedCount}`);

  if (DRY_RUN) {
    logStep("DRY RUN COMPLETE", "Assets downloaded. No API calls made.");
    logInfo(`Files saved to: ${tmpDir}`);
    process.exit(0);
  }

  // ── PHASE 3: Upload Artworks ────────────────────────

  logStep("Phase 3/5", "Uploading artworks to local API...");

  if (!fs.existsSync(FALLBACK_ARTIST_ARTWORK_PATH)) {
    throw new Error(
      `Default artist avatar is missing: ${FALLBACK_ARTIST_ARTWORK_PATH}`,
    );
  }
  let fallbackArtistArtworkAssetId = state.get("fallbackArtistArtworkAssetId");
  if (!fallbackArtistArtworkAssetId) {
    fallbackArtistArtworkAssetId = await uploadArtworkAsset(
      FALLBACK_ARTIST_ARTWORK_PATH,
      "Default artist avatar",
    );
    state.set("fallbackArtistArtworkAssetId", fallbackArtistArtworkAssetId);
  }

  const artistArtworkSource = artistArtworkUrl ? "apple-or-itunes" : "fallback";
  let artistArtworkAssetId = state.get("artistArtworkAssetId");
  if (state.get("artistArtworkSource") !== artistArtworkSource) {
    // States written before the source policy existed may point at an album
    // cover or a third-party portrait. Rebuild the artist asset once so every
    // resumed seed follows the current Apple/iTunes-only policy.
    artistArtworkAssetId = "";
  }
  if (
    artistArtworkUrl &&
    !artistArtworkAssetId &&
    fs.existsSync(artistArtworkPath)
  ) {
    artistArtworkAssetId = await uploadArtworkAsset(
      artistArtworkPath,
      "Artist",
    );
  }
  if (!artistArtworkUrl) {
    artistArtworkAssetId = fallbackArtistArtworkAssetId;
  }
  state.set("artistArtworkAssetId", artistArtworkAssetId);
  state.set("artistArtworkSource", artistArtworkSource);

  let artistVideoAssetId = state.get("artistVideoAssetId");
  if (
    !artistVideoAssetId &&
    artistVideoBannerPath &&
    fs.existsSync(artistVideoBannerPath)
  ) {
    try {
      artistVideoAssetId = await uploadVideoAsset(
        artistVideoBannerPath,
        "Artist banner",
      );
      state.set("artistVideoAssetId", artistVideoAssetId);
    } catch (err) {
      logWarn(`Failed to upload artist video banner: ${err.message}`);
    }
  }

  const albumArtworkAssetIds = state.get("albumArtworkAssetIds") || {};
  for (const { album } of albumsWithTracks) {
    const artworkPath = albumArtworks[album.collectionId];
    if (!artworkPath || albumArtworkAssetIds[album.collectionId]) continue;
    const assetId = await uploadArtworkAsset(
      artworkPath,
      `Album "${album.collectionName}"`,
    );
    albumArtworkAssetIds[album.collectionId] = assetId;
    state.set("albumArtworkAssetIds", albumArtworkAssetIds);
  }

  const albumVideoAssetIds = state.get("albumVideoAssetIds") || {};
  for (const { album } of albumsWithTracks) {
    const videoPath = albumVideoBanners[album.collectionId];
    if (!videoPath || albumVideoAssetIds[album.collectionId]) continue;

    try {
      const assetId = await uploadVideoAsset(
        videoPath,
        `Album "${album.collectionName}"`,
      );
      albumVideoAssetIds[album.collectionId] = assetId;
      state.set("albumVideoAssetIds", albumVideoAssetIds);
    } catch (err) {
      logWarn(
        `Failed to upload video for album "${album.collectionName}": ${err.message}`,
      );
    }
  }

  // ── PHASE 4: Create Artist + Upload Songs ──────────

  logStep("Phase 4/5", "Creating artist & uploading songs...");

  // Seed Studio passes the explicitly selected catalog Artist. Reuse it for
  // normal song/album imports as well as metadata-only updates; otherwise a
  // later import for an existing artist would create a second Artist record.
  const existingPrimaryArtistId =
    CATALOG_ARTIST_ID ||
    (await findCatalogArtistByExactName(selectedArtist.artistName));
  let artistId = existingPrimaryArtistId || state.get("artistId");
  let primaryArtistNeedsCanonicalName = false;
  if (artistId && hasHanCharacters(selectedArtist.artistName)) {
    const existingArtist = await catalogArtistResource(artistId);
    const existingName =
      existingArtist.attributes?.name || existingArtist.name || "";
    primaryArtistNeedsCanonicalName = !hasHanCharacters(existingName);
  }
  if (!artistId) {
    artistId = await createAndPublishArtist({
      name: selectedArtist.artistName,
      genreNames: [selectedArtist.primaryGenreName || "Hip-Hop/Rap"],
      artworkAssetId: artistArtworkAssetId,
      editorialVideoAssetId: artistVideoAssetId,
    });
    state.set("artistId", artistId);
  } else {
    state.set("artistId", artistId);
    logOk(`Reusing existing artist — artistId: ${artistId}`);
    if (primaryArtistNeedsCanonicalName) {
      await assertArtistMetadataUpdateAllowed(artistId);
      await updateAndPublishArtistMetadata({
        catalogArtistId: artistId,
        selectedArtist,
        artworkAssetId: artistArtworkAssetId,
        editorialVideoAssetId: artistVideoAssetId,
      });
      logOk(
        `Replaced Romanized artist name with official name "${selectedArtist.artistName}"`,
      );
    }
  }

  const artistOwnerUserId = await createSeedArtistOwner(
    selectedArtist.artistName,
    slug,
    state,
  );
  await apiCall("POST", "/admin/artists/" + artistId + "/members", {
    userId: artistOwnerUserId,
    role: "OWNER",
  });
  await loginSeedArtistOwner(state.get("artistOwnerEmail"), state);
  logOk("Seed Artist Owner assigned to workspace and signed in");

  const collaboratorArtistIds = await ensureCollaboratorArtists(
    albumsWithTracks,
    selectedArtist,
    selectedArtistAliases,
    artistId,
    fallbackArtistArtworkAssetId,
    state,
    tmpDir,
  );

  const songIdMap = state.get("songIdMap") || {};
  const checksumMap = state.get("checksumMap") || {};
  // Chống lặp bài ở tầng catalog: mỗi bản thu (tựa-gốc + nghệ sĩ chính) chỉ ánh xạ
  // tới ĐÚNG MỘT songId, dù xuất hiện ở nhiều album. Đây là lớp chống lặp chính —
  // không phụ thuộc checksum (bản re-encode từ mỗi nguồn cho checksum khác nhau).
  const recordingSongMap = state.get("recordingSongMap") || {};
  const seedFailures = [];

  for (const { album, tracks } of albumsWithTracks) {
    logInfo(`\nProcessing songs for album "${album.collectionName}"...`);

    for (const track of tracks) {
      const recKey = recordingKey(
        track.trackName || track.title,
        track.artistName || selectedArtist.artistName,
      );
      const trackKey = `${album.collectionId}:${track.trackId}`;
      if (songIdMap[trackKey]) {
        try {
          await waitForSongReady(songIdMap[trackKey], track.trackName);
          logOk(
            `Song "${track.trackName}" already uploaded — songId: ${songIdMap[trackKey]}`,
          );
          continue;
        } catch (error) {
          logWarn(
            `Cached song "${track.trackName}" is not READY; retrying pipeline`,
          );
          const cachedSongId = songIdMap[trackKey];
          delete songIdMap[trackKey];
          if (recordingSongMap[recKey] === cachedSongId)
            delete recordingSongMap[recKey];
          state.set("songIdMap", songIdMap);
          state.set("recordingSongMap", recordingSongMap);
        }
      }

      // ── Lớp 1: cùng bản thu đã có songId → tái sử dụng, KHÔNG upload lại ──
      if (recordingSongMap[recKey]) {
        const existingSongId = recordingSongMap[recKey];
        try {
          await waitForSongReady(existingSongId, track.trackName);
          songIdMap[trackKey] = existingSongId;
          state.set("songIdMap", songIdMap);
          logOk(
            `Song "${track.trackName}" trùng bản thu — dùng lại songId: ${existingSongId}`,
          );
          continue;
        } catch (error) {
          logWarn(
            `Cached recording "${track.trackName}" is not READY; retrying pipeline`,
          );
          delete recordingSongMap[recKey];
          state.set("recordingSongMap", recordingSongMap);
        }
      }

      const audioFile = audioFiles[track.trackId];
      if (!audioFile) {
        logWarn(`No audio for "${track.trackName}", skipping`);
        seedFailures.push(
          `download ${track.trackName}: no verified audio source`,
        );
        continue;
      }

      // ── Lớp 2: trùng checksum (an toàn dự phòng cho file y hệt) ──
      const fileChecksum = await sha256File(audioFile.path);
      if (checksumMap[fileChecksum]) {
        const existing = checksumMap[fileChecksum];
        if (typeof existing === "string") {
          logWarn(
            `Skipping "${track.trackName}": checksum comes from legacy state without title metadata`,
          );
          seedFailures.push(
            `cache ${track.trackName}: legacy checksum entry must be reviewed`,
          );
          continue;
        }
        const existingSongId = existing.songId;
        const existingTitle = existing.title;
        if (
          existingTitle &&
          normalizeMusicText(existingTitle) !==
          normalizeMusicText(track.trackName)
        ) {
          logWarn(
            `Skipping "${track.trackName}": audio checksum matches a different track ("${existingTitle}")`,
          );
          continue;
        }
        try {
          await waitForSongReady(existingSongId, track.trackName);
          songIdMap[trackKey] = existingSongId;
          recordingSongMap[recKey] = existingSongId;
          state.set("songIdMap", songIdMap);
          state.set("recordingSongMap", recordingSongMap);
          logOk(
            `Song "${track.trackName}" matched by checksum — songId: ${existingSongId}`,
          );
          continue;
        } catch (error) {
          logWarn(
            `Cached checksum for "${track.trackName}" is not READY; retrying pipeline`,
          );
          delete checksumMap[fileChecksum];
          state.set("checksumMap", checksumMap);
        }
      }

      try {
        const songId = await uploadSongThroughPipeline(
          audioFile,
          track.trackName,
          artistId,
        );
        songIdMap[trackKey] = songId;
        recordingSongMap[recKey] = songId;
        checksumMap[fileChecksum] = {
          songId,
          title: track.trackName || track.title,
        };
        state.set("songIdMap", songIdMap);
        state.set("recordingSongMap", recordingSongMap);
        state.set("checksumMap", checksumMap);
      } catch (err) {
        logErr(`Failed to upload "${track.trackName}": ${err.message}`);
        seedFailures.push(`upload ${track.trackName}: ${err.message}`);
      }
    }
  }

  // ── PHASE 5: Create Drafts + Publish ────────────────

  logStep("Phase 5/5", "Creating catalog drafts & publishing...");

  const publishedSongs = state.get("publishedSongs") || {};
  // Mỗi songId (một bản thu) chỉ publish draft MỘT lần, kể cả khi được gán vào
  // nhiều album do đã dedup theo bản thu — tránh tạo bản ghi bài trùng.
  const publishedSongIds = state.get("publishedSongIds") || {};
  // Migrate the former credit-only marker once. The version now covers every
  // seed-derived Song field, including the exact iTunes display artist text.
  const publishedSongVersions =
    state.get("publishedSongVersions") ||
    state.get("publishedSongCreditVersions") ||
    {};
  // Decisions are kept separately so a stopped job can resume without asking
  // the same question again.
  const reviewedSongCredits = state.get("reviewedSongCredits") || {};
  const publishedSongStaticLyricVersions =
    state.get("publishedSongStaticLyricVersions") || {};
  const reviewedSongStaticLyrics = state.get("reviewedSongStaticLyrics") || {};
  // Empty lyric results must be retried on a future seed run in case Apple
  // publishes lyrics later. Keep misses only for this run to avoid reopening
  // the same recording when it appears on multiple releases.
  const staticLyricMissesInRun = new Set();
  // One recording can appear in an album and in its standalone single. Build
  // this index before publishing so its artist credits do not depend on which
  // release happens to be processed first.
  const songOccurrences = new Map();
  for (const { album, tracks } of albumsWithTracks) {
    for (const track of tracks) {
      const songId = songIdMap[`${album.collectionId}:${track.trackId}`];
      if (!songId) continue;
      const occurrences = songOccurrences.get(songId) || [];
      occurrences.push({ album, track });
      songOccurrences.set(songId, occurrences);
    }
  }

  for (const { album, tracks } of albumsWithTracks) {
    const albumArtworkAssetId =
      albumArtworkAssetIds[album.collectionId] || artistArtworkAssetId;
    const releaseDate = album.releaseDate
      ? album.releaseDate.split("T")[0]
      : "";
    const albumName = album.collectionName;

    const songMappings = [];
    const seenSongIdsInAlbum = new Set();

    for (const track of tracks) {
      const trackKey = `${album.collectionId}:${track.trackId}`;
      const songId = songIdMap[trackKey];
      if (!songId) continue;

      // Trong cùng một album, không thêm cùng một songId hai lần (các bản in lại).
      if (seenSongIdsInAlbum.has(songId)) {
        logWarn(
          `Bỏ track trùng bản thu trong album "${albumName}": "${track.trackName}" (songId ${songId} đã có)`,
        );
        continue;
      }

      if (publishedSongVersions[songId] !== CATALOG_SONG_PUBLISH_VERSION) {
        try {
          const occurrences = songOccurrences.get(songId) || [{ album, track }];
          const [creditOccurrence] =
            sortSongOccurrencesByCreditCompleteness(occurrences);
          const creditTrack = creditOccurrence.track;
          const creditAlbum = creditOccurrence.album;
          const creditAlbumName = creditAlbum.collectionName;
          const creditReleaseDate = creditAlbum.releaseDate
            ? creditAlbum.releaseDate.split("T")[0]
            : "";
          let reviewedCredits = reviewedSongCredits[songId];
          // Retry empty results: a prior URL/parser failure must not lock a
          // song into having no detailed credits forever.
          if (!Array.isArray(reviewedCredits) || reviewedCredits.length === 0) {
            logInfo(`Reading Apple Music credits: "${creditTrack.trackName}"`);
            reviewedCredits = normalizeReviewedCredits(
              await fetchAppleMusicSongCredits(creditTrack),
            );
            reviewedSongCredits[songId] = reviewedCredits;
            state.set("reviewedSongCredits", reviewedSongCredits);
          }

          const performerIds = songArtistIds(
            occurrences,
            selectedArtist,
            selectedArtistAliases,
            artistId,
            collaboratorArtistIds,
          );
          const primaryPerformerIds = new Set(
            songPrimaryArtistIds(
              occurrences,
              selectedArtist,
              selectedArtistAliases,
              artistId,
              collaboratorArtistIds,
            ),
          );
          const credits = performerIds.map((id, position) => ({
            artistId: id,
            role: "artist",
            isPrimary: primaryPerformerIds.has(id),
            position,
          }));
          // A reviewed credit may repeat an artist already verified from the
          // provider's song/album metadata. Keep that person as one Artist
          // entity and attach the additional role there; only people without
          // a source-backed Artist record become plain-text contributors.
          const contributorCreditPositions = new Map();
          const contributorCredits = [];
          for (const reviewed of reviewedCredits) {
            const artistId = await ensureAppleMusicCreditArtist(
              reviewed.name,
              fallbackArtistArtworkAssetId,
              state,
              tmpDir,
              collaboratorArtistIds,
            );
            if (artistId) {
              const position = credits.filter(
                (credit) => credit.role === reviewed.role,
              ).length;
              if (
                !credits.some(
                  (credit) =>
                    credit.artistId === artistId &&
                    credit.role === reviewed.role,
                )
              ) {
                credits.push({
                  artistId,
                  role: reviewed.role,
                  isPrimary: false,
                  position,
                });
              }
              continue;
            }

            const position = contributorCreditPositions.get(reviewed.role) || 0;
            contributorCreditPositions.set(reviewed.role, position + 1);
            contributorCredits.push({
              name: reviewed.name,
              role: reviewed.role,
              position,
            });
          }
          await createAndPublishSongDraft(
            creditTrack,
            songId,
            performerIds,
            credits,
            contributorCredits,
            creditAlbumName,
            creditReleaseDate,
            selectedArtist,
            selectedArtistAliases,
          );
          publishedSongs[trackKey] = true;
          publishedSongIds[songId] = true;
          publishedSongVersions[songId] = CATALOG_SONG_PUBLISH_VERSION;
          state.set("publishedSongs", publishedSongs);
          state.set("publishedSongIds", publishedSongIds);
          state.set("publishedSongVersions", publishedSongVersions);
        } catch (err) {
          logErr(
            `Failed to publish song draft "${track.trackName}": ${err.message}`,
          );
          seedFailures.push(`publish song ${track.trackName}: ${err.message}`);
          continue;
        }
      } else {
        publishedSongs[trackKey] = true;
        state.set("publishedSongs", publishedSongs);
      }

      const cachedStaticLyrics = reviewedSongStaticLyrics[songId];
      if (
        Array.isArray(cachedStaticLyrics) &&
        !cachedStaticLyrics.length &&
        publishedSongStaticLyricVersions[songId] === STATIC_LYRIC_SEED_VERSION
      ) {
        delete publishedSongStaticLyricVersions[songId];
        state.set(
          "publishedSongStaticLyricVersions",
          publishedSongStaticLyricVersions,
        );
      }

      if (
        STATIC_LYRICS_ENABLED &&
        publishedSongStaticLyricVersions[songId] !== STATIC_LYRIC_SEED_VERSION
      ) {
        try {
          let staticLyrics = cachedStaticLyrics;
          if (!Array.isArray(staticLyrics) || !staticLyrics.length) {
            delete reviewedSongStaticLyrics[songId];
            state.set("reviewedSongStaticLyrics", reviewedSongStaticLyrics);
            if (staticLyricMissesInRun.has(songId)) {
              staticLyrics = [];
            } else {
              logInfo(`Reading Apple Music static lyric: "${track.trackName}"`);
              staticLyrics = await fetchAppleMusicStaticLyrics(track);
              if (staticLyrics.length) {
                reviewedSongStaticLyrics[songId] = staticLyrics;
                state.set("reviewedSongStaticLyrics", reviewedSongStaticLyrics);
              } else {
                staticLyricMissesInRun.add(songId);
              }
            }
          }
          if (staticLyrics.length) {
            await upsertSongStaticLyrics(songId, staticLyrics);
            publishedSongStaticLyricVersions[songId] = STATIC_LYRIC_SEED_VERSION;
            state.set(
              "publishedSongStaticLyricVersions",
              publishedSongStaticLyricVersions,
            );
          }
        } catch (err) {
          logErr(
            `Failed to seed static lyric "${track.trackName}": ${err.message}`,
          );
          seedFailures.push(
            `seed static lyric ${track.trackName}: ${err.message}`,
          );
        }
      }

      seenSongIdsInAlbum.add(songId);
      songMappings.push({ track, catalogSongId: songId });
    }

    if (songMappings.length === 0) {
      logWarn(
        `No songs available for album "${albumName}", skipping album creation`,
      );
      continue;
    }

    // An interrupted upload can leave an album published with only part of
    // its tracklist. Keep a concrete signature of the complete source
    // tracklist so a later resume republishes that album once the missing
    // songs become READY instead of incorrectly treating it as finished.
    const hasCompleteTrackMapping = tracks.every((track) =>
      Boolean(songIdMap[`${album.collectionId}:${track.trackId}`]),
    );
    const trackMappingSignature = songMappings
      .map(({ track, catalogSongId }) => `${track.trackId}:${catalogSongId}`)
      .join("|");
    const albumPublished = state.get(`albumPublished:${album.collectionId}`);
    const albumMetadataCurrent =
      state.get(`albumPublishVersion:${album.collectionId}`) ===
      CATALOG_ALBUM_PUBLISH_VERSION;
    const albumTracklistCurrent =
      hasCompleteTrackMapping &&
      state.get(`albumTrackMappingSignature:${album.collectionId}`) ===
      trackMappingSignature;
    const albumVideoAssetId = albumVideoAssetIds[album.collectionId];
    const albumVideoPublished = state.get(
      `albumVideoPublished:${album.collectionId}`,
    );
    if (
      albumPublished &&
      albumMetadataCurrent &&
      albumTracklistCurrent &&
      (!albumVideoAssetId || albumVideoPublished)
    ) {
      logOk(`Album "${albumName}" already published`);
      continue;
    }

    try {
      await createAndPublishAlbum(
        album,
        albumArtistIds(
          album,
          selectedArtist,
          selectedArtistAliases,
          artistId,
          collaboratorArtistIds,
        ),
        songMappings,
        albumArtworkAssetId,
        albumVideoAssetId,
        albumEditorialMetadataById.get(String(album.collectionId))
          ?.description || "",
        selectedArtist,
        selectedArtistAliases,
      );
      state.set(
        `albumPublishVersion:${album.collectionId}`,
        CATALOG_ALBUM_PUBLISH_VERSION,
      );
      if (hasCompleteTrackMapping) {
        state.set(`albumPublished:${album.collectionId}`, true);
        state.set(
          `albumTrackMappingSignature:${album.collectionId}`,
          trackMappingSignature,
        );
      } else {
        // Do not cache an incomplete album as published. The next resume must
        // retry it after the failed audio items have been uploaded.
        state.delete(`albumPublished:${album.collectionId}`);
        state.delete(`albumTrackMappingSignature:${album.collectionId}`);
        logWarn(
          `Album "${albumName}" was published with missing tracks and will be completed on resume`,
        );
      }
      if (albumVideoAssetId) {
        state.set(`albumVideoPublished:${album.collectionId}`, true);
      }
    } catch (err) {
      logErr(`Failed to publish album "${albumName}": ${err.message}`);
      seedFailures.push(`publish album ${albumName}: ${err.message}`);
    }
  }

  // ── Verify ──────────────────────────────────────────

  console.log(`\n${c.bold}${c.green}━━━ Verification ━━━${c.reset}\n`);

  try {
    const artistRes = await apiCall(
      "GET",
      `/catalog/${STOREFRONT}/artists/${artistId}`,
    );
    logOk(
      `Artist: ${JSON.stringify(artistRes.resources?.artists || {}).substring(0, 100)}...`,
    );
  } catch (err) {
    logWarn(`Artist verify: ${err.message}`);
  }

  try {
    const albumsRes = await apiCall(
      "GET",
      `/catalog/${STOREFRONT}/artists/${artistId}/albums`,
    );
    const albumCount = albumsRes.data?.length || 0;
    logOk(`Albums: ${albumCount} found`);
  } catch (err) {
    logWarn(`Albums verify: ${err.message}`);
  }

  try {
    const songsRes = await apiCall(
      "GET",
      `/catalog/${STOREFRONT}/artists/${artistId}/songs`,
    );
    const songCount = songsRes.data?.length || 0;
    logOk(`Songs: ${songCount} found`);
  } catch (err) {
    logWarn(`Songs verify: ${err.message}`);
  }

  await closeAppleMusicBrowser();

  if (seedFailures.length > 0) {
    throw new Error(
      `Seed incomplete (${seedFailures.length} failure(s)): ${seedFailures.join(" | ")}`,
    );
  }

  console.log(
    `\n${c.bold}${c.green}Done!${c.reset} Artist "${selectedArtist.artistName}" seeded successfully.`,
  );
  console.log(`${c.dim}Artist ID: ${artistId}${c.reset}`);
  console.log(
    `${c.dim}State file: ${path.relative(process.cwd(), state.file)}${c.reset}\n`,
  );
}

main().catch(async (err) => {
  await closeAppleMusicBrowser();
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
