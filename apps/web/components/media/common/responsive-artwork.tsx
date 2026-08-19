"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import OfflineArtworkFallback from "./offline-artwork-fallback";

type ResponsiveArtworkProps = {
  alt: string;
  className?: string;
  fetchPriority?: "auto" | "high" | "low";
  height: number;
  loading?: "eager" | "lazy";
  onError?: () => void;
  onLoad?: () => void;
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
  className = "",
  fetchPriority = "auto",
  height,
  loading = "lazy",
  onError,
  onLoad,
  pictureClassName,
  role,
  sizes,
  src,
  srcSet,
  style,
  width,
}: ResponsiveArtworkProps) {
  const [failedSrcSet, setFailedSrcSet] = useState<string>();
  const [loadedArtworkKey, setLoadedArtworkKey] = useState<string>();
  const onLoadRef = useRef(onLoad);
  const activeArtworkKey = `${src}|${srcSet ?? ""}`;
  const hasFailed = Boolean(srcSet) && failedSrcSet === srcSet;
  const hasLoaded = loadedArtworkKey === activeArtworkKey;

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    if (hasLoaded) onLoadRef.current?.();
  }, [activeArtworkKey, hasLoaded]);

  if (hasFailed) return <OfflineArtworkFallback />;

  return (
    <picture
      key={`${activeArtworkKey}|${sizes ?? ""}`}
      className={pictureClassName}
    >
      {srcSet && <source sizes={sizes} srcSet={srcSet} />}
      <img
        alt={alt}
        className={`${className} align-baseline`}
        decoding="async"
        fetchPriority={fetchPriority}
        height={height}
        loading={loading}
        onError={() => {
          setFailedSrcSet(srcSet);
          onError?.();
        }}
        onLoad={() => {
          setLoadedArtworkKey(activeArtworkKey);
        }}
        role={role}
        src={src}
        style={hasLoaded ? style : { ...style, opacity: 0 }}
        width={width}
      />
    </picture>
  );
}
