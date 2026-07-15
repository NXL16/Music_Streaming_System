import { getCatalogResources } from "./catalog.api";
import { mapCatalogTracks } from "./catalog.mapper";

/**
 * Loads songs with the related artist and album resources required to build
 * complete player/UI models (names, routes, artwork and album metadata).
 */
export async function loadCatalogTracks(
  songIds: string[],
  signal?: AbortSignal,
) {
  const uniqueSongIds = [...new Set(songIds.filter(Boolean))];
  if (!uniqueSongIds.length) return [];

  const catalog = await getCatalogResources(
    uniqueSongIds.map((id) => ({ id, type: "songs" })),
    signal,
  );
  const artistIds = new Set<string>();
  const albumIds = new Set<string>();

  for (const song of Object.values(catalog.resources.songs)) {
    for (const artist of song.relationships.artists?.data ?? []) {
      artistIds.add(artist.id);
    }
    for (const album of song.relationships.albums?.data ?? []) {
      albumIds.add(album.id);
    }
  }

  const relationResources = [
    ...[...artistIds]
      .filter((id) => !catalog.resources.artists[id])
      .map((id) => ({ id, type: "artists" })),
    ...[...albumIds]
      .filter((id) => !catalog.resources.albums[id])
      .map((id) => ({ id, type: "albums" })),
  ];
  if (!relationResources.length) return mapCatalogTracks(catalog);

  const relatedCatalog = await getCatalogResources(relationResources, signal);
  return mapCatalogTracks({
    ...catalog,
    resources: {
      ...catalog.resources,
      artists: {
        ...catalog.resources.artists,
        ...relatedCatalog.resources.artists,
      },
      albums: {
        ...catalog.resources.albums,
        ...relatedCatalog.resources.albums,
      },
    },
  });
}
