import { routeSlug } from "@/lib/catalog/route-slug";

export function stationRoute(name: string, stationId: string) {
  return `/station/${encodeURIComponent(routeSlug(name, "station"))}/${encodeURIComponent(stationId)}`;
}
