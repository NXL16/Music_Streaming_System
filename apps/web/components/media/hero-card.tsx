import Link from "next/link";
import HeroCardMetadata from "./hero-card-metadata";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CardPlayButton from "./common/card-play-button";

type HeroCardProps = MediaCardProps & {
  cardType: "hero";
};

export default function HeroCard(props: HeroCardProps) {
  return (
    <MediaCardShell isHero artworkColor={props.artworkColors.main}>
      <div className="h-full rounded-(--global-border-radius-xlarge,14px) overflow-hidden relative z-(--z-default)">
        <div className="h-full relative z-[calc(var(--z-default)-1)]">
          <div className="rounded-[inherit] relative z-(--z-default) h-full">
            <CardArtwork variant="hero" {...props} />
          </div>
        </div>

        <div className="absolute top-0 bottom-0 inset-s-0 inset-e-0 m-auto opacity-(--scrimOpacity,0) transition-(--global-transition) z-3">
          <div className="absolute top-0 bottom-0 inset-s-0 inset-e-0 m-auto z-1">
            {props.slug ? (
              <Link
                href={props.slug}
                aria-label={props.title}
                className="block h-full w-full rounded-none"
              />
            ) : null}
          </div>

          <CardPlayButton variant="hero" />
        </div>

        <HeroCardMetadata {...props} />
      </div>
    </MediaCardShell>
  );
}
                                                    
