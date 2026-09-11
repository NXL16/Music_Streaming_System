"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAmbientHlsPlayer,
  isHlsPlaybackSource,
  type AmbientHlsPlayer,
} from "../ambient-hls-player";

const PREVIEW_DEBOUNCE_MS = 100;
const PREVIEW_WIDTH = 240;

/** Lazily decodes a single video frame for the timeline preview. */
export function useVideoFramePreview(
  src: string,
  refreshKey: number,
  enabled: boolean,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<AmbientHlsPlayer | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestedTimeRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const requestFrameRef = useRef<(time: number) => void>(() => {});
  const [image, setImage] = useState<string>();

  useEffect(() => {
    if (!enabled) {
      requestFrameRef.current = () => {};
      const clearImageFrame = requestAnimationFrame(() => setImage(undefined));
      return () => cancelAnimationFrame(clearImageFrame);
    }

    const video = videoRef.current;
    if (!video) return;

    startedRef.current = false;
    requestedTimeRef.current = null;
    setImage(undefined);

    const seekToRequestedTime = () => {
      const requestedTime = requestedTimeRef.current;
      if (requestedTime === null || !Number.isFinite(video.duration)) return;
      requestedTimeRef.current = null;
      video.currentTime = Math.max(0, Math.min(video.duration, requestedTime));
    };
    const captureFrame = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const canvas = document.createElement("canvas");
      canvas.width = PREVIEW_WIDTH;
      canvas.height = Math.round(
        (video.videoHeight / video.videoWidth) * PREVIEW_WIDTH,
      );
      const context = canvas.getContext("2d");
      if (!context) return;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        setImage(canvas.toDataURL("image/jpeg", 0.78));
      } catch {
        // A source without canvas CORS permission falls back to the poster.
        setImage(undefined);
      }
    };
    const startForPreview = (time: number) => {
      requestedTimeRef.current = time;
      if (startedRef.current) {
        seekToRequestedTime();
        return;
      }
      startedRef.current = true;
      if (isHlsPlaybackSource(src)) {
        playerRef.current = createAmbientHlsPlayer({
          video,
          src,
          profile: "hero",
          onPlayable: () => undefined,
          onReady: seekToRequestedTime,
          onFatalError: () => setImage(undefined),
        });
        playerRef.current.start();
        return;
      }
      video.src = src;
      video.load();
    };

    video.addEventListener("loadedmetadata", seekToRequestedTime);
    video.addEventListener("seeked", captureFrame);
    requestFrameRef.current = startForPreview;
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      requestFrameRef.current = () => {};
      playerRef.current?.destroy();
      playerRef.current = null;
      video.pause();
      video.removeEventListener("loadedmetadata", seekToRequestedTime);
      video.removeEventListener("seeked", captureFrame);
      video.removeAttribute("src");
      video.load();
    };
  }, [enabled, refreshKey, src]);

  const previewAt = useCallback((time: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      requestFrameRef.current(time);
    }, PREVIEW_DEBOUNCE_MS);
  }, []);

  return { image, previewAt, videoRef };
}
