import type { ComponentProps, CSSProperties } from "react";
import PlaybackItem from "./playback-item";

type NowPlayingProps = Omit<ComponentProps<typeof PlaybackItem>, "variant"> & {
  containerClassName?: string;
  style?: CSSProperties;
};

export default function NowPlaying({
  containerClassName = "",
  style,
  ...playbackProps
}: NowPlayingProps) {
  return (
    <div className={`now-playing ${containerClassName}`} style={style}>
      <PlaybackItem {...playbackProps} variant="compact" />
    </div>
  );
}
