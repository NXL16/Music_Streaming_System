import { http } from '@/lib/api/http';
import { notifyHomeRecommendationsStale } from '@/lib/recommendations/home-revalidation';
import { notifyArtistFollowChanged } from './artist-follow-events';

type ArtistFollowResponse = {
  success: boolean;
  isFollowed: boolean;
  changed?: boolean;
};

const endpoint = (artistId: string) =>
  `/me/recommendations/artists/${encodeURIComponent(artistId)}/follow`;

export async function getArtistFollow(artistId: string): Promise<boolean> {
  const response = await http.get<ArtistFollowResponse>(endpoint(artistId));
  return response.data.isFollowed;
}

export async function setArtistFollow(
  artistId: string,
  isFollowed: boolean,
): Promise<boolean> {
  notifyArtistFollowChanged(artistId, isFollowed);
  try {
    const response = await http.request<ArtistFollowResponse>({
      url: endpoint(artistId),
      method: isFollowed ? 'POST' : 'DELETE',
    });
    if (response.data.isFollowed !== isFollowed) {
      notifyArtistFollowChanged(artistId, response.data.isFollowed);
    }
    notifyHomeRecommendationsStale();
    return response.data.isFollowed;
  } catch (error) {
    notifyArtistFollowChanged(artistId, !isFollowed);
    throw error;
  }
}
