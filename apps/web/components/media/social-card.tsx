import Link from "next/link";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CardPlayButton from "./common/card-play-button";
import SocialCardMetadata from "./social-card-metadata";
import { playCatalogResource } from "@/lib/catalog/play-catalog-resource";

type SocialCardProps = MediaCardProps & {
  cardType: "social";
};

export default function SocialCard(props: SocialCardProps) {
  return (
    <MediaCardShell artworkColor={props.artworkColors.main}>
      <div className="flex flex-row gap-3 items-start">
        <div className="media-card-artwork w-20 shrink-0 rounded-(--global-border-radius-medium,7px) shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] relative z-(--z-default) after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
          <CardArtwork
            variant="cover"
            title={props.title}
            altText={props.altText}
            imageSrcSet={props.imageSrcSet}
            artworkColors={props.artworkColors}
            sizes="80px"
          />

          <div className="media-card-interaction rounded-[inherit] size-full opacity-(--scrimOpacity,0) absolute top-0 transition-(--global-transition) z-[calc(var(--z-default)+1)]">
            {props.slug && (
              <Link
                className="text-transparent block size-full absolute inset-0 z-(--z-default) wrap-break-word"
                href={props.slug}
              >
                {props.title}
              </Link>
            )}

            <CardPlayButton
              variant="cover"
              onPlay={() => {
                void playCatalogResource(props.resourceType, props.resourceId);
              }}
            />
          </div>
        </div>

        <SocialCardMetadata
          title={props.title}
          subtitle={props.subtitle}
          description={props.description}
          typeTag={props.typeTag}
        />
      </div>
    </MediaCardShell>
  );
}
