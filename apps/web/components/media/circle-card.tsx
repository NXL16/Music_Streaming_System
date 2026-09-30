import Link from "next/link";
import type { MediaCardProps } from "./media-card.types";
import MediaCardShell from "./common/media-card-shell";
import CardArtwork from "./common/card-artwork";
import CircleCardMetadata from "./circle-card-metadata";

type CircleCardProps = MediaCardProps & {
  cardType: "circle";
  isShelfDetail?: boolean;
  isArtistShelfItem?: boolean;
};

export default function CircleCard(props: CircleCardProps) {
  const cardId = props.resourceId || props.id;
  const cardContent = (
    <div className="text-center">
      <div className="overflow-hidden relative rounded-[50%] shadow-[0_1px_1px_rgba(0,0,0,.01),0_2px_2px_rgba(0,0,0,.01),0_4px_4px_rgba(0,0,0,.02),0_8px_8px_rgba(0,0,0,.03),0_14px_14px_rgba(0,0,0,.03)] z-(--z-default) before:absolute before:top-0 before:z-(--z-default) before:block before:size-full before:max-h-full before:max-w-full before:pointer-events-none before:rounded-[50%] before:shadow-[inset_0_0_0_1px_rgba(128,128,128,.1)] before:content-[''] after:absolute after:inset-0 after:z-1 after:rounded-[50%] after:bg-[#333333]/30 after:opacity-0 after:transition-opacity after:duration-100 after:ease-in group-hover:after:opacity-100">
        <CardArtwork
          variant="cover"
          title={props.title}
          altText={props.altText}
          imageSrcSet={props.imageSrcSet}
          artworkColors={props.artworkColors}
          sizes="94px"
        />
      </div>
      <CircleCardMetadata title={props.title} />
    </div>
  );

  return (
    <MediaCardShell
      id={cardId}
      artworkColor={props.artworkColors.main}
      href={props.slug}
      liClassName={props.isShelfDetail ? "pb-7" : undefined}
      isArtistShelfItem={props.isArtistShelfItem}
      onOpen={props.onOpen}
    >
      {props.slug ? (
        <Link
          className="block [--linkHoverTextDecoration:none]"
          href={props.slug}
          onPointerDown={(event) => {
            if (event.button === 0) props.onOpen?.();
          }}
          onClick={(event) => {
            if (event.detail === 0) props.onOpen?.();
          }}
        >
          {cardContent}
        </Link>
      ) : (
        cardContent
      )}
    </MediaCardShell>
  );
}
