"use client";

import { useEffect, useRef, useState } from "react";
import { LyricsScene } from "@/lib/player/lyrics-scene";

type LyricsBackgroundProps = {
  artworkSrcSet?: string;
  artworkUrl?: string;
};

const FALLBACK_ARTWORK = "/assets/artwork/1x1.gif";
const R2_ARTWORK_PREFIX = "https://r2.404hz.me/";

function getBackgroundArtworkUrl(srcSet?: string) {
  if (!srcSet) return undefined;

  const candidates = srcSet
    .split(",")
    .map((entry) => {
      const [url, descriptor] = entry.trim().split(/\s+/, 2);
      return { url, width: Number.parseInt(descriptor, 10) || 0 };
    })
    .filter((candidate) => candidate.url);

  if (!candidates.length) return undefined;

  candidates.sort((a, b) => a.width - b.width);
  return (
    candidates.find((candidate) => candidate.width >= 632)?.url ??
    candidates.at(-1)?.url
  );
}

function getPixiArtworkUrl(artworkUrl: string) {
  if (!artworkUrl.startsWith(R2_ARTWORK_PREFIX)) return artworkUrl;

  return `/api/artwork?url=${encodeURIComponent(artworkUrl)}`;
}

export function LyricsBackground({
  artworkSrcSet,
  artworkUrl,
}: LyricsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LyricsScene | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const sourceArtworkUrl =
    getBackgroundArtworkUrl(artworkSrcSet) ?? artworkUrl ?? FALLBACK_ARTWORK;
  const backgroundArtworkUrl = getPixiArtworkUrl(sourceArtworkUrl);
  const artworkUrlRef = useRef(backgroundArtworkUrl);

  useEffect(() => {
    artworkUrlRef.current = backgroundArtworkUrl;
    const scene = sceneRef.current;
    if (!scene) return;

    let cancelled = false;
    const artwork = new Image();
    const transition = () => {
      if (!cancelled) sceneRef.current?.transitionToArtwork(artwork);
    };

    artwork.addEventListener("load", transition, { once: true });
    artwork.src = backgroundArtworkUrl;

    if (artwork.complete && artwork.naturalWidth > 0) transition();

    return () => {
      cancelled = true;
    };
  }, [backgroundArtworkUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const createScene = () => {
      if (sceneRef.current || !canvas.clientWidth || !canvas.clientHeight)
        return;

      const scene = new LyricsScene(canvas, artworkUrlRef.current);
      sceneRef.current = scene;
      requestAnimationFrame(() => setIsVisible(true));
    };

    const observer = new ResizeObserver(() => {
      if (!sceneRef.current) {
        createScene();
        return;
      }

      sceneRef.current.resize(canvas.clientWidth, canvas.clientHeight);
    });

    observer.observe(canvas);
    const frame = requestAnimationFrame(createScene);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`block size-full align-baseline transition-opacity duration-800 ease-out ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden
    />
  );
}
