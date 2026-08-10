import { albumRoute } from "@/lib/catalog/album-route";
import { artistRoute } from "@/lib/catalog/artist-route";
import { songRoute } from "@/lib/catalog/song-route";
import type { PlayerSong } from "@/lib/player/use-player-store";
import { projectLinkedArtists } from "@/lib/media/project-linked-artists";

/**
 * The transport-neutral song shape returned by the authenticated Song API.
 * Keep route creation and legacy fallbacks here so a song is represented
 * identically in playlist pages, queues, and player surfaces.
 */
export type SongSummaryProjectionSource = {
  id: string;
  title: string;
  artist?: string;
  artistId?: string;
  artistUrl?: string;
  artists?: Array<{ id: string; name: string; url?: string }>;
  album?: string;
  albumId?: string;
  albumUrl?: string;
  contentRating?: string;
  durationSec?: number;
  coverUrl?: string;
};

export function projectSongSummary(
  song: SongSummaryProjectionSource,
): PlayerSong {
  const artworkUrl = song.coverUrl || "";
  const artists = song.artists?.length
    ? projectLinkedArtists(song.artists)
    : song.artist
      ? [
          {
            id: song.artistId,
            name: song.artist,
            url:
              song.artistId && song.artistUrl
                ? artistRoute(song.artistUrl, song.artistId)
                : undefined,
          },
        ]
      : undefined;

  return {
    id: song.id,
    title: song.title,
    url: songRoute(song.id),
    artist: song.artist || artists?.map((artist) => artist.name).join(", ") || "Unknown Artist",
    artists,
    album: song.album || "",
    albumId: song.albumId,
    albumUrl:
      song.albumId && song.albumUrl
        ? albumRoute(song.albumUrl, song.albumId)
        : undefined,
    durationSec: song.durationSec || 0,
    artworkUrl,
    artworkSrcSet: artworkUrl || undefined,
    thumbnailArtworkSrcSet: artworkUrl || undefined,
    contentRating: song.contentRating,
    playbackUrl: `mse:${song.id}`,
  };
}
