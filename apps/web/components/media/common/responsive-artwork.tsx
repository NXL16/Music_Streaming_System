"use client";

import type { CSSProperties } from "react";
import { useState } from "react";

type ResponsiveArtworkProps = {
  alt: string;
  className?: string;
  fetchPriority?: "auto" | "high" | "low";
  height: number;
  loading?: "eager" | "lazy";
  pictureClassName?: string;
  role?: string;
  sizes?: string;
  src: string;
  srcSet?: string;
  style?: CSSProperties;
  width: number;
};

export default function ResponsiveArtwork({
  alt,
  className,
  fetchPriority = "auto",
  height,
  loading = "lazy",
  pictureClassName,
  role,
  sizes,
  src,
  srcSet,
  style,
  width,
}: ResponsiveArtworkProps) {
  const [failedSrcSet, setFailedSrcSet] = useState<string>();
  const hasFailed = failedSrcSet === srcSet;

  return (
    <picture
      key={`${src}|${srcSet ?? ""}|${sizes ?? ""}`}
      className={pictureClassName}
    >
      {!hasFailed && srcSet && <source sizes={sizes} srcSet={srcSet} />}
      <img
        alt={alt}
        className={className}
        decoding="async"
        fetchPriority={fetchPriority}
        height={height}
        loading={loading}
        onError={() => setFailedSrcSet(srcSet)}
        role={role}
        src={src}
        style={style}
        width={width}
      />
    </picture>
  );
}
