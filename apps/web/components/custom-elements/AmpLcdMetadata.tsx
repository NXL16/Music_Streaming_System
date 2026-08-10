import { ElementType } from "react";
import { type PlayerSong } from "@/lib/player/use-player-store";
import AmpMarqueeText from "./AmpMarqueeText";

const AmpCustomElement = "amp-lcd-metadata" as ElementType;

type AmpLcdMetadataProps = {
  currentSong: PlayerSong | null;
  isPlaying?: boolean;
  onCloseModal?: () => void;
};

export default function AmpLcdMetadata({
  currentSong,
  isPlaying = false,
  onCloseModal,
}: AmpLcdMetadataProps) {
  return (
    <AmpCustomElement
      hydrated=""
      className="[--lcd-height:80px] [--lcd-justify-text:start] [--lcd-secondary-text-color:var(--systemSecondary-onDark)] [--lcd-meta-explicit-icon-size:17px] [--stopped-marquee-mask:linear-gradient(270deg,transparent,#000_15px)] [--stopped-marquee-mask-rtl:linear-gradient(-270deg,transparent,#000_15px)] [--animated-marquee-mask:linear-gradient(90deg,transparent,#000_30px,#000_calc(100%-30px),transparent)] grid pt-5.5 w-full flex-1 min-w-0 overflow-hidden"
    >
      <div className="max-w-full h-[calc(var(--lcd-height,44px)-3px)] flex flex-col grow [align-items:var(--lcd-justify-text,center)] justify-center overflow-hidden relative">
        <div className="w-full max-w-full">
          <AmpMarqueeText
            isPrimary
            currentSong={currentSong}
            isPlaying={isPlaying}
            onCloseModal={onCloseModal}
          />
        </div>

        <AmpMarqueeText
          currentSong={currentSong}
          isPlaying={isPlaying}
          onCloseModal={onCloseModal}
        />
      </div>
    </AmpCustomElement>
  );
}
