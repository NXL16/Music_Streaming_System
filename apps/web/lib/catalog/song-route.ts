export function songRoute(songId: string) {
  return `/song/${encodeURIComponent(songId)}`;
}
