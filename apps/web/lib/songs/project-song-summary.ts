import { albumRoute } from "@/lib/catalog/album-route";
import { artistRoute } from "@/lib/catalog/artist-route";
import { songRoute } from "@/lib/catalog/song-route";
import type { PlayerArtist, PlayerSong } from "@/lib/player/use-player-store";
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
  albumVideoSrc?: string;
  hasLyrics?: boolean;
  contentRating?: string;
  durationSec?: number;
  coverUrl?: string;
  thumbnailCoverSrcSet?: string;
};

/**
 * The one projection from normalized song metadata to the player contract.
 * Source adapters may add their own playback context before calling this
 * function, but routes, fallbacks and the `mse:` transport stay identical.
 */
export type PlayerSongProjectionSource = {
  id: string;
  title: string;
  artist?: string;
  artists?: PlayerArtist[];
  album?: string;
  albumId?: string;
  albumUrl?: string;
  albumVideoSrc?: string;
  hasLyrics?: boolean;
  durationSec?: number;
  artworkUrl?: string;
  artworkSrcSet?: string;
  thumbnailArtworkSrcSet?: string;
  artworkBgColor?: string;
  releaseDate?: string;
  contentRating?: string;
};

export function projectPlayerSong(
  song: PlayerSongProjectionSource,
): PlayerSong {
  const artworkUrl = song.artworkUrl || "";
  const artist =
    song.artist ||
    song.artists?.map((item) => item.name).join(", ") ||
    "Unknown Artist";

  return {
    id: song.id,
    title: song.title,
    url: songRoute(song.id),
    artist,
    artists: song.artists,
    album: song.album || "",
    albumId: song.albumId,
    albumUrl:
      song.albumId && song.albumUrl
        ? albumRoute(song.albumUrl, song.albumId)
        : undefined,
    albumVideoSrc: song.albumVideoSrc,
    hasLyrics: song.hasLyrics,
    durationSec: song.durationSec || 0,
    artworkUrl,
    artworkSrcSet: song.artworkSrcSet || artworkUrl || undefined,
    thumbnailArtworkSrcSet:
      song.thumbnailArtworkSrcSet || artworkUrl || undefined,
    artworkBgColor: song.artworkBgColor,
    releaseDate: song.releaseDate,
    contentRating: song.contentRating,
    playbackUrl: `mse:${song.id}`,
  };
}

export function projectSongSummary(
  song: SongSummaryProjectionSource,
): PlayerSong {
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

  return projectPlayerSong({
    id: song.id,
    title: song.title,
    artist: song.artist,
    artists,
    album: song.album || "",
    albumId: song.albumId,
    albumUrl: song.albumUrl,
    hasLyrics: song.hasLyrics,
    durationSec: song.durationSec,
    artworkUrl: song.coverUrl,
    thumbnailArtworkSrcSet: song.thumbnailCoverSrcSet,
    contentRating: song.contentRating,
  });
}
