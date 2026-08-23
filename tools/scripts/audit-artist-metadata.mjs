#!/usr/bin/env node

/**
 * Metadata reconnaissance only. It never writes to the catalog.
 *
 * Usage:
 *   node tools/scripts/audit-artist-metadata.mjs --artist "Đen Vâu" --artist "Mỹ Tâm"
 *   node tools/scripts/audit-artist-metadata.mjs --file tools/.tmp/artists.json
 *
 * The output is an ignored JSON report in tools/.tmp/. Review only `accepted`
 * matches before deciding which fields belong in the catalog schema.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const artistNames = [];

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--artist') artistNames.push(String(args[++index] || '').trim());
}

const fileIndex = args.indexOf('--file');
if (fileIndex >= 0) {
  const filename = args[fileIndex + 1];
  if (!filename) throw new Error('--file requires a JSON file containing an array of artist names');
  const entries = JSON.parse(await fs.readFile(path.resolve(root, filename), 'utf8'));
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) {
    throw new Error('--file must contain a JSON array of artist-name strings');
  }
  artistNames.push(...entries.map((entry) => entry.trim()));
}

const names = [...new Set(artistNames.filter(Boolean))];
if (!names.length) {
  throw new Error('Provide at least one --artist "Name" or --file artists.json');
}
if (names.length > 50) throw new Error('Maximum 50 artists per audit run');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/đ/giu, 'd')
  .toLowerCase()
  .replace(/[^\p{Letter}\p{Number}]/gu, '');

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function appleArtist(name) {
  const query = new URLSearchParams({ term: name, entity: 'musicArtist', country: 'vn', limit: '10' });
  const results = (await getJson(`https://itunes.apple.com/search?${query}`)).results || [];
  const exact = results.find((artist) => normalize(artist.artistName) === normalize(name));
  const artist = exact || results[0] || null;
  return artist && {
    id: String(artist.artistId),
    name: artist.artistName,
    url: artist.artistLinkUrl || '',
    primaryGenre: artist.primaryGenreName || '',
    exactName: Boolean(exact),
  };
}

async function musicBrainzArtist(name) {
  const query = new URLSearchParams({ query: `artist:"${name}"`, limit: '10', fmt: 'json' });
  const response = await getJson(
    `https://musicbrainz.org/ws/2/artist/?${query}`,
    { 'User-Agent': '404HzSeedStudio/1.0 (metadata-audit@localhost)' },
  );
  const normalized = normalize(name);
  const artist = (response.artists || []).find((candidate) =>
    normalize(candidate.name) === normalized ||
    (candidate.aliases || []).some((alias) => normalize(alias.name) === normalized),
  ) || null;
  return artist && {
    id: artist.id,
    name: artist.name,
    type: artist.type || '',
    country: artist.country || '',
    area: artist.area?.name || '',
    begin: artist['life-span']?.begin || '',
    end: artist['life-span']?.end || '',
    ended: Boolean(artist['life-span']?.ended),
    aliases: (artist.aliases || []).map((alias) => alias.name).filter(Boolean),
    tags: (artist.tags || []).map((tag) => tag.name).filter(Boolean),
    isni: artist.isnis?.[0] || '',
  };
}

function entityValue(statement) {
  return statement?.mainsnak?.datavalue?.value ?? null;
}

function entityId(statement) {
  return entityValue(statement)?.id || '';
}

function stringValues(claims, property) {
  return (claims[property] || []).map(entityValue).filter((value) => typeof value === 'string');
}

function dateValue(claims, property) {
  const value = entityValue(claims[property]?.[0]);
  return typeof value?.time === 'string' ? value.time.slice(1, 11) : '';
}

async function wikidataArtist(name, musicBrainzId) {
  const search = new URLSearchParams({ action: 'wbsearchentities', search: name, language: 'vi', format: 'json', origin: '*' });
  const results = (await getJson(`https://www.wikidata.org/w/api.php?${search}`)).search || [];
  const normalized = normalize(name);
  const exact = results.find((candidate) => normalize(candidate.label) === normalized) || null;
  if (!exact) return null;

  const payload = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${exact.id}.json`);
  const entity = payload.entities?.[exact.id];
  const claims = entity?.claims || {};
  const musicBrainzIds = stringValues(claims, 'P434');
  const musicBrainzLinked = Boolean(musicBrainzId && musicBrainzIds.includes(musicBrainzId));
  return {
    id: exact.id,
    label: exact.label,
    description: exact.description || '',
    musicBrainzLinked,
    countryIds: (claims.P27 || []).map(entityId).filter(Boolean),
    birthplaceId: entityId(claims.P19?.[0]),
    birthOrFoundedDate: dateValue(claims, 'P569') || dateValue(claims, 'P571'),
    activeFrom: dateValue(claims, 'P2031'),
    genres: (claims.P136 || []).map(entityId).filter(Boolean),
    occupations: (claims.P106 || []).map(entityId).filter(Boolean),
    imageFile: stringValues(claims, 'P18')[0] || '',
    instagram: stringValues(claims, 'P2003')[0] || '',
    commonsCategory: stringValues(claims, 'P373')[0] || '',
  };
}

function decision(apple, musicBrainz, wikidata) {
  if (!apple?.exactName) return { status: 'rejected', reason: 'Apple result is not an exact normalized name match' };
  if (musicBrainz && wikidata?.musicBrainzLinked) return { status: 'accepted', reason: 'Apple exact name + MusicBrainz ↔ Wikidata stable ID link' };
  if (musicBrainz || wikidata) return { status: 'review', reason: 'Exact name only; a human must confirm this identity before linking IDs' };
  return { status: 'unmatched', reason: 'No enrichment candidate found' };
}

const rows = [];
for (const [index, requestedName] of names.entries()) {
  process.stdout.write(`[${index + 1}/${names.length}] Auditing ${requestedName}…\n`);
  let apple = null;
  let musicBrainz = null;
  let wikidata = null;
  const errors = [];
  try { apple = await appleArtist(requestedName); } catch (error) { errors.push(`Apple: ${error.message}`); }
  await sleep(1_100); // MusicBrainz public API: max one request per second.
  try { musicBrainz = await musicBrainzArtist(apple?.name || requestedName); } catch (error) { errors.push(`MusicBrainz: ${error.message}`); }
  try { wikidata = await wikidataArtist(apple?.name || requestedName, musicBrainz?.id || ''); } catch (error) { errors.push(`Wikidata: ${error.message}`); }
  rows.push({ requestedName, apple, musicBrainz, wikidata, match: decision(apple, musicBrainz, wikidata), errors });
}

const fields = [
  ['musicBrainz', 'type'], ['musicBrainz', 'country'], ['musicBrainz', 'area'], ['musicBrainz', 'begin'],
  ['musicBrainz', 'aliases'], ['musicBrainz', 'tags'], ['wikidata', 'description'], ['wikidata', 'birthOrFoundedDate'],
  ['wikidata', 'activeFrom'], ['wikidata', 'genres'], ['wikidata', 'occupations'], ['wikidata', 'instagram'],
];
const accepted = rows.filter((row) => row.match.status === 'accepted');
const coverage = Object.fromEntries(fields.map(([source, field]) => {
  const count = accepted.filter((row) => {
    const value = row[source]?.[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;
  return [`${source}.${field}`, { count, acceptedTotal: accepted.length, percentage: accepted.length ? Math.round((count / accepted.length) * 100) : 0 }];
}));

const report = {
  generatedAt: new Date().toISOString(),
  purpose: 'Schema reconnaissance only. No catalog data was changed.',
  summary: {
    requested: rows.length,
    accepted: accepted.length,
    review: rows.filter((row) => row.match.status === 'review').length,
    unmatched: rows.filter((row) => row.match.status === 'unmatched').length,
    rejected: rows.filter((row) => row.match.status === 'rejected').length,
  },
  coverage,
  artists: rows,
};

const outputDir = path.join(root, 'tools', '.tmp');
await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(outputDir, `artist-metadata-audit-${stamp}.json`);
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`\nReport written: ${path.relative(root, output)}`);
console.log(`Accepted: ${report.summary.accepted}; review required: ${report.summary.review}; unmatched: ${report.summary.unmatched}.`);
