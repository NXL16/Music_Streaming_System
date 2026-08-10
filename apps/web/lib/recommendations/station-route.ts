function slugifyStationName(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "station";
}

export function stationRoute(name: string, stationId: string) {
  return `/station/${encodeURIComponent(slugifyStationName(name))}/${encodeURIComponent(stationId)}`;
}
