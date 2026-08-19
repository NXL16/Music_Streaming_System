"use client";

import { useEffect, useMemo, useRef } from "react";
import { LyricsScene } from "@/lib/player/lyrics-scene";

type LyricsBackgroundProps = {
  artworkSrcSet?: string;
};

const R2_ARTWORK_PREFIX = "https://r2.404hz.me/";

function getBackgroundArtworkUrl(srcSet?: string): string | undefined {
  if (!srcSet) return undefined;

  const candidates = srcSet
    .split(",")
    .map((entry) => {
      const [url, descriptor = ""] = entry.trim().split(/\s+/, 2);

      return {
        url,
        width: Number.parseInt(descriptor, 10) || 0,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        url: string;
        width: number;
      } => Boolean(candidate.url),
    );

  return candidates.find((candidate) => candidate.width === 40)?.url;
}

function getPixiArtworkUrl(artworkUrl: string): string {
  if (!artworkUrl.startsWith(R2_ARTWORK_PREFIX)) return artworkUrl;

  return `/api/artwork?url=${encodeURIComponent(artworkUrl)}`;
}

export function LyricsBackground({ artworkSrcSet }: LyricsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LyricsScene | null>(null);
  const currentArtworkRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);

  const artworkURL = useMemo(() => {
    const sourceArtworkUrl = getBackgroundArtworkUrl(artworkSrcSet);

    if (!sourceArtworkUrl) return undefined;

    return getPixiArtworkUrl(sourceArtworkUrl);
  }, [artworkSrcSet]);

  useEffect(() => {
    if (!artworkURL) return;
    let disposed = false;
    let decodeRequested = false;

    const applyArtwork = () => {
      if (disposed || currentArtworkRef.current === artworkURL) return;

      if (sceneRef.current) {
        sceneRef.current.updateArtwork(artworkURL);
        currentArtworkRef.current = artworkURL;
        return;
      }

      const createScene = () => {
        frameRef.current = null;

        if (disposed || sceneRef.current) return;

        const canvas = canvasRef.current;

        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();

        if (rect.width <= 0 || rect.height <= 0) {
          frameRef.current = requestAnimationFrame(createScene);

          return;
        }

        sceneRef.current = new LyricsScene(canvas, artworkURL);
        currentArtworkRef.current = artworkURL;
      };

      frameRef.current = requestAnimationFrame(createScene);
    };

    const decodeAndApplyArtwork = () => {
      if (decodeRequested) return;
      decodeRequested = true;

      void image.decode().catch(() => undefined).finally(applyArtwork);
    };

    const image = new Image();
    image.decoding = "async";
    image.onload = decodeAndApplyArtwork;
    image.src = artworkURL;

    if (image.complete && image.naturalWidth > 0) {
      decodeAndApplyArtwork();
    }

    return () => {
      disposed = true;
      image.onload = null;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);

        frameRef.current = null;
      }
    };
  }, [artworkURL]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);

        frameRef.current = null;
      }

      if (sceneRef.current) {
        sceneRef.current.destroy();
        sceneRef.current = null;
      }

      currentArtworkRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="block size-full align-baseline"
    />
  );
}
