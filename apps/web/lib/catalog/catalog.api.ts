import { http } from "@/lib/api/http";
import type {
  CatalogArtistSongsPage,
  CatalogReference,
  CatalogResponse,
} from "./catalog.types";

const STOREFRONT = process.env.NEXT_PUBLIC_STOREFRONT || "vn";

export async function getCatalogAlbum(
  albumId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/albums/${encodeURIComponent(albumId)}`,
    { signal },
  );
  return response.data;
}

export async function getCatalogPlaylist(
  playlistId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/playlists/${encodeURIComponent(playlistId)}`,
    { signal },
  );
  return response.data;
}

export async function getCatalogPlaylistTracks(
  playlistId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/playlists/${encodeURIComponent(playlistId)}/tracks`,
    { signal },
  );
  return response.data;
}

export async function getCatalogResources(
  resources: Array<Pick<CatalogReference, "id" | "type">>,
  signal?: AbortSignal,
) {
  const response = await http.post<CatalogResponse>(
    `/catalog/${STOREFRONT}/resources`,
    { resources },
    { signal },
  );
  return response.data;
}

export async function getCatalogArtist(
  artistId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}`,
    { signal },
  );
  return response.data;
}

export async function getCatalogArtistAlbums(
  artistId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogResponse>(
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}/albums`,
    { signal },
  );
  return response.data;
}

export async function getCatalogArtistSongs(
  artistId: string,
  {
    cursor,
    limit = 20,
    signal,
  }: {
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  } = {},
) {
  const response = await http.get<CatalogArtistSongsPage>(
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}/songs`,
    {
      params: {
        ...(cursor ? { cursor } : {}),
        limit,
      },
      signal,
    },
  );
  return response.data;
}
