const sharp = require('sharp');

const PLAYLIST_ARTWORK_WIDTHS = [40, 80, 296, 316, 592, 632];
const PLAYLIST_HERO_ARTWORK_WIDTHS = [450, 600, 900, 1200];
const PLAYLIST_TITLE_FONT_SIZE = 104;
const PLAYLIST_MASTER_SIZE = 2400;
const PLAYLIST_TITLE_MAX_WIDTH = 1024;
const PALETTES = [
  ['#090b3d', '#5730b5', '#7d4bdf', '#a9fff4'], ['#100a46', '#4523a4', '#a13fe5', '#9af6eb'],
  ['#0a144c', '#3c3aa9', '#8c35d7', '#88f1ef'], ['#170742', '#6129a9', '#bc55e7', '#b5fff2'],
  ['#3b0c34', '#a31f68', '#f34e8a', '#ffd19b'], ['#42132d', '#b4265f', '#ff6b5f', '#ffd36e'],
  ['#40200c', '#b84a1c', '#f47b37', '#ffe28a'], ['#3b1234', '#8e316f', '#df72bc', '#ffd5ed'],
  ['#062f3e', '#087d7e', '#18c59b', '#c5ff9c'], ['#082d4c', '#176ea5', '#31b6de', '#b9f7ff'],
  ['#092b36', '#18778e', '#5ccbc4', '#d4fff5'], ['#102a46', '#3564be', '#72a6ff', '#d4e7ff'],
];

function hash(value) { let result = 2166136261; for (const character of value) { result ^= character.codePointAt(0) ?? 0; result = Math.imul(result, 16777619); } return result >>> 0; }
function seededRandom(seed) { let state = hash(seed); return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296; }; }
function escapeXml(value) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]); }

function createSvg(seed) {
  const [start, middle, end, glow] = PALETTES[hash(seed) % PALETTES.length];
  const random = seededRandom(seed);
  const angle = (Math.round(112 + random() * 68) * Math.PI) / 180;
  const x1 = 600 - Math.cos(angle) * 850;
  const y1 = 600 - Math.sin(angle) * 850;
  const x2 = 600 + Math.cos(angle) * 850;
  const y2 = 600 + Math.sin(angle) * 850;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><defs><linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop stop-color="${start}"/><stop offset=".52" stop-color="${middle}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="1200" height="1200" fill="url(#bg)"/></svg>`;
}

function hexToRgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }

function coverLayers(seed) {
  // Consume the background-angle random value, which is the first value used
  // by createSvg. The remaining values therefore stay byte-for-byte aligned.
  const alignedRandom = seededRandom(seed); alignedRandom();
  const v = {
    // Keep all three organic gradients inside the canvas. The old ranges could
    // place the bright wave and accent mostly off-screen for some seeds,
    // leaving an almost-flat cover.
    rx: Math.round(-72 + alignedRandom() * 144), ry: Math.round(-64 + alignedRandom() * 128), rr: Math.round(-10 + alignedRandom() * 20),
    wx: Math.round(-80 + alignedRandom() * 160), wy: Math.round(-72 + alignedRandom() * 144), wr: Math.round(-12 + alignedRandom() * 24),
    ax: Math.round(-88 + alignedRandom() * 176), ay: Math.round(-72 + alignedRandom() * 144), ar: Math.round(-14 + alignedRandom() * 28),
  };
  const ribbon = 'M-170 115 C180 -70 443 98 476 300 C512 510 201 486 224 696 C255 903 560 882 744 1048 C594 838 949 821 1300 944 L1300 1270 L-170 1270 Z';
  const wave = 'M695 -180 C960 4 745 235 946 374 C1180 530 1099 727 1300 906 L1300 1270 L688 1270 C920 1018 670 873 810 666 C932 481 596 294 695 -180 Z';
  const accent = 'M-110 738 C134 558 374 727 449 862 C535 1014 286 1019 167 1270 L-110 1270 Z';
  const transform = (x, y, rotation) => `translate(${600 + x} ${600 + y}) rotate(${rotation}) translate(-600 -600)`;
  const [, middle, end, glow] = PALETTES[hash(seed) % PALETTES.length];
  return [
    // Stronger opacity preserves separation even when a palette contains
    // neighboring hues (for example indigo/purple), avoiding flat covers.
    { path: ribbon, transform: transform(v.rx, v.ry, v.rr), color: middle, alpha: 236 },
    { path: wave, transform: transform(v.wx, v.wy, v.wr), color: glow, alpha: 224 },
    { path: accent, transform: transform(v.ax, v.ay, v.ar), color: end, alpha: 214 },
  ];
}

