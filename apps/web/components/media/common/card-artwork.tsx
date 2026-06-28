import type { CSSProperties } from "react";
import AmbientVideo from "@/components/custom-elements/AmpVideo";
import { MediaCardProps } from "../media-card.types";

type SharedCardArtworkProps = Pick<
  MediaCardProps,
  | "title"
  | "altText"
  | "imageUrl"
  | "imageSrcSet"
  | "artworkColors"
>;

type CardArtworkProps = SharedCardArtworkProps &
  (
    | {
        variant: "hero";
        videoSrc?: string;
      }
    | {
        variant: "cover";
        videoSrc?: never;
      }
  );

export default function CardArtwork({
  variant,
  title,
  altText,
  imageUrl,
  imageSrcSet,
  artworkColors,
  videoSrc,
}: CardArtworkProps) {
  if (variant === "hero") {
    return (
      <>
        <div
          className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border h-full max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) min-[1000px]:[anchor-name:--shelf-first-artwork]"
          style={
            {
              "--artwork-bg-color": artworkColors.bg,
              "--aspect-ratio": "0.75",
              "--placeholder-bg-color": "transparent",
            } as CSSProperties
          }
        >
          <picture>
            <source
              sizes="(max-width: 1679px) 450px, 600px"
              srcSet={imageSrcSet}
              type="image/webp"
            />
            <img
              alt={altText ?? title}
              className="rounded-[inherit] block h-full w-full object-cover"
              loading="lazy"
              src={imageUrl}
              decoding="async"
              width={600}
              height={800}
            />
          </picture>
        </div>

        {videoSrc ? (
          <div className="absolute top-0 h-full w-full pointer-events-none">
            <AmbientVideo src={videoSrc} />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      className="min-[1000px]:[anchor-name:--shelf-first-artwork] bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) [--override-placeholder-bg-color:var(--artwork-bg-color)] after:content-[''] after:block after:absolute after:top-0 after:w-full after:h-0 after:min-w-full after:min-h-full after:max-w-full after:max-h-full after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:opacity-(--containerInnerStrokeAlpha,0.25) after:pointer-events-none after:z-[calc(var(--z-default)+1)]"
      style={
        {
          "--artwork-bg-color": artworkColors.bg,
          "--aspect-ratio": "1",
          "--placeholder-bg-color": "transparent",
          aspectRatio: "1 / 1",
        } as CSSProperties
      }
    >
      <picture>
        <source
          sizes="(max-width:1319px) 296px,(min-width:1320px) and (max-width:1679px) 316px,316px"
          srcSet={imageSrcSet}
        />
        <img
          alt={altText ?? title}
          className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
          loading="lazy"
          src={imageUrl}
          decoding="async"
          width={316}
          height={316}
          fetchPriority="auto"
          style={{
            opacity: 1,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </picture>

    </div>
  );
}
