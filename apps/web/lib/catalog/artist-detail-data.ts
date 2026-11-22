import { getCachedQuery, invalidateCachedQueries } from "@/lib/api/query-cache";
import { getCatalogArtist, getCatalogArtistAlbums } from "./catalog.api";
import {
  getCatalogArtistSongPage,
  invalidateCatalogArtistSongPages,
} from "./artist-song-pages";
import type {
  CatalogArtistResource,
  CatalogAlbumResource,
} from "./catalog.types";
import { HOME_SHELF_PREVIEW_LIMIT } from "@musical/shared-constants";

export type CatalogArtistAlbumSectionData = {
  albums: CatalogAlbumResource[];
  artistResources: Record<string, CatalogArtistResource>;
};
export type CatalogArtistDetailOptions = {
  includeAlbums?: boolean;
  includeSongs?: boolean;
};
export type ArtistAlbumSection = "albums" | "singlesAndEps" | "appearsOn";
type ArtistAlbumOptions = NonNullable<
  Parameters<typeof getCatalogArtistAlbums>[1]
>;
const ARTIST_ALBUM_SECTION_OPTIONS: Record<
  ArtistAlbumSection,
  ArtistAlbumOptions
> = {
  albums: { releaseTypes: ["album"] },
  singlesAndEps: { releaseTypes: ["single", "ep"] },
  appearsOn: { section: "appears-on" },
};
export const EMPTY_ALBUM_SECTIONS: Record<
  ArtistAlbumSection,
  CatalogArtistAlbumSectionData
> = {
  albums: { albums: [], artistResources: {} },
  singlesAndEps: { albums: [], artistResources: {} },
  appearsOn: { albums: [], artistResources: {} },
};
const ARTIST_ALBUM_PREVIEW_FETCH_LIMIT = HOME_SHELF_PREVIEW_LIMIT + 1;

function byNewestRelease(
  left: CatalogAlbumResource,
  right: CatalogAlbumResource,
) {
  return (
    (Date.parse(right.attributes.releaseDate) || 0) -
    (Date.parse(left.attributes.releaseDate) || 0)
  );
}

function artistAlbumCachePrefix(artistId: string) {
  return `catalog:artist-albums:${encodeURIComponent(artistId)}:`;
}

export function getCatalogArtistAlbumSection(
  artistId: string,
  section: ArtistAlbumSection,
  preview = false,
) {
  const options = {
    ...ARTIST_ALBUM_SECTION_OPTIONS[section],
    ...(preview ? { limit: ARTIST_ALBUM_PREVIEW_FETCH_LIMIT } : {}),
  };
  return getCachedQuery(
    `${artistAlbumCachePrefix(artistId)}${section}:${preview ? "preview" : "all"}`,
    async (signal) => {
      const response = await getCatalogArtistAlbums(artistId, options, signal);
      return {
        albums: Object.values(response.resources.albums).sort(byNewestRelease),
        artistResources: response.resources.artists,
      };
    },
  );
}

export function artistDetailCacheKey(
  artistId: string,
  {
    includeAlbums = true,
    includeSongs = true,
  }: CatalogArtistDetailOptions = {},
) {
  return `catalog:artist-detail:${encodeURIComponent(artistId)}:${includeAlbums}:${includeSongs}`;
}
export async function getCatalogArtistDetailData(
  artistId: string,
  {
    includeAlbums = true,
    includeSongs = true,
  }: CatalogArtistDetailOptions = {},
  signal?: AbortSignal,
) {
  const [artistCatalog, songPage, albumLists] = await Promise.all([
    getCatalogArtist(artistId, signal),
    includeSongs ? getCatalogArtistSongPage(artistId) : Promise.resolve(null),
    includeAlbums
      ? Promise.all(
          (
            Object.keys(ARTIST_ALBUM_SECTION_OPTIONS) as ArtistAlbumSection[]
          ).map((section) =>
            getCatalogArtistAlbumSection(artistId, section, true),
          ),
        )
      : Promise.resolve(null),
  ]);
  const albumSections = albumLists
    ? {
        albums: albumLists[0],
        singlesAndEps: albumLists[1],
        appearsOn: albumLists[2],
      }
    : EMPTY_ALBUM_SECTIONS;
  return {
    artistDetail: artistCatalog.resources.artists[artistId] ?? null,
    albumList: [
      ...albumSections.albums.albums,
      ...albumSections.singlesAndEps.albums,
    ].sort(byNewestRelease),
    albumSections,
    songList: songPage?.songs ?? [],
  };
}
export function invalidateCatalogArtistDetailData(artistId: string) {
  invalidateCachedQueries(
    `catalog:artist-detail:${encodeURIComponent(artistId)}:`,
  );
  invalidateCachedQueries(artistAlbumCachePrefix(artistId));
  invalidateCatalogArtistSongPages(artistId);
}
