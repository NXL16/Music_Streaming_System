"use client";

import { useEffect, useRef, useState } from "react";
import { LyricsScene, type ArtworkTone } from "@/lib/player/lyrics-scene";

type LyricsBackgroundProps = {
  artworkSrcSet?: string;
  artworkUrl?: string;
};

type LoadedArtwork = {
  image: HTMLImageElement;
  tone: ArtworkTone;
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

function getArtworkTone(image: HTMLImageElement): ArtworkTone {
  try {
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "balanced";

    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    let luminance = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      luminance +=
        (0.2126 * pixels[index] +
          0.7152 * pixels[index + 1] +
          0.0722 * pixels[index + 2]) /
        255;
    }

    const averageLuminance = luminance / (pixels.length / 4);
    if (averageLuminance < 0.32) return "dark";
    if (averageLuminance > 0.7) return "bright";
  } catch {
    // Cross-origin artwork may not allow canvas readback; use the safe preset.
  }

  return "balanced";
}

export function LyricsBackground({
  artworkSrcSet,
  artworkUrl,
}: LyricsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LyricsScene | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [initialArtwork, setInitialArtwork] = useState<LoadedArtwork | null>(
    null,
  );
  const sourceArtworkUrl =
    getBackgroundArtworkUrl(artworkSrcSet) ?? artworkUrl ?? FALLBACK_ARTWORK;
  const backgroundArtworkUrl = getPixiArtworkUrl(sourceArtworkUrl);

  useEffect(() => {
    let cancelled = false;
    let handled = false;
    const artwork = new Image();
    artwork.decoding = "async";
    const handleLoad = () => {
      if (cancelled || handled) return;

      handled = true;
      const scene = sceneRef.current;
      const tone = getArtworkTone(artwork);
      if (scene) {
        scene.transitionToArtwork(artwork, tone);
      } else {
        setInitialArtwork({ image: artwork, tone });
      }
    };

    artwork.addEventListener("load", handleLoad, { once: true });
    artwork.src = backgroundArtworkUrl;

    if (artwork.complete && artwork.naturalWidth > 0) handleLoad();

    return () => {
      cancelled = true;
      artwork.removeEventListener("load", handleLoad);
    };
  }, [backgroundArtworkUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !initialArtwork) return;
    const viewport = canvas.parentElement;
    if (!viewport) return;

    let revealFrame: number | null = null;
    let resizeFrame: number | null = null;

    const getViewportSize = () => ({
      width: Math.round(viewport.clientWidth),
      height: Math.round(viewport.clientHeight),
    });

    const createScene = () => {
      const { width, height } = getViewportSize();
      if (sceneRef.current || !width || !height) return;

      // Do not reveal the canvas until its first artwork is decoded. Otherwise
      // Pixi initially renders transparent and exposes the grey CSS fallback.
      const scene = new LyricsScene(
        canvas,
        initialArtwork.image,
        initialArtwork.tone,
      );
      sceneRef.current = scene;
      revealFrame = requestAnimationFrame(() => {
        revealFrame = requestAnimationFrame(() => setIsVisible(true));
      });
    };

    const resizeScene = () => {
      resizeFrame = null;
      const { width, height } = getViewportSize();
      if (!width || !height) return;

      if (!sceneRef.current) {
        createScene();
        return;
      }

      sceneRef.current.resize(width, height);
    };

    const observer = new ResizeObserver(() => {
      if (resizeFrame === null) {
        resizeFrame = requestAnimationFrame(resizeScene);
      }
    });

    // Observe the viewport wrapper, never the Pixi canvas: changing a canvas
    // backing buffer would otherwise recursively trigger this observer.
    observer.observe(viewport);
    const frame = requestAnimationFrame(createScene);

    return () => {
      cancelAnimationFrame(frame);
      if (revealFrame !== null) cancelAnimationFrame(revealFrame);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, [initialArtwork]);

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
