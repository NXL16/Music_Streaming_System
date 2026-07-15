export function albumRoute(albumUrl: string, albumId: string) {
  return `/album/${encodeURIComponent(albumUrl)}/${encodeURIComponent(albumId)}`;
}
