import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import { MediaCardProps } from "../media-card.types";
import ResponsiveArtwork from "./responsive-artwork";

const AmbientVideo = dynamic(
  () => import("@/components/custom-elements/AmpVideo"),
  { ssr: false, loading: () => null },
);

type SharedCardArtworkProps = Pick<
  MediaCardProps,
  "title" | "altText" | "imageSrcSet" | "artworkColors"
> & {
  containerClassName?: string;
  aspectRatio?: string;
  containerStyle?: CSSProperties;
  sizes?: string;
  priority?: boolean;
  retainPreviousArtwork?: boolean;
};

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

const PLACEHOLDER_SRC = "/assets/artwork/1x1.gif";

export default function CardArtwork({
  variant,
  title,
  altText,
  imageSrcSet,
  artworkColors,
  videoSrc,
  containerClassName,
  aspectRatio,
  containerStyle,
  sizes,
  priority = false,
  retainPreviousArtwork = false,
}: CardArtworkProps) {
  if (variant === "hero") {
    return (
      <>
        <div
          className={`bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) min-[1000px]:[anchor-name:--shelf-first-artwork] ${containerClassName ?? ""}`}
          style={
            {
              "--artwork-bg-color": artworkColors.bg,
              "--aspect-ratio": "0.75",
              "--placeholder-bg-color": "transparent",
              ...containerStyle,
            } as CSSProperties
          }
        >
          <ResponsiveArtwork
            alt={altText ?? title}
            className="rounded-[inherit] block size-full object-cover"
            fetchPriority={priority ? "high" : "auto"}
            height={800}
            loading={priority ? "eager" : "lazy"}
            pictureClassName="block size-full"
            retainPreviousArtwork={retainPreviousArtwork}
            sizes={sizes || "(max-width: 1679px) 450px, 600px"}
            src={PLACEHOLDER_SRC}
            srcSet={imageSrcSet}
            width={600}
          />
        </div>

        {videoSrc && (
          <div className="absolute top-0 size-full pointer-events-none">
            <AmbientVideo src={videoSrc} />
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={`bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:content-[''] after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,0.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] dark:after:opacity-(--containerInnerStrokeAlpha,0.25) ${containerClassName ?? ""}`}
      style={
        {
          "--artwork-bg-color": artworkColors.bg,
          "--aspect-ratio": aspectRatio ?? "1",
          "--placeholder-bg-color": "transparent",
          ...containerStyle,
        } as CSSProperties
      }
    >
      <ResponsiveArtwork
        alt={altText ?? title}
        className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
        fetchPriority={priority ? "high" : "auto"}
        height={316}
        loading={priority ? "eager" : "lazy"}
        pictureClassName=""
        retainPreviousArtwork={retainPreviousArtwork}
        sizes={
          sizes ||
          "(max-width:1319px) 296px,(min-width:1320px) and (max-width:1679px) 316px,316px"
        }
        src={PLACEHOLDER_SRC}
        srcSet={imageSrcSet}
        style={{ opacity: 1, objectFit: "cover", objectPosition: "top" }}
        width={316}
      />
    </div>
  );
}
