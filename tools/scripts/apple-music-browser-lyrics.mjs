import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const require = createRequire(join(root, 'tools', 'seed-studio', 'package.json'));
const { chromium } = require('playwright-core');
const profileDir = join(root, 'tools', 'seed-studio', '.tmp', 'apple-music-profile');
const chromePaths = [
  process.env.APPLE_MUSIC_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

let context;
let page;
let hasOpenedLyricsDialog = false;

export class AppleMusicStaticLyricsUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppleMusicStaticLyricsUnavailableError';
  }
}

class AppleMusicTrackNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AppleMusicTrackNotFoundError';
  }
}

function appleSongSlug(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'song';
}

function normalizedAppleText(value) {
  return appleSongSlug(value).replace(/-/g, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveCurrentAppleTrack({ title, artistName, trackId }) {
  const term = [title, artistName].filter(Boolean).join(' ');
  if (!term) return null;

  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&country=vn&limit=25`,
  );
  if (!response.ok) return null;

  const expectedTitle = normalizedAppleText(title);
  const expectedArtist = normalizedAppleText(artistName);
  const matches = (await response.json()).results || [];
  const exactTitleMatches = matches.filter(
    (result) =>
      result.wrapperType === 'track' &&
      normalizedAppleText(result.trackName) === expectedTitle &&
      String(result.trackId || '') !== trackId,
  );
  const artistMatch = exactTitleMatches.find((result) =>
    !expectedArtist || normalizedAppleText(result.artistName).includes(expectedArtist),
  );
  const result = artistMatch || exactTitleMatches[0];
  if (!result?.trackId || !result?.trackName) return null;

  return {
    trackId: String(result.trackId),
    trackName: String(result.trackName),
  };
}

function chromePath() {
  return chromePaths.find((candidate) => existsSync(candidate)) || '';
}

async function browserPage(log) {
  if (page && !page.isClosed()) return page;
  const executablePath = chromePath();
  if (!executablePath) {
    throw new Error('Chrome was not found. Set APPLE_MUSIC_CHROME_PATH to chrome.exe.');
  }

  mkdirSync(profileDir, { recursive: true });
  log('Opening Chrome for Apple Music. Sign in manually if prompted; Seed Studio never reads your password.');
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  page = context.pages()[0] || (await context.newPage());
  return page;
}

async function openFullLyrics(tab) {
  const button = tab
    .locator('button, a, [role="button"]')
    .filter({ hasText: /view full lyrics|full lyrics/i })
    .first();

  const timeout = hasOpenedLyricsDialog ? 15_000 : 5 * 60_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 10_000 });
      hasOpenedLyricsDialog = true;
      return;
    }

    const hasNoLyrics = await tab.evaluate(() => {
      const pageText = document.body?.innerText || '';
      if (pageText.includes("The page you're looking for can't be found.")) {
        return 'not-found';
      }
      const lines = pageText
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase());
      const hasLyricsSection = lines.includes('lyrics');
      const hasSongDetails = lines.some((line) =>
        ['performing artists', 'composition & lyrics', 'production & engineering'].includes(line),
      );
      return hasSongDetails && !hasLyricsSection ? 'unavailable' : '';
    }).catch(() => false);
    if (hasNoLyrics === 'not-found') {
      throw new AppleMusicTrackNotFoundError(
        'Apple Music no longer resolves this track ID.',
      );
    }
    if (hasNoLyrics === 'unavailable') {
      throw new AppleMusicStaticLyricsUnavailableError(
        'Apple Music does not provide static lyrics for this song.',
      );
    }

    await tab.waitForTimeout(300);
  }

  throw new Error('Apple Music full lyrics control did not appear before timeout.');
}

function classNames(node) {
  const attributes = node.attributes || [];
  const classIndex = attributes.findIndex((attribute) => attribute === 'class');
  return classIndex === -1 ? '' : attributes[classIndex + 1] || '';
}

function textContent(node) {
  if (node.nodeType === 3) return node.nodeValue || '';
  return [...(node.children || []), ...(node.shadowRoots || [])]
    .map((child) => textContent(child))
    .join('');
}

function descendantWithClass(node, className) {
  if (classNames(node).split(/\s+/).includes(className)) return node;
  for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
    const match = descendantWithClass(child, className);
    if (match) return match;
  }
  return undefined;
}

function hasClassMatching(node, predicate) {
  return classNames(node)
    .split(/\s+/)
    .some((className) => predicate(className));
}

function normalizeLyricLines(lines) {
  const normalized = [];
  for (const line of lines) {
    const text = String(line?.text || '').replace(/\r\n?/g, '\n').trim();
    if (!text) continue;
    const vocalistType = line?.vocalistType === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY';
    const previous = normalized.at(-1);
    if (previous?.text === text && previous.vocalistType === vocalistType) continue;
    normalized.push({ text, vocalistType });
  }
  return normalized;
}

async function readStaticLinesViaCdp(tab) {
  for (const browserPage of tab.context().pages()) {
    if (browserPage.isClosed()) continue;
    const client = await tab.context().newCDPSession(browserPage);
    try {
      const { root: documentRoot } = await client.send('DOM.getDocument', {
        depth: -1,
        pierce: true,
      });
      const lines = [];
      const visit = (node) => {
        if (classNames(node).split(/\s+/).includes('static-line')) {
          const secondary = descendantWithClass(node, 'secondary-vocalist');
          const vocalist = secondary || descendantWithClass(node, 'primary-vocalist') || node;
          const text = textContent(vocalist).replace(/\r\n?/g, '\n').trim();
          if (text) lines.push({ text, vocalistType: secondary ? 'SECONDARY' : 'PRIMARY' });
        }
        for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) visit(child);
      };
      visit(documentRoot);
      if (lines.length) return normalizeLyricLines(lines);
    } finally {
      await client.detach().catch(() => undefined);
    }
  }
  return [];
}

async function readPlayerLyricsViaCdp(tab) {
  for (const browserPage of tab.context().pages()) {
    if (browserPage.isClosed()) continue;
    const client = await tab.context().newCDPSession(browserPage);
    try {
      const { root: documentRoot } = await client.send('DOM.getDocument', {
        depth: -1,
        pierce: true,
      });
      const lines = [];
      const visit = (node) => {
        const isStaticLine = hasClassMatching(node, (className) => className === 'static-line');
        const isPlayerLyricLine = hasClassMatching(
          node,
          (className) =>
            /(?:^|[-_])lyrics?[-_]?line(?:$|[-_])|(?:^|[-_])line[-_]?lyrics?(?:$|[-_])/i.test(className),
        );
        if (isStaticLine || isPlayerLyricLine) {
          const secondary = descendantWithClass(node, 'secondary-vocalist');
          const vocalist = secondary || descendantWithClass(node, 'primary-vocalist') || node;
          lines.push({
            text: textContent(vocalist),
            vocalistType: secondary ? 'SECONDARY' : 'PRIMARY',
          });
        }
        for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) visit(child);
      };
      visit(documentRoot);
      const normalized = normalizeLyricLines(lines);
      if (normalized.length) return normalized;
    } finally {
      await client.detach().catch(() => undefined);
    }
  }
  return [];
}

async function openPlayerLyricsPanel(tab) {
  const lyricsControls = [
    tab.locator('button.lyrics__button[aria-label="Lyrics"]'),
    tab.locator(
      'button[aria-label*="lyrics" i][aria-expanded], button[title*="lyrics" i][aria-expanded], [role="button"][aria-label*="lyrics" i][aria-expanded], [data-testid*="lyrics" i][aria-expanded]',
    ),
  ];

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const control of lyricsControls) {
      const button = control.first();
      if (!(await button.isVisible().catch(() => false))) continue;
      try {
        if ((await button.getAttribute('aria-expanded')) === 'true') return true;
        await button.click({ timeout: 10_000 });
        return true;
      } catch {
        // Apple Music replaces player controls while changing playback state. Try the
        // next accessible selector rather than retrying a detached control.
      }
    }
    await tab.waitForTimeout(300);
  }

  return false;
}

async function readPlayerLyricsAfterPlayback(tab, title, log) {
  // Apple Music often renders the song-header control a moment after the
  // credits section. Wait for the page before trying the player fallback.
  log('Waiting 5s for Apple Music song controls before starting playback.');
  await tab.waitForTimeout(5_000);

  const songPlayButtons = [
    // In the signed-in Apple Music layout this is the single play button
    // beside the artwork. Its aria-label is often present but empty, so it
    // must not be part of the selector.
    tab.locator('button[data-testid="click-action"]'),
    tab.getByLabel(new RegExp(`^Play\\s+${escapeRegExp(title)}$`, 'i')),
  ];
  try {
    const deadline = Date.now() + 15_000;
    let clicked = false;
    while (!clicked && Date.now() < deadline) {
      for (const control of songPlayButtons) {
        const songPlayButton = control.first();
        if (!(await songPlayButton.isVisible().catch(() => false))) continue;
        if (await songPlayButton.isDisabled().catch(() => true)) continue;
        await songPlayButton.click({ timeout: 10_000 });
        clicked = true;
        break;
      }
      if (!clicked) await tab.waitForTimeout(300);
    }
    if (!clicked) {
      log(`Apple Music Play control was not available for "${title}".`);
      return [];
    }
    log('Started Apple Music playback from the song page.');
  } catch {
    // The player can be unavailable for songs Apple cannot play in this session.
    // Treat it like a song without player lyrics instead of failing the whole seed job.
    return [];
  }

  log('Waiting 3s for playback before opening the player lyrics panel.');
  await tab.waitForTimeout(3_000);

  if (!(await openPlayerLyricsPanel(tab))) {
    log('Apple Music player lyrics control was not available for this song.');
    return [];
  }
  log('Opened Apple Music player lyrics panel.');

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const lines = await readPlayerLyricsViaCdp(tab);
    if (lines.length) return lines;
    await tab.waitForTimeout(500);
  }
  return [];
}

async function findStaticLyrics(tab) {
  const deadline = Date.now() + 60_000;
  let nextCdpReadAt = 0;

  while (Date.now() < deadline) {
    for (const browserPage of tab.context().pages()) {
      if (browserPage.isClosed()) continue;
      for (const frame of browserPage.frames()) {
        try {
          const hasStaticLines = await frame.evaluate(() => {
            const roots = [document];
            const visitRoot = (root) => {
              for (const element of root.querySelectorAll('*')) {
                if (!element.shadowRoot) continue;
                roots.push(element.shadowRoot);
                visitRoot(element.shadowRoot);
              }
            };
            visitRoot(document);
            return roots.some((root) => root.querySelector('.static-line'));
          });
          if (hasStaticLines) return { frame };
        } catch {
          // A frame can disappear while Apple is opening or closing its modal.
        }
      }
    }

    // Check closed shadow roots at a bounded interval while the modal loads.
    if (Date.now() >= nextCdpReadAt) {
      const cdpLines = await readStaticLinesViaCdp(tab);
      if (cdpLines.length) return { lines: cdpLines };
      nextCdpReadAt = Date.now() + 2_000;
    }
    await tab.waitForTimeout(300);
  }

  // Apple can place the modal in a closed shadow root. Make one final CDP
  // check in case the tree became stable during the last polling interval.
  const cdpLines = await readStaticLinesViaCdp(tab);
  if (cdpLines.length) return { lines: cdpLines };

  throw new Error('Apple Music did not render .static-line within 60 seconds.');
}

async function renderedStaticLines(tab) {
  return tab.evaluate(() => {
    // Apple Music renders each static lyric line in this confirmed DOM shape:
    // .static-line > .primary-vocalist|.secondary-vocalist[dir="auto"]
    const roots = [document];
    const visitRoot = (root) => {
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue;
        roots.push(element.shadowRoot);
        visitRoot(element.shadowRoot);
      }
    };
    visitRoot(document);
    const staticLines = roots.flatMap((root) => [...root.querySelectorAll('.static-line')]);
    if (!staticLines.length) return [];

    return staticLines.flatMap((element) => {
      const secondaryVocalist = element.querySelector('.secondary-vocalist');
      const vocalist = secondaryVocalist || element.querySelector('.primary-vocalist') || element;
      const text = (vocalist.innerText || '').replace(/\r\n?/g, '\n').trim();
      if (!text) return [];
      return [{ text, vocalistType: secondaryVocalist ? 'SECONDARY' : 'PRIMARY' }];
    });
  });
}

/** Reads only the full lyrics already rendered for the user's Apple Music session. */
export async function fetchAppleMusicBrowserStaticLyrics(track, { log }) {
  let songId = String(track?.trackId || '').trim();
  let title = String(track?.trackName || track?.title || '').trim();
  const artistName = String(track?.artistName || '').trim();
  if (!songId || !title) return [];

  const tab = await browserPage(log);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await tab.goto(`https://music.apple.com/vn/song/${encodeURIComponent(appleSongSlug(title))}/${encodeURIComponent(songId)}`, {
      waitUntil: 'commit',
      timeout: 5 * 60_000,
    });
    try {
      await openFullLyrics(tab);
    } catch (error) {
      if (error instanceof AppleMusicStaticLyricsUnavailableError) {
        const playerLines = await readPlayerLyricsAfterPlayback(tab, title, log);
        if (playerLines.length) {
          log(`Apple Music player provided ${playerLines.length} lyric line(s) for "${title}".`);
          return playerLines;
        }
        throw error;
      }
      if (!(error instanceof AppleMusicTrackNotFoundError) || attempt > 0) {
        throw error;
      }
      const resolved = await resolveCurrentAppleTrack({
        title,
        artistName,
        trackId: songId,
      });
      if (!resolved) throw error;
      log(`Apple track ID ${songId} is stale; using current ID ${resolved.trackId} for "${title}".`);
      songId = resolved.trackId;
      title = resolved.trackName;
      continue;
    }

    const staticLyrics = await findStaticLyrics(tab);
    const lines = staticLyrics.lines || (await renderedStaticLines(staticLyrics.frame));
    if (!lines.length) {
      throw new Error(`No full static lyric was rendered for "${title}". Check the Apple Music account and retry.`);
    }
    return lines;
  }

  throw new Error(`Could not resolve a current Apple Music track for "${title}".`);
}

export async function closeAppleMusicBrowser() {
  const activeContext = context;
  context = undefined;
  page = undefined;
  hasOpenedLyricsDialog = false;
  await activeContext?.close();
}
