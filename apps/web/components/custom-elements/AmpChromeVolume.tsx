import { ElementType } from "react";
import VolumeControl from "./VolumeControl";
import AmpVolumeControl from "./AmpVolumeControl";

type AmpChromeVolumeProps = {
  volume: number;
  onSetVolume: (volume: number) => void;
};

const AmpCustomElement = "amp-chrome-volume" as ElementType;

export default function AmpChromeVolume({
  volume,
  onSetVolume,
}: AmpChromeVolumeProps) {
  return (
    <AmpCustomElement className="[--progress-track-color-elapsed:var(--chromeVolumeElapsed)] [--progress-track-color:var(--chromeVolumeTrack)] [--progress-track-color-elapsed-active:var(--chromeVolumeElapsed)] [--progress-track-max-height:var(--progress-thumb-height)] [--progress-thumb-margin:-2px] [--thumb-opacity:1] [--playerVolumePlayhead:var(--chromeVolumeThumb)] [--volumeWidth:var(--chromeVolumeWidth,70px)] [--volume-thumb-box-shadow:inset_0_0_0_1px_var(--chromeVolumeThumbShadowInset),0_1px_1px_0_var(--chromeVolumeThumbShadow)] grid grid-flow-col gap-0.5 items-center [--progress-track-height:4px] [--progress-thumb-width:12px] [--progress-thumb-height:12px] [--chromeVolumeWidth:auto] [--chromeVolumeIcon:var(--systemPrimary-onDark)] [--chromeVolumeTrack:var(--systemTertiary-onDark)] grid-cols-[auto_1fr] w-full">
      <span onClick={() => onSetVolume(0)}>
        <VolumeControl volume={volume} onSetVolume={onSetVolume} />
      </span>
      <AmpVolumeControl volume={volume} onSetVolume={onSetVolume} />
    </AmpCustomElement>
  );
}
