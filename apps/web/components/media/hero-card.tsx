import Link from "next/link";
import HeroCardMetadata from "./hero-card-metadata";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CardPlayButton from "./common/card-play-button";
import { playCatalogResource } from "@/lib/catalog/play-catalog-resource";

type HeroCardProps = MediaCardProps & {
  cardType: "hero";
  priority?: boolean;
};

export default function HeroCard(props: HeroCardProps) {
  return (
    <MediaCardShell
      isHero
      artworkColor={props.artworkColors.main}
      metadataTextPrimary={props.artworkColors.textPrimary}
      metadataTextSecondary={props.artworkColors.textSecondary}
      metadataTextTertiary={props.artworkColors.textTertiary}
    >
      <div className="h-full rounded-(--global-border-radius-xlarge,14px) overflow-hidden relative z-(--z-default)">
        <div className="h-full relative z-[calc(var(--z-default)-1)]">
          <div className="rounded-[inherit] relative z-(--z-default) h-full">
            <CardArtwork variant="hero" {...props} priority={props.priority} />
          </div>
        </div>

        {props.artworkColors.textScrimColor &&
          props.artworkColors.textScrimOpacity !== undefined && (
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none z-2"
              style={{
                background: `linear-gradient(to bottom, transparent 64%, ${props.artworkColors.textScrimColor} 100%)`,
                opacity: props.artworkColors.textScrimOpacity,
              }}
            />
          )}

        <div className="media-card-interaction absolute top-0 bottom-0 inset-s-0 inset-e-0 m-auto opacity-(--scrimOpacity,0) transition-(--global-transition) z-3">
          <div className="absolute top-0 bottom-0 inset-s-0 inset-e-0 m-auto z-1">
            {props.slug && (
              <Link
                href={props.slug}
                aria-label={props.title}
                className="block h-full w-full rounded-none"
              />
            )}
          </div>
          <CardPlayButton
            variant="hero"
            onPlay={() => {
              void playCatalogResource(props.resourceType, props.resourceId);
            }}
          />
        </div>

        <HeroCardMetadata {...props} />
      </div>
    </MediaCardShell>
  );
}
