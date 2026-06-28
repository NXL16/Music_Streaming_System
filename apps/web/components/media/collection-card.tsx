import Link from "next/link";
import CollectionCardMetadata from "./collection-card-metadata";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CardPlayButton from "./common/card-play-button";
import CardContextMenu from "./common/card-context-menu";

type CollectionCardProps = MediaCardProps & {
  cardType: "collection";
};

export default function CollectionCard(props: CollectionCardProps) {
  return (
    <MediaCardShell artworkColor={props.artworkColors.main}>
      <>
        <div className="rounded-(--global-border-radius-medium,7px) shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] relative z-(--z-default) after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
          <CardArtwork
            variant="cover"
            title={props.title}
            altText={props.altText}
            imageUrl={props.imageUrl}
            imageSrcSet={props.imageSrcSet}
            artworkColors={props.artworkColors}
          />

          <div className="rounded-[inherit] h-full opacity-(--scrimOpacity,0) absolute top-0 transition-(--global-transition) w-full z-[calc(var(--z-default)+1)]">
            {props.slug ? (
              <Link
                className="text-transparent block h-full absolute w-full z-(--z-default) wrap-break-word"
                href={props.slug}
              >
                {props.title}
              </Link>
            ) : null}

            <CardPlayButton variant="cover" />
            <CardContextMenu />
          </div>
        </div>

        <CollectionCardMetadata {...props} />
      </>
    </MediaCardShell>
  );
}
