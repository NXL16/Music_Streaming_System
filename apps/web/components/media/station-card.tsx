import Link from "next/link";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CardPlayButton from "./common/card-play-button";
import CardContextMenu from "./common/card-context-menu";
import StationCardMetadata from "./station-card-metadata";
import { playSystemStation } from "@/lib/recommendations/stations-for-you";

type StationCardProps = MediaCardProps & {
  cardType: "station";
};

export default function StationCard(props: StationCardProps) {
  const handlePlay = () => {
    props.onPlay?.();
    void playSystemStation(props.resourceId);
  };

  return (
    <MediaCardShell artworkColor={props.artworkColors.main}>
      <>
        <div className="media-card-artwork rounded-(--global-border-radius-medium,7px) shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] relative z-(--z-default) after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
          <CardArtwork
            variant="cover"
            title={props.title}
            altText={props.altText}
            imageSrcSet={props.imageSrcSet}
            artworkColors={props.artworkColors}
          />

          <div className="media-card-interaction rounded-[inherit] size-full opacity-(--scrimOpacity,0) absolute top-0 transition-(--global-transition) z-[calc(var(--z-default)+1)]">
            {props.slug && (
              <Link
                className="text-transparent block size-full absolute z-(--z-default)"
                href={props.slug}
                onClick={props.onOpen}
              >
                {props.title}
              </Link>
            )}

            {!props.slug && (
              <button
                aria-label={`Play ${props.title}`}
                className="text-transparent block size-full absolute z-(--z-default)"
                onClick={handlePlay}
                type="button"
              />
            )}

            <CardPlayButton
              ariaLabel={`Play ${props.title}`}
              variant="station"
              onPlay={handlePlay}
            />
            <CardContextMenu />
          </div>
        </div>

        <StationCardMetadata {...props} />
      </>
    </MediaCardShell>
  );
}
