const MIN_ARTISTS = 4;
const MAX_ARTISTS = 7;
const MAX_DESCRIPTION_LENGTH = 88;

/**
 * Builds the compact artist line used on system-playlist hero cards.
 * Each song contributes only its credited primary artist so a collaboration
 * cannot consume the whole card, and the result always fits the metadata box.
 */
export function systemPlaylistArtistPreview(
  artistNames: Iterable<string>,
): string {
  const artists: string[] = [];
  const seen = new Set<string>();

  for (const artistName of artistNames) {
    const primaryArtist = artistName
      .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b)\s*/i)[0]
      ?.trim();
    const identity = primaryArtist?.toLowerCase();
    if (!primaryArtist || !identity || seen.has(identity)) continue;

    const next = [...artists, primaryArtist].join(', ');
    if (artists.length >= MIN_ARTISTS && next.length > MAX_DESCRIPTION_LENGTH) {
      break;
    }

    artists.push(primaryArtist);
    seen.add(identity);
    if (artists.length === MAX_ARTISTS) break;
  }

  return artists.length ? `${artists.join(', ')} and more` : '';
}
