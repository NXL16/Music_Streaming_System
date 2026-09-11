import type { MediaCardProps } from "@/lib/media/media-card.types";
import { playCatalogMusicVideo } from "./play-catalog-music-video";
import { projectLinkedArtists } from "@/lib/media/project-linked-artists";
import { musicVideoRoute } from "./music-video-route";
import type { CatalogMusicVideo } from "./music-videos.api";

const ARTWORK_PLACEHOLDER_SRC = "/assets/artwork/1x1.gif";

function videoKindLabel(kind: string) {
  if (kind.toLowerCase() === "lyric") return "Lyric Video";
  if (kind.toLowerCase() === "live") return "Live";
  return "Official Music Video";
}

export function mapCatalogMusicVideoCards(
  videos: CatalogMusicVideo[],
  options: {
    artistShelf: boolean;
  },
): MediaCardProps[] {
  return videos.map((video) => {
    const href = musicVideoRoute(video.songTitle, video.id);
    const releaseYear =
      video.publishedAt.slice(0, 4) || video.releaseDate.slice(0, 4);
    return {
      id: `music-video-${video.id}`,
      resourceId: video.id,
      resourceType: "music-videos",
      cardType: "collection",
      title: video.songTitle,
      subtitle: options.artistShelf
        ? releaseYear
        : video.artistName || videoKindLabel(video.kind),
      contentRating:
        video.contentRating.toLowerCase() === "explicit" ? "explicit" : "clean",
      ...(options.artistShelf
        ? {}
        : {
            artists: projectLinkedArtists(
              video.artists.map(({ artistId, name, url }) => ({
                id: artistId,
                name,
                url,
              })),
            ),
          }),
      imageUrl: ARTWORK_PLACEHOLDER_SRC,
      imageSrcSet: video.posterSrcSet || video.posterUrl,
      artworkAspectRatio: "1.7777777777777777",
      altText: `${videoKindLabel(video.kind)}: ${video.songTitle}`,
      artworkColors: { bg: "#2c2c2e", main: "#2c2c2e" },
      slug: href,
      // A Music Video plays in the shared player; navigation stays distinct.
      onPlay: () => void playCatalogMusicVideo(video),
      menuContext: {
        kind: "video",
        videoId: video.id,
        songId: video.songId,
        releaseTrackId: video.releaseTrackId,
        title: video.songTitle,
        subtitle: video.artistName,
        artworkUrl: video.posterUrl,
        href,
      },
    };
  });
}
