import { ElementType } from "react";
import { type PlayerSong } from "@/lib/player/use-player-store";
import AmpMarqueeText from "./AmpMarqueeText";

const AmpCustomElement = "amp-lcd-metadata" as ElementType;

type AmpLcdMetadataProps = {
  currentSong: PlayerSong | null;
  containerClassName: string;
  isPlaying?: boolean;
  onCloseModal?: () => void;
};

export default function AmpLcdMetadata({
  currentSong,
  containerClassName,
  isPlaying = false,
  onCloseModal,
}: AmpLcdMetadataProps) {
  return (
    <AmpCustomElement hydrated="" className={containerClassName}>
      <div className="lcd-meta">
        <div className="lcd-meta__primary-wrapper">
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
