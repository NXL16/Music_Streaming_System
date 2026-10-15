import { http } from "@/lib/api/http";

const STOREFRONT = process.env.NEXT_PUBLIC_STOREFRONT || "vn";

export type CatalogMusicVideo = {
  id: string;
  songId: string;
  videoAssetId: string;
  kind: string;
  posterUrl: string;
  posterSrcSet: string;
  posterBgColor: string;
  durationMillis: number;
  width: number;
  height: number;
  publishedAt: string;
  songTitle: string;
  artistName: string;
  songArtwork?: {
    url: string;
    bgColor: string;
    textColor1: string;
    textColor2: string;
    textColor3: string;
    textColor4: string;
    width: number;
    height: number;
  };
  albumName: string;
  releaseDate: string;
  contentRating: string;
  genreNames: string[];
  releaseTrackId: string;
  artists: Array<{
    artistId: string;
    name: string;
    url: string;
    role: string;
    position: number;
    isPrimary: boolean;
  }>;
};

export type CatalogMusicVideoPage = {
  videos: CatalogMusicVideo[];
  nextCursor: string;
};

type CatalogMusicVideosResponse = CatalogMusicVideoPage;

export type MusicVideoCatalogResourceType = "albums" | "artists" | "songs";

function normalizePosterBgColor(color: string | undefined): string {
  const value = color?.replace(/^#/, "").trim();
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : "#2c2c2e";
}

function normalizeMusicVideo(video: CatalogMusicVideo): CatalogMusicVideo {
  return {
    ...video,
    posterBgColor: normalizePosterBgColor(video.posterBgColor),
  };
}

function normalizeMusicVideoPage(
  page: CatalogMusicVideoPage,
): CatalogMusicVideoPage {
  return {
    ...page,
    videos: page.videos.map(normalizeMusicVideo),
  };
}

export async function getCatalogSongMusicVideos(
  songId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogMusicVideosResponse>(
    `/catalog/${STOREFRONT}/songs/${encodeURIComponent(songId)}/videos`,
    { signal },
  );
  return normalizeMusicVideoPage(response.data).videos;
}

export async function getCatalogAlbumMusicVideos(
  albumId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogMusicVideosResponse>(
    `/catalog/${STOREFRONT}/albums/${encodeURIComponent(albumId)}/music-videos`,
    { signal },
  );
  return normalizeMusicVideoPage(response.data).videos;
}

export async function getCatalogArtistMusicVideos(
  artistId: string,
  signal?: AbortSignal,
) {
  const page = await getCatalogArtistMusicVideoPage(
    artistId,
    { limit: 100 },
    signal,
  );
  return page.videos;
}

export async function getCatalogArtistMusicVideoPage(
  artistId: string,
  options: { limit?: number; cursor?: string },
  signal?: AbortSignal,
): Promise<CatalogMusicVideoPage> {
  const response = await http.get<CatalogMusicVideosResponse>(
    `/catalog/${STOREFRONT}/artists/${encodeURIComponent(artistId)}/music-videos`,
    { params: options, signal },
  );
  return normalizeMusicVideoPage(response.data);
}

export function getCatalogMusicVideos(
  resourceType: MusicVideoCatalogResourceType,
  resourceId: string,
  signal?: AbortSignal,
) {
  switch (resourceType) {
    case "albums":
      return getCatalogAlbumMusicVideos(resourceId, signal);
    case "artists":
      return getCatalogArtistMusicVideos(resourceId, signal);
    case "songs":
      return getCatalogSongMusicVideos(resourceId, signal);
  }
}

export async function getCatalogMusicVideo(
  songVideoId: string,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogMusicVideo>(
    `/catalog/${STOREFRONT}/music-videos/${encodeURIComponent(songVideoId)}`,
    { signal },
  );
  return normalizeMusicVideo(response.data);
}

export async function getCatalogRelatedMusicVideos(
  songVideoId: string,
  limit: number,
  signal?: AbortSignal,
) {
  const response = await http.get<CatalogMusicVideosResponse>(
    `/catalog/${STOREFRONT}/music-videos/${encodeURIComponent(songVideoId)}/recommendations`,
    { params: { limit }, signal },
  );
  return normalizeMusicVideoPage(response.data).videos;
}
