import type { ComponentProps, RefObject } from "react";
import type { PlaybackAudio } from "@/lib/player/playback-audio";
import NowPlaying from "./now-playing";
import AmpLyrics from "@/components/custom-elements/AmpLyrics";

type MobileLyricsProps = Omit<
  ComponentProps<typeof NowPlaying>,
  "containerClassName" | "style" | "onTogglePlayback"
> & {
  audioRef: RefObject<PlaybackAudio | null>;
  onPullDown: (offset: number) => void;
  onPullEnd: () => void;
};

export default function MobileLyrics({
  audioRef,
  onPullDown,
  onPullEnd,
  ...props
}: MobileLyricsProps) {
  return (
    <div className="mobile-lyrics">
      <div className="touch-none">
        <NowPlaying {...props} />
      </div>

      <AmpLyrics
        songId={props.currentSong?.id}
        audioRef={audioRef}
        inDetailView
        activeLineTopRatio={0.14}
        onPullDown={onPullDown}
        onPullEnd={onPullEnd}
      />
    </div>
  );
}
