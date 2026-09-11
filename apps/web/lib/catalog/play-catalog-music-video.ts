import { usePlayerStore, type PlayerSong } from "@/lib/player/use-player-store";
import { getCatalogReleaseTrack } from "./catalog.api";
import { mapCatalogTracks } from "./catalog.mapper";
import type { CatalogMusicVideo } from "./music-videos.api";

function musicVideoManifestUrl(videoAssetId: string) {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  return `${apiUrl}/playback/videos/${encodeURIComponent(videoAssetId)}/manifest.m3u8`;
}

export function toVideoPlayerSong(
  video: CatalogMusicVideo,
  song: PlayerSong,
): PlayerSong {
  // A video shares the Song's identity and catalog metadata, but lyrics are
  // an audio-only feature. Do not let a Song opened as video activate any
  // lyric surface or lyric fetch.
  const videoSong = { ...song };
  delete videoSong.hasLyrics;

  return {
    ...videoSong,
    // Song metadata remains canonical. A Music Video changes only the media
    // source and artwork shown while that source is active.
    playbackUrl: musicVideoManifestUrl(video.videoAssetId),
    playbackKind: "video",
    video: {
      id: video.id,
      poster: video.posterUrl || video.songArtwork?.url,
      posterSrcSet:
        video.posterSrcSet || video.posterUrl || video.songArtwork?.url,
    },
  };
}

function fallbackSongFromVideo(video: CatalogMusicVideo): PlayerSong {
  const artworkUrl = video.songArtwork?.url || video.posterUrl || "";
  return {
    id: video.songId,
    releaseTrackId: video.releaseTrackId,
    title: video.songTitle,
    artist: video.artistName,
    artists: video.artists.map((artist) => ({
      id: artist.artistId,
      name: artist.name,
      url: artist.url,
    })),
    album: video.albumName,
    durationSec: Math.round(video.durationMillis / 1000),
    artworkUrl,
    artworkSrcSet: artworkUrl,
    thumbnailArtworkSrcSet: artworkUrl,
    artworkBgColor: video.songArtwork?.bgColor,
    contentRating: video.contentRating,
    playbackUrl: `mse:${video.songId}`,
  };
}

/** Starts a Music Video in the shared player using its linked Song metadata. */
export function playCatalogMusicVideo(
  video: CatalogMusicVideo,
  knownSong?: PlayerSong | null,
): boolean {
  if (!video.videoAssetId) return false;
  const player = usePlayerStore.getState();
  // Start synchronously in the click event. Awaiting a catalog request first
  // loses browser user activation and causes audible video autoplay to fail.
  const initialSong = knownSong ?? fallbackSongFromVideo(video);
  player.setQueue([toVideoPlayerSong(video, initialSong)]);
  player.setVideoPlayerOpen(true);

  if (!knownSong) {
    void getCatalogReleaseTrack(video.releaseTrackId)
      .then((catalog) =>
        mapCatalogTracks(catalog).find(
          (item) => item.releaseTrackId === video.releaseTrackId,
        ),
      )
      .then((song) => {
        if (!song) return;
        usePlayerStore
          .getState()
          .replaceCurrentSong(toVideoPlayerSong(video, song));
      })
      .catch(() => {
        // The initial snapshot is enough to keep playback available.
      });
  }
  return true;
}
