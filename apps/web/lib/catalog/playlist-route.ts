export function playlistRoute(playlistUrl: string, playlistId: string) {
  const value = playlistUrl.trim();
  const routeSegments = value.split("/").filter(Boolean);
  const playlistSegment = routeSegments.lastIndexOf("playlist");
  const extractedSlug =
    playlistSegment >= 0
      ? routeSegments[playlistSegment + 1] || "playlist"
      : value || "playlist";
  return `/playlist/${encodeURIComponent(extractedSlug)}/${encodeURIComponent(playlistId)}`;
}
