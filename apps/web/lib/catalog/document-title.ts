const APP_BRAND_TITLE = "404hz Melodies";

function withBrandSuffix(value: string) {
  return `${value} - ${APP_BRAND_TITLE}`;
}

export function formatAlbumDocumentTitle(options: {
  name?: string | null;
  artistName?: string | null;
  releaseType?: "album" | "ep" | "single" | string | null;
}): string | null {
  const rawName = options.name?.trim();
  if (!rawName) return null;

  const lower = rawName.toLowerCase();
  let displayTitle = rawName;
  if (options.releaseType === "single" && !lower.endsWith("- single")) {
    displayTitle = `${rawName} - Single`;
  } else if (options.releaseType === "ep" && !lower.endsWith("- ep")) {
    displayTitle = `${rawName} - EP`;
  }

  const artist = options.artistName?.trim();
  return withBrandSuffix(
    artist ? `${displayTitle} - Album by ${artist}` : displayTitle,
  );
}

export function formatPlaylistDocumentTitle(
  name?: string | null,
): string | null {
  const trimmed = name?.trim();
  return trimmed ? withBrandSuffix(`${trimmed} - Playlist`) : null;
}

export function formatSongDocumentTitle(options: {
  title?: string | null;
  artistName?: string | null;
}): string | null {
  const title = options.title?.trim();
  if (!title) return null;

  const artist = options.artistName?.trim();
  return withBrandSuffix(
    artist ? `${title} - Song with Lyric by ${artist}` : title,
  );
}

export function formatArtistDocumentTitle(
  name?: string | null,
): string | null {
  const trimmed = name?.trim();
  return trimmed ? withBrandSuffix(trimmed) : null;
}
