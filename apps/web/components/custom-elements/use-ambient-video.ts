"use client";

import { useEffect, useRef, useState } from "react";
import {
  createAmbientHlsPlayer,
  type AmbientHlsPlayer,
} from "./ambient-hls-player";
import { ambientVideoManager } from "./ambient-video-manager";
import {
  isAmbientScrollInProgress,
  retainAmbientScrollState,
  subscribeAmbientScrollState,
} from "./ambient-scroll-state";

const WARM_RETENTION_MS = 1_500;

type UseAmbientVideoOptions = {
  src: string;
  keepAlive: boolean;
  keepMountedHorizontally: boolean;
};

export function useAmbientVideo({
  src,
  keepAlive,
  keepMountedHorizontally,
}: UseAmbientVideoOptions) {
  const ampElementRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idRef = useRef(Symbol());
  const isNearViewportRef = useRef(false);
  const hasMountedInViewportRef = useRef(false);
  const resumePlaybackRef = useRef<() => void>(() => {});
  const suspendPlaybackRef = useRef<() => void>(() => {});
  const [shouldMountMedia, setShouldMountMedia] = useState(false);
  const [readyMediaSrc, setReadyMediaSrc] = useState<string>();

  const shouldRenderMedia = keepAlive || shouldMountMedia;
  const isMediaReady = !keepAlive || readyMediaSrc === src;

  // Track page scrolling as soon as the card exists, before its video is
  // allowed to mount. This prevents the first HLS startup at a shelf edge.
  useEffect(() => retainAmbientScrollState(), []);

  useEffect(() => {
    const ampElement = ampElementRef.current;
    if (!ampElement) return;

    let destroyTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVerticallyVisible = Boolean(
          entry.rootBounds &&
            entry.boundingClientRect.bottom > entry.rootBounds.top &&
            entry.boundingClientRect.top < entry.rootBounds.bottom,
        );
        const isVisible = keepMountedHorizontally
          ? isVerticallyVisible &&
            (entry.isIntersecting || hasMountedInViewportRef.current)
          : entry.isIntersecting;

        if (isVisible) {
          if (destroyTimer) clearTimeout(destroyTimer);
          destroyTimer = undefined;
          isNearViewportRef.current = true;
          if (entry.isIntersecting) hasMountedInViewportRef.current = true;
          setShouldMountMedia(true);
          resumePlaybackRef.current();
          return;
        }

        isNearViewportRef.current = false;
        if (keepMountedHorizontally && !isVerticallyVisible) {
          hasMountedInViewportRef.current = false;
        }
        if (keepAlive) return;
        suspendPlaybackRef.current();
        if (keepAlive) return;
        if (destroyTimer) clearTimeout(destroyTimer);
        destroyTimer = setTimeout(() => {
          destroyTimer = undefined;
          setShouldMountMedia(false);
        }, WARM_RETENTION_MS);
      },
      {
        rootMargin: keepAlive ? "300px" : "150px",
        threshold: 0.01,
      },
    );

    observer.observe(ampElement);
    return () => {
      observer.disconnect();
      if (destroyTimer) clearTimeout(destroyTimer);
      isNearViewportRef.current = false;
      if (!keepAlive) suspendPlaybackRef.current();
    };
  }, [keepAlive, keepMountedHorizontally]);

  useEffect(() => {
    if (!shouldRenderMedia) return;
    const video = videoRef.current;
    const ampElement = ampElementRef.current;
    if (!video || !ampElement) return;

    const id = idRef.current;
    const cardElement = ampElement.closest("li");
    let disposed = false;
    let playAttempt = 0;

    const markPlaying = () => {
      if (disposed) return;
      ampElement.setAttribute("data-playing", "true");
      ampElement.setAttribute("playing", "");
    };
    const markPaused = () => {
      if (disposed) return;
      ampElement.setAttribute("data-playing", "false");
      ampElement.removeAttribute("playing");
    };
    const tryPlay = () => {
      if (disposed || (!keepAlive && !ambientVideoManager.isActive(id))) return;
      const attempt = ++playAttempt;
      void video.play().then(
        () => {
          if (!disposed && attempt === playAttempt) markPlaying();
        },
        (error: unknown) => {
          if (
            !disposed &&
            attempt === playAttempt &&
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            console.warn("[AmbientVideo] Autoplay bị chặn:", error);
          }
        },
      );
    };

    let player: AmbientHlsPlayer;
    const createPlayer = () =>
      createAmbientHlsPlayer({
        video,
        src,
        profile: keepAlive ? "hero" : "card",
        onPlayable: tryPlay,
        onReady: () => {
          if (keepAlive) setReadyMediaSrc(src);
        },
        onFatalError: () => {
          ambientVideoManager.release(id);
          destroyMedia();
        },
      });

    const destroyMedia = () => {
      playAttempt += 1;
      video.pause();
      markPaused();
      player.destroy();
      // An evicted card can remain mounted while still near the viewport. Give
      // it a fresh, idle controller so the manager can activate it again.
      if (!disposed) player = createPlayer();
    };
    player = createPlayer();
    const requestPlayback = (interactionPriority = 0) => {
      if (disposed) return;
      // Starting an HLS session (and its decoder) while the page is moving is
      // the expensive path that makes approaching a video shelf feel jerky.
      // The shared scroll subscription below resumes it once scrolling settles.
      if (isAmbientScrollInProgress()) return;
      if (keepAlive) {
        player.start();
        return;
      }
      const activated = ambientVideoManager.request(
        id,
        player.start,
        destroyMedia,
        interactionPriority,
      );
      if (activated && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        tryPlay();
      }
    };
    const suspendPlayback = () => {
      if (disposed) return;
      playAttempt += 1;
      video.pause();
      markPaused();
      if (keepAlive) return;
      player.stopLoad();
      if (video.currentSrc) {
        ambientVideoManager.suspend(id, destroyMedia);
      } else {
        ambientVideoManager.release(id);
      }
    };
    const handlePointerEnter = () => requestPlayback(1);
    const handlePointerLeave = () =>
      ambientVideoManager.updateInteractionPriority(id, 0);

    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    if (!keepAlive) {
      cardElement?.addEventListener("pointerenter", handlePointerEnter);
      cardElement?.addEventListener("pointerleave", handlePointerLeave);
    }

    resumePlaybackRef.current = () => requestPlayback();
    suspendPlaybackRef.current = suspendPlayback;
    if (keepAlive || isNearViewportRef.current) requestPlayback();

    const unsubscribeScrollState = subscribeAmbientScrollState((scrolling) => {
      if (disposed) return;
      if (scrolling) {
        if (video.paused) return;
        playAttempt += 1;
        video.pause();
        markPaused();
        return;
      }

      if (keepAlive || isNearViewportRef.current) requestPlayback();
    });

    return () => {
      disposed = true;
      unsubscribeScrollState();
      resumePlaybackRef.current = () => {};
      suspendPlaybackRef.current = () => {};
      if (!keepAlive) {
        cardElement?.removeEventListener("pointerenter", handlePointerEnter);
        cardElement?.removeEventListener("pointerleave", handlePointerLeave);
      }
      ambientVideoManager.release(id);
      destroyMedia();
    };
  }, [keepAlive, shouldRenderMedia, src]);

  return { ampElementRef, videoRef, shouldRenderMedia, isMediaReady };
}