async function fitCoverTitle(title) {
  const characters = Array.from(title.trim());
  const measure = async (value) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="160"><style>text{font-family:Arial,sans-serif;font-size:${PLAYLIST_TITLE_FONT_SIZE}px;font-weight:700}</style><text x="0" y="120">${escapeXml(value)}</text></svg>`;
    const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
    return info.width;
  };
  const source = characters.join('');
  if ((await measure(source)) <= PLAYLIST_TITLE_MAX_WIDTH) return source;
  let low = 0, high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join('').trimEnd()}…`;
    if ((await measure(candidate)) <= PLAYLIST_TITLE_MAX_WIDTH) low = middle;
    else high = middle - 1;
  }
  return `${characters.slice(0, low).join('').trimEnd()}…`;
}

async function createTextSvg(title, size = 1200) {
  const scale = size / 1200;
  const line = escapeXml(await fitCoverTitle(title));
  const coordinate = (value) => value * scale;
  const text = `<text x="${coordinate(88)}" y="${coordinate(1100)}">${line}</text>`;
  const shadow = `<text x="${coordinate(91)}" y="${coordinate(1100)}" fill="#000" fill-opacity=".353">${line}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><style>text{font-family:Arial,sans-serif;font-size:${coordinate(PLAYLIST_TITLE_FONT_SIZE)}px;font-weight:700;fill:#fff}</style>${shadow}${text}</svg>`;
}

async function rasterMask(layer, size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1200 1200"><g transform="${layer.transform}"><path d="${layer.path}" fill="#fff"/></g></svg>`;
  return (await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
}

function paintPathGradient(pixels, mask, color, maximumAlpha) {
  const size = Math.sqrt(mask.length / 4);
  let minX = size, minY = size, maxX = 0, maxY = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    if (mask[(y * size + x) * 4 + 3] < 128) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (minX > maxX) return;
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const samples = 4096, maxDistance = Math.hypot(size, size), edgeDistance = new Float32Array(samples);
  for (let sample = 0; sample < samples; sample += 1) {
    const angle = (sample / samples) * Math.PI * 2 - Math.PI;
    const cos = Math.cos(angle), sin = Math.sin(angle); let last = 0;
    for (let distance = 0; distance < maxDistance; distance += .5) {
      const x = Math.round(centerX + cos * distance), y = Math.round(centerY + sin * distance);
      if (x < 0 || y < 0 || x >= size || y >= size || mask[(y * size + x) * 4 + 3] < 128) break;
      last = distance;
    }
    edgeDistance[sample] = Math.max(last, 1);
  }
  const [red, green, blue] = hexToRgb(color);
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const offset = (y * size + x) * 4, maskAlpha = mask[offset + 3] / 255;
    if (!maskAlpha) continue;
    const dx = x - centerX, dy = y - centerY, distance = Math.hypot(dx, dy);
    const sample = Math.round(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * (samples - 1));
    const sourceAlpha = (maximumAlpha / 255) * Math.max(0, 1 - distance / edgeDistance[sample]) * maskAlpha;
    const inverseAlpha = 1 - sourceAlpha;
    pixels[offset] = Math.round(red * sourceAlpha + pixels[offset] * inverseAlpha);
    pixels[offset + 1] = Math.round(green * sourceAlpha + pixels[offset + 1] * inverseAlpha);
    pixels[offset + 2] = Math.round(blue * sourceAlpha + pixels[offset + 2] * inverseAlpha);
  }
}

