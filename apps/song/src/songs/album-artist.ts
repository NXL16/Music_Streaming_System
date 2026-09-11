export type AlbumArtistNameSource = {
  artistName: string;
  artistCredits?: ReadonlyArray<{
    isPrimary: boolean;
    position?: number;
    artist: { name: string };
  }>;
};

/** One display rule for album ownership across Catalog and Song projections. */
export function albumPrimaryArtistName(album: AlbumArtistNameSource): string {
  const names = (album.artistCredits ?? [])
    .filter((credit) => credit.isPrimary)
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .map((credit) => credit.artist.name)
    .filter(Boolean);

  return names.join(', ') || album.artistName;
}
