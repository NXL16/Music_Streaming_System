import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const assetRequire = createRequire(join(root, 'apps', 'asset', 'package.json'));
const sharp = assetRequire('sharp');

const HERO_ASPECT_RATIO = 3 / 4;
const HERO_EXTENSION_STRIP = 48;
const HERO_EXTENSION_BLUR_SIGMA = 28;
const DARK_EDGE_MIN_LUMINANCE = 10;
const DARK_EDGE_MEAN_LUMINANCE = 35;
// A genuinely black edge has nearly equal RGB channels. A dark-blue, red, or
// purple edge can have the same luminance but should retain its colour.
const NEUTRAL_BLACK_MAX_CHROMA = 7;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DEFAULT_PORT = 4316;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on('data', (chunk) => {
      length += chunk.length;
      if (length > MAX_UPLOAD_BYTES) {
        reject(new Error('Ảnh vượt quá giới hạn 25 MB.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function luminance(red, green, blue) {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

async function normalize(source) {
  return sharp(source, { limitInputPixels: 30_000_000 }).rotate().removeAlpha().png().toBuffer();
}

async function edgeStats(source, width, height) {
  const edgeHeight = Math.min(6, height);
  const stats = await sharp(source)
    .extract({ left: 0, top: height - edgeHeight, width, height: edgeHeight })
    .stats();
  const means = stats.channels.map((channel) => Math.round(channel.mean));
  const mins = stats.channels.map((channel) => channel.min);
  return {
    minLuminance: luminance(...mins),
    meanLuminance: luminance(...means),
    color: { r: means[0], g: means[1], b: means[2] },
    chroma: Math.max(...means) - Math.min(...means),
  };
}

async function findSolidBlackFooter(source, width, height) {
  const sampleRows = Math.min(256, height);
  const { data, info } = await sharp(source)
    .resize({ width: 64, height: sampleRows, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let firstBlackRow = sampleRows;
  for (let row = sampleRows - 1; row >= 0; row -= 1) {
    let total = 0;
    let brightPixels = 0;
    for (let column = 0; column < info.width; column += 1) {
      const index = (row * info.width + column) * info.channels;
      const value = luminance(data[index], data[index + 1], data[index + 2]);
      total += value;
      if (value > 20) brightPixels += 1;
    }
    const mean = total / info.width;
    const brightRatio = brightPixels / info.width;
    if (mean < 8 && brightRatio < 0.02) firstBlackRow = row;
    else break;
  }

  const footerRatio = (sampleRows - firstBlackRow) / sampleRows;
  if (footerRatio < 0.08 || firstBlackRow < sampleRows * 0.5) return null;
  return {
    height: Math.max(1, Math.floor((firstBlackRow / sampleRows) * height)),
    ratio: footerRatio,
  };
}

async function buildExtension(source, width, height, extensionHeight, options = {}) {
  const edge = await edgeStats(source, width, height);
  const usePureBlack =
    edge.minLuminance < DARK_EDGE_MIN_LUMINANCE
    && edge.meanLuminance < DARK_EDGE_MEAN_LUMINANCE
    && (!options.preserveChromaticDarkEdge || edge.chroma <= NEUTRAL_BLACK_MAX_CHROMA);
  if (usePureBlack) {
    return {
      buffer: await sharp({
        create: { width, height: extensionHeight, channels: 4, background: '#000000' },
      }).png().toBuffer(),
      overlap: 0,
      branch: 'black-edge',
      edge,
    };
  }

  const sampleHeight = Math.min(HERO_EXTENSION_STRIP, height);
  const overlap = Math.min(
    Math.round(HERO_EXTENSION_BLUR_SIGMA * 1.5),
    Math.floor(height / 4),
    extensionHeight,
  );
  const layerHeight = extensionHeight + overlap;
  const stretchedBlur = await sharp(source)
    .extract({ left: 0, top: height - sampleHeight, width, height: sampleHeight })
    .resize({ width, height: layerHeight, fit: 'fill' })
    .blur(HERO_EXTENSION_BLUR_SIGMA)
    .png()
    .toBuffer();
  const fadeIn = Buffer.from(`<svg width="${width}" height="${layerHeight}"><linearGradient id="a" x2="0" y2="1"><stop stop-color="black" stop-opacity="0"/><stop offset="${(overlap / layerHeight).toFixed(4)}" stop-color="black"/></linearGradient><rect width="100%" height="100%" fill="url(#a)"/></svg>`);
  const fadeOut = Buffer.from(`<svg width="${width}" height="${layerHeight}"><linearGradient id="b" x2="0" y2="1"><stop stop-color="black" stop-opacity="0"/><stop offset="${(overlap / layerHeight).toFixed(4)}" stop-color="black" stop-opacity="0"/><stop offset="${(overlap / layerHeight + 0.65 * (1 - overlap / layerHeight)).toFixed(4)}" stop-color="black" stop-opacity=".55"/><stop offset="1" stop-color="black"/></linearGradient><rect width="100%" height="100%" fill="url(#b)"/></svg>`);
  const blurred = await sharp(stretchedBlur)
    .composite([{ input: await sharp(fadeIn).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
  const flat = await sharp({
    create: { width, height: layerHeight, channels: 3, background: edge.color },
  })
    .composite([{ input: await sharp(fadeOut).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return {
    buffer: await sharp({
      create: { width, height: layerHeight, channels: 4, background: { ...edge.color, alpha: 0 } },
    }).composite([{ input: blurred }, { input: flat }]).png().toBuffer(),
    overlap,
    branch: 'blurred-edge',
    edge,
  };
}

async function renderHero(input, mode) {
  let source = await normalize(input);
  const metadata = await sharp(source).metadata();
  const width = metadata.width || 0;
  const originalHeight = metadata.height || 0;
  if (!width || !originalHeight) throw new Error('Không đọc được kích thước ảnh.');

  let sourceHeight = originalHeight;
  let trimmedFooter = null;
  if (mode === 'adaptive') {
    trimmedFooter = await findSolidBlackFooter(source, width, originalHeight);
    if (trimmedFooter) {
      source = await sharp(source)
        .extract({ left: 0, top: 0, width, height: trimmedFooter.height })
        .png()
        .toBuffer();
      sourceHeight = trimmedFooter.height;
    }
  }

  const heroHeight = Math.ceil(width / HERO_ASPECT_RATIO);
  const extensionHeight = Math.max(0, heroHeight - sourceHeight);
  let heroSource = source;
  let branch = 'cover-resize';
  let edge = null;
  if (extensionHeight === 0) {
    heroSource = await sharp(source)
      .resize({ width, height: heroHeight, fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
  } else {
    const extension = await buildExtension(source, width, sourceHeight, extensionHeight, {
      preserveChromaticDarkEdge: mode === 'adaptive',
    });
    branch = extension.branch;
    edge = extension.edge;
    heroSource = await sharp({
      create: { width, height: heroHeight, channels: 3, background: '#000000' },
    })
      .composite([
        { input: source, top: 0, left: 0 },
        { input: extension.buffer, top: sourceHeight - extension.overlap, left: 0 },
      ])
      .png()
      .toBuffer();
  }

  const outputWidth = Math.min(width, 1200);
  return {
    image: await sharp(heroSource)
      .resize({ width: outputWidth, withoutEnlargement: true })
      .webp({ quality: 84, effort: 5, smartSubsample: true })
      .toBuffer(),
    meta: {
      mode,
      source: `${width}×${originalHeight}`,
      hero: `${outputWidth}×${Math.round((outputWidth / width) * heroHeight)}`,
      branch,
      trimmedBlackFooter: trimmedFooter ? `${Math.round(trimmedFooter.ratio * 100)}%` : null,
      edgeLuminance: edge ? Math.round(edge.meanLuminance) : null,
      edgeColor: edge
        ? `#${[edge.color.r, edge.color.g, edge.color.b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
        : null,
      edgeChroma: edge ? edge.chroma : null,
    },
  };
}

const page = readFileSync(join(here, 'public', 'index.html'));
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  try {
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(page);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/render') {
      const mode = url.searchParams.get('mode') === 'adaptive' ? 'adaptive' : 'project';
      const result = await renderHero(await readBody(request), mode);
      response.writeHead(200, {
        'Content-Type': 'image/webp',
        'Cache-Control': 'no-store',
        'X-Hero-Meta': Buffer.from(JSON.stringify(result.meta)).toString('base64url'),
      });
      response.end(result.image);
      return;
    }
    response.writeHead(404).end();
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error.message || 'Không thể xử lý ảnh.' }));
  }
});

function listen(port) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < DEFAULT_PORT + 10) return listen(port + 1);
    throw error;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Hero Artwork Lab: http://127.0.0.1:${port}`);
  });
}

listen(Number(process.env.PORT || DEFAULT_PORT));
