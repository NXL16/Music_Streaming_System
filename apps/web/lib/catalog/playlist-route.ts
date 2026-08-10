export function playlistRoute(playlistUrl: string, playlistId: string) {
  const value = playlistUrl.trim();
  const routeSegments = value.split("/").filter(Boolean);
  const playlistSegment = routeSegments.lastIndexOf("playlist");
  const extractedSlug =
    playlistSegment >= 0
      ? routeSegments[playlistSegment + 1] || "playlist"
      : value || "playlist";
  const slug = extractedSlug.startsWith("daily-mix-")
    ? "daily-mix"
    : extractedSlug;
  return `/playlist/${encodeURIComponent(slug)}/${encodeURIComponent(playlistId)}`;
}
