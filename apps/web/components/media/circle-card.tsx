import Link from "next/link";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CardPlayButton from "./common/card-play-button";
import CircleCardMetadata from "./circle-card-metadata";

type CircleCardProps = MediaCardProps & {
  cardType: "circle";
};

export default function CircleCard(props: CircleCardProps) {
  return (
    <MediaCardShell artworkColor={props.artworkColors.main}>
      <>
        <div className="media-card-artwork rounded-full shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] relative z-(--z-default) overflow-hidden after:content-[''] after:absolute after:inset-0 after:rounded-full after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
          <div className="rounded-full overflow-hidden">
            <CardArtwork
              variant="cover"
              title={props.title}
              altText={props.altText}
              imageSrcSet={props.imageSrcSet}
              artworkColors={props.artworkColors}
            />
          </div>

          <div className="media-card-interaction rounded-full size-full opacity-(--scrimOpacity,0) absolute top-0 transition-(--global-transition) z-[calc(var(--z-default)+1)]">
            {props.slug && (
              <Link
                className="text-transparent block size-full absolute inset-0 z-(--z-default) wrap-break-word"
                href={props.slug}
              >
                {props.title}
              </Link>
            )}

            <CardPlayButton variant="station" />
          </div>
        </div>

        <CircleCardMetadata title={props.title} />
      </>
    </MediaCardShell>
  );
}
