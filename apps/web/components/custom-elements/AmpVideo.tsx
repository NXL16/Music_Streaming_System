"use client";

import { type ElementType } from "react";
import { useAmbientVideo } from "./use-ambient-video";

type AmbientVideoVariant = "home" | "hero" | "artist";

interface AmbientVideoProps {
  src: string;
  variant?: AmbientVideoVariant;
  /** Keeps the detail hero loaded while lightweight card video is pooled. */
  keepAlive?: boolean;
  keepMountedHorizontally?: boolean;
}

const AmpAmbientVideoTag = "amp-ambient-video" as ElementType;

export default function AmbientVideo({
  src,
  variant = "home",
  keepAlive = false,
  keepMountedHorizontally = false,
}: AmbientVideoProps) {
  const { ampElementRef, videoRef, shouldRenderMedia, isMediaReady } =
    useAmbientVideo({
      src,
      keepAlive,
      keepMountedHorizontally,
    });

  return (
    <AmpAmbientVideoTag
      ref={ampElementRef}
      className="absolute inset-0 size-full rounded-[inherit] overflow-hidden z-(--z-default) data-[playing=true]:will-change-transform data-[playing=true]:mask-[radial-gradient(#fff,#000)] data-[playing=true]:[-webkit-mask-image:radial-gradient(#fff,#000)]"
      data-playing="false"
      aria-hidden="true"
      src={src}
      hydrated=""
    >
      {shouldRenderMedia && (
        <video
          ref={videoRef}
          className={`object-cover z-1 ${
            variant === "artist"
              ? "absolute inset-0 size-full object-top"
              : variant === "hero"
                ? "absolute inset-0 size-full"
                : "absolute bottom-[-9999px] left-[-9999px] m-auto right-[-9999px] top-[-9999px] h-(--editorialVideoHeight,100%) w-(--editorialVideoWidth,auto)"
          } ${keepAlive && !isMediaReady ? "opacity-0" : "opacity-100"} transition-opacity duration-150`}
          preload={keepAlive ? "auto" : "none"}
          playsInline
          loop
          muted
          disableRemotePlayback
        />
      )}
    </AmpAmbientVideoTag>
  );
}