async function renderPlaylistArtwork(title, seed, includeTitle) {
  const renderSize = PLAYLIST_MASTER_SIZE;
  const source = createSvg(seed);
  const background = source;
  const { data, info } = await sharp(Buffer.from(background)).resize(renderSize, renderSize).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== renderSize || info.height !== renderSize) throw new Error('PLAYLIST_COVER_RENDER_FAILED');
  for (const layer of coverLayers(seed)) paintPathGradient(data, await rasterMask(layer, renderSize), layer.color, layer.alpha);
  const artwork = sharp(data, { raw: { width: renderSize, height: renderSize, channels: 4 } })
    .blur(1);
  if (includeTitle) artwork.composite([{ input: Buffer.from(await createTextSvg(title, renderSize)) }]);
  return artwork.png().toBuffer();
}

async function generatePlaylistCover(title, seed) {
  return renderPlaylistArtwork(title, seed, true);
}
async function generatePlaylistHeroSource(master) {
  const width = PLAYLIST_MASTER_SIZE;
  const sourceHeight = PLAYLIST_MASTER_SIZE;
  const heroHeight = Math.round(PLAYLIST_MASTER_SIZE / 0.75);
  const extensionHeight = heroHeight - sourceHeight;
  const scale = width / 1200;
  const sampleHeight = Math.round(48 * scale);
  const blurSigma = Math.round(28 * scale);
  const overlap = Math.min(Math.round(blurSigma * 1.5), extensionHeight);
  const layerHeight = extensionHeight + overlap;
  const { channels } = await sharp(master)
    .extract({ left: 0, top: sourceHeight - 6, width, height: 6 })
    .stats();
  const [red, green, blue] = channels.map((channel) => Math.round(channel.mean));
  const bottomStrip = await sharp(master)
    .extract({ left: 0, top: sourceHeight - sampleHeight, width, height: sampleHeight })
    .resize({ width, height: layerHeight, fit: 'fill' })
    .blur(blurSigma)
    .png()
    .toBuffer();
  const mask = (stops) => Buffer.from(`<svg width="${width}" height="${layerHeight}"><defs><linearGradient id="mask" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#mask)"/></svg>`);
  const blurFadeIn = await sharp(bottomStrip)
    .composite([{ input: await sharp(mask(`<stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="${(overlap / layerHeight).toFixed(4)}" stop-color="black"/><stop offset="1" stop-color="black"/>`)).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
  const flatFade = await sharp({ create: { width, height: layerHeight, channels: 3, background: { r: red, g: green, b: blue } } })
    .composite([{ input: await sharp(mask(`<stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="${(overlap / layerHeight).toFixed(4)}" stop-color="black" stop-opacity="0"/><stop offset="${(overlap / layerHeight + 0.65 * (1 - overlap / layerHeight)).toFixed(4)}" stop-color="black" stop-opacity=".55"/><stop offset="1" stop-color="black"/>`)).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
  const extension = await sharp({ create: { width, height: layerHeight, channels: 4, background: { r: red, g: green, b: blue, alpha: 0 } } })
    .composite([{ input: blurFadeIn }, { input: flatFade }])
    .png()
    .toBuffer();

  return sharp({
    create: { width, height: heroHeight, channels: 4, background: { r: red, g: green, b: blue, alpha: 1 } },
  })
    .composite([
      { input: master, top: 0, left: 0 },
      { input: extension, top: sourceHeight - overlap, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function createWebpRenditions(source, widths, options) {
  return new Map(await Promise.all(widths.map(async (width) => [
    width,
    await sharp(source).resize({ width, withoutEnlargement: true }).webp(options).toBuffer(),
  ])));
}

async function generatePlaylistCoverRenditions(title, seed) {
  const master = await generatePlaylistCover(title, seed);
  // Hero cards render their own metadata. Build their source without the
  // playlist title, then use the same blurred-bottom extension as the asset
  // pipeline to turn the square artwork into a 3:4 composition.
  const heroSource = await generatePlaylistHeroSource(
    await renderPlaylistArtwork(title, seed, false),
  );
  return {
    cover: await createWebpRenditions(master, PLAYLIST_ARTWORK_WIDTHS, { quality: 92 }),
    hero: await createWebpRenditions(heroSource, PLAYLIST_HERO_ARTWORK_WIDTHS, { quality: 84, effort: 5, smartSubsample: true }),
  };
}
module.exports = { PLAYLIST_ARTWORK_WIDTHS, PLAYLIST_HERO_ARTWORK_WIDTHS, generatePlaylistCover, generatePlaylistCoverRenditions };
