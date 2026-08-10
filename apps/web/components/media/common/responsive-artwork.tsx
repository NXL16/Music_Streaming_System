"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type ResponsiveArtworkProps = {
  alt: string;
  className?: string;
  fetchPriority?: "auto" | "high" | "low";
  height: number;
  loading?: "eager" | "lazy";
  pictureClassName?: string;
  retainPreviousArtwork?: boolean;
  role?: string;
  sizes?: string;
  src: string;
  srcSet?: string;
  style?: CSSProperties;
  width: number;
};

export default function ResponsiveArtwork({
  alt,
  className = "",
  fetchPriority = "auto",
  height,
  loading = "lazy",
  pictureClassName,
  retainPreviousArtwork = false,
  role,
  sizes,
  src,
  srcSet,
  style,
  width,
}: ResponsiveArtworkProps) {
  const [displayedSrcSet, setDisplayedSrcSet] = useState(srcSet);
  const [failedSrcSet, setFailedSrcSet] = useState<string>();
  const activeSrcSet = retainPreviousArtwork ? displayedSrcSet : srcSet;
  const hasFailed = failedSrcSet === activeSrcSet;

  useEffect(() => {
    if (!retainPreviousArtwork) return;
    if (srcSet === displayedSrcSet) return;

    let cancelled = false;
    const image = new Image();
    const showArtwork = () => {
      if (!cancelled) setDisplayedSrcSet(srcSet);
    };

    image.addEventListener("load", showArtwork, { once: true });
    image.srcset = srcSet ?? "";
    image.sizes = sizes ?? "";
    image.src = src;

    if (image.complete && image.naturalWidth > 0) showArtwork();

    return () => {
      cancelled = true;
    };
  }, [displayedSrcSet, retainPreviousArtwork, sizes, src, srcSet]);

  return (
    <picture
      key={`${src}|${activeSrcSet ?? ""}|${sizes ?? ""}`}
      className={pictureClassName}
    >
      {!hasFailed && activeSrcSet && (
        <source sizes={sizes} srcSet={activeSrcSet} />
      )}
      <img
        alt={alt}
        className={`${className} align-baseline`}
        decoding="async"
        fetchPriority={fetchPriority}
        height={height}
        loading={loading}
        onError={() => setFailedSrcSet(activeSrcSet)}
        role={role}
        src={src}
        style={style}
        width={width}
      />
    </picture>
  );
}
