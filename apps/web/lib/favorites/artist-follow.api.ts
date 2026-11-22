import { http } from "@/lib/api/http";
import { notifyHomeRecommendationsStale } from "@/lib/recommendations/home-revalidation";
import {
  notifyArtistFollowChanged,
  subscribeArtistFollowChanges,
} from "./artist-follow-events";
import {
  getCachedQuery,
  getCachedQuerySnapshot,
  invalidateCachedQuery,
} from "@/lib/api/query-cache";
import { getCatalogResources } from "@/lib/catalog/catalog.api";
import type { CatalogArtwork } from "@/lib/catalog/catalog.types";

export type FollowedArtist = {
  id: string;
  name: string;
  url: string;
  artwork?: CatalogArtwork;
};

const FOLLOWED_ARTISTS_KEY = "artists:followed";
const FOLLOWED_ARTIST_IDS_KEY = "artists:followed:ids";
if (typeof window !== "undefined") {
  subscribeArtistFollowChanges(({ pending }) => {
    if (!pending) {
      invalidateCachedQuery(FOLLOWED_ARTIST_IDS_KEY);
      invalidateCachedQuery(FOLLOWED_ARTISTS_KEY);
    }
  });
}

function getFollowedArtistIds(): Promise<Set<string>> {
  return getCachedQuery(
    FOLLOWED_ARTIST_IDS_KEY,
    async (signal) => {
      const { data } = await http.get<{ artists: Array<{ artistId: string }> }>(
        "/me/recommendations/artists/followed",
        { signal },
      );
      return new Set(data.artists.map(({ artistId }) => artistId));
    },
    120_000,
  );
}

export function getFollowedArtists(): Promise<FollowedArtist[]> {
  return getCachedQuery(
    FOLLOWED_ARTISTS_KEY,
    async (signal) => {
      const ids = [...(await getFollowedArtistIds())];
      if (!ids.length) return [];
      const artists: FollowedArtist[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const entries = ids.slice(offset, offset + 100);
        const response = await getCatalogResources(
          entries.map((id) => ({ id, type: "artists" })),
          signal,
        );
        for (const id of entries) {
          const artist = response.resources.artists[id];
          if (artist)
            artists.push({
              id: artist.id,
              name: artist.attributes.name,
              url: artist.attributes.url,
              artwork: artist.attributes.artwork,
            });
        }
      }
      return artists;
    },
    120_000,
  );
}

export function getFollowedArtistsSnapshot() {
  return getCachedQuerySnapshot<FollowedArtist[]>(FOLLOWED_ARTISTS_KEY);
}

type ArtistFollowResponse = {
  success: boolean;
  isFollowed: boolean;
  changed?: boolean;
};

const endpoint = (artistId: string) =>
  `/me/recommendations/artists/${encodeURIComponent(artistId)}/follow`;

export async function getArtistFollow(artistId: string): Promise<boolean> {
  return (await getFollowedArtistIds()).has(artistId);
}

export async function setArtistFollow(
  artistId: string,
  isFollowed: boolean,
): Promise<boolean> {
  notifyArtistFollowChanged(artistId, isFollowed, true);
  try {
    const response = await http.request<ArtistFollowResponse>({
      url: endpoint(artistId),
      method: isFollowed ? "POST" : "DELETE",
    });
    notifyArtistFollowChanged(artistId, response.data.isFollowed);
    notifyHomeRecommendationsStale();
    return response.data.isFollowed;
  } catch (error) {
    notifyArtistFollowChanged(artistId, !isFollowed);
    throw error;
  }
}
