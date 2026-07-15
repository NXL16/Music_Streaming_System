export function artistRoute(artistUrl: string, artistId: string) {
  return `/artist/${encodeURIComponent(artistUrl)}/${encodeURIComponent(
    artistId,
  )}`;
}

export function artistTopSongsRoute(artistUrl: string, artistId: string) {
  return `${artistRoute(artistUrl, artistId)}/top-songs`;
}
