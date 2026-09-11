"use client";
import { useMemo } from "react";
import { usePlayerStore } from "@/lib/player/use-player-store";
import M404WindowTakeover from "./m404-window-takeover";
export type MusicVideoSource = {
  id: string;
  src: string;
  title: string;
  artist: string;
  poster?: string;
};
export default function MusicVideoPlayer() {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const open = usePlayerStore((state) => state.videoPlayerOpen);
  const setVideoPlayerOpen = usePlayerStore(
    (state) => state.setVideoPlayerOpen,
  );
  const playbackKind = currentSong?.playbackKind;
  const videoId = currentSong?.video?.id;
  const videoPoster = currentSong?.video?.poster;
  const playbackUrl = currentSong?.playbackUrl;
  const title = currentSong?.title;
  const artist = currentSong?.artist;
  const artworkUrl = currentSong?.artworkUrl;
  const source = useMemo(
    () =>
      playbackKind === "video" && videoId && playbackUrl && title && artist
        ? {
          id: videoId,
          src: playbackUrl,
          title,
          artist,
          poster: videoPoster ?? artworkUrl,
        }
        : null,
    [
      artist,
      artworkUrl,
      playbackKind,
      playbackUrl,
      title,
      videoId,
      videoPoster,
    ],
  );

  return (
    <M404WindowTakeover
      source={source}
      open={open}
      onClose={() => setVideoPlayerOpen(false)}
    />
  );
}
