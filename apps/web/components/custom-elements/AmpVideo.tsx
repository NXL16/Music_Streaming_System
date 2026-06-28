"use client";

import { useEffect, useRef, useState, type ElementType } from "react";
import Hls from "hls.js";

const MAX_CONCURRENT_VIDEOS = 6;
const MAX_WARM_VIDEOS = 6;
const WARM_RETENTION_MS = 4_000;
const SCROLL_IDLE_MS = 160;

type PageScrollListener = (isScrolling: boolean) => void;

const pageScrollListeners = new Set<PageScrollListener>();
let isPageScrolling = false;
let scrollIdleTimer: ReturnType<typeof setTimeout> | undefined;
let pageScrollTarget: HTMLElement | undefined;

function handlePageScroll() {
  if (!isPageScrolling) {
    isPageScrolling = true;
    pageScrollListeners.forEach((listener) => listener(true));
  }

  if (scrollIdleTimer) clearTimeout(scrollIdleTimer);

  scrollIdleTimer = setTimeout(() => {
    scrollIdleTimer = undefined;
    isPageScrolling = false;
    pageScrollListeners.forEach((listener) => listener(false));
  }, SCROLL_IDLE_MS);
}

function subscribeToPageScroll(
  target: HTMLElement,
  listener: PageScrollListener,
) {
  pageScrollListeners.add(listener);

  if (pageScrollListeners.size === 1) {
    pageScrollTarget = target;
    pageScrollTarget.addEventListener("scroll", handlePageScroll, {
      passive: true,
    });
  }

  return () => {
    pageScrollListeners.delete(listener);

    if (pageScrollListeners.size > 0) return;

    pageScrollTarget?.removeEventListener("scroll", handlePageScroll);
    pageScrollTarget = undefined;

    if (scrollIdleTimer) {
      clearTimeout(scrollIdleTimer);
      scrollIdleTimer = undefined;
    }

    isPageScrolling = false;
  };
}

type WarmVideoEntry = {
  destroy: () => void;
  priority: number;
};

const warmVideos = new Map<symbol, WarmVideoEntry>();

type VideoEntry = {
  evict: () => void;
  priority: number;
  interactionPriority: number;
};

const activeVideos = new Map<symbol, VideoEntry>();
let prioritySequence = 0;

const videoManager = {
  request(
    id: symbol,
    activate: () => void,
    evict: () => void,
    interactionPriority = 0,
  ): boolean {
    warmVideos.delete(id);

    const currentEntry = activeVideos.get(id);
    if (currentEntry) {
      currentEntry.priority = ++prioritySequence;
      currentEntry.interactionPriority = interactionPriority;
      activate();
      return true;
    }

    if (activeVideos.size >= MAX_CONCURRENT_VIDEOS) {
      let evictionCandidate: [symbol, VideoEntry] | undefined;

      for (const entry of activeVideos) {
        if (
          !evictionCandidate ||
          entry[1].interactionPriority <
            evictionCandidate[1].interactionPriority ||
          (entry[1].interactionPriority ===
            evictionCandidate[1].interactionPriority &&
            entry[1].priority < evictionCandidate[1].priority)
        ) {
          evictionCandidate = entry;
        }
      }

      if (
        evictionCandidate &&
        evictionCandidate[1].interactionPriority > interactionPriority
      ) {
        return false;
      }

      if (evictionCandidate) {
        evictionCandidate[1].evict();
        activeVideos.delete(evictionCandidate[0]);
      }
    }

    activeVideos.set(id, {
      evict,
      priority: ++prioritySequence,
      interactionPriority,
    });
    activate();
    return true;
  },

  release(id: symbol): void {
    activeVideos.delete(id);
    warmVideos.delete(id);

    if (activeVideos.size === 0 && warmVideos.size === 0) {
      prioritySequence = 0;
    }
  },

  suspend(id: symbol, destroy: () => void): void {
    activeVideos.delete(id);
    warmVideos.delete(id);
    warmVideos.set(id, {
      destroy,
      priority: ++prioritySequence,
    });

    if (warmVideos.size <= MAX_WARM_VIDEOS) return;

    let oldestEntry: [symbol, WarmVideoEntry] | undefined;

    for (const entry of warmVideos) {
      if (!oldestEntry || entry[1].priority < oldestEntry[1].priority) {
        oldestEntry = entry;
      }
    }

    if (oldestEntry) {
      warmVideos.delete(oldestEntry[0]);
      oldestEntry[1].destroy();
    }
  },

  updateInteractionPriority(id: symbol, interactionPriority: number): void {
    const entry = activeVideos.get(id);
    if (entry) {
      entry.interactionPriority = interactionPriority;
      entry.priority = ++prioritySequence;
    }
  },

  isActive(id: symbol): boolean {
    return activeVideos.has(id);
  },
};

interface AmbientVideoProps {
  src: string;
}

const AmpAmbientVideoTag = "amp-ambient-video" as ElementType;

export default function AmbientVideo({ src }: AmbientVideoProps) {
  const ampElementRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const idRef = useRef<symbol>(Symbol());
  const isNearViewportRef = useRef(false);
  const isPageScrollingRef = useRef(false);
  const resumePlaybackRef = useRef<() => void>(() => {});
  const suspendPlaybackRef = useRef<() => void>(() => {});
  const [shouldMountMedia, setShouldMountMedia] = useState(false);

  useEffect(() => {
    const scrollContainer = ampElementRef.current?.closest<HTMLElement>(
      "[data-app-scroll-container]",
    );

    if (!scrollContainer) return;

    return subscribeToPageScroll(scrollContainer, (scrolling) => {
        isPageScrollingRef.current = scrolling;

        if (scrolling) {
          suspendPlaybackRef.current();
        } else if (isNearViewportRef.current) {
          resumePlaybackRef.current();
        }
      });
  }, []);

  useEffect(() => {
    const ampElement = ampElementRef.current;
    if (!ampElement) return;

    let destroyTimer: ReturnType<typeof setTimeout> | undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (destroyTimer) {
            clearTimeout(destroyTimer);
            destroyTimer = undefined;
          }

          isNearViewportRef.current = true;
          setShouldMountMedia(true);
          resumePlaybackRef.current();
          return;
        }

        isNearViewportRef.current = false;
        suspendPlaybackRef.current();

        if (destroyTimer) clearTimeout(destroyTimer);
        destroyTimer = setTimeout(() => {
          destroyTimer = undefined;
          setShouldMountMedia(false);
        }, WARM_RETENTION_MS);
      },
      {
        rootMargin: "150px",
        threshold: 0.01,
      },
    );

    observer.observe(ampElement);
    return () => {
      observer.disconnect();
      if (destroyTimer) clearTimeout(destroyTimer);

      isNearViewportRef.current = false;
      suspendPlaybackRef.current();
    };
  }, []);

  useEffect(() => {
    if (!shouldMountMedia) return;

    const video = videoRef.current;
    const ampElement = ampElementRef.current;
    if (!video || !ampElement) return;

    const id = idRef.current;
    const cardElement = ampElement.closest("li");
    let nativeLoadedHandler: (() => void) | null = null;
    let playAttempt = 0;
    let disposed = false;

    video.muted = true;
    video.defaultMuted = true;

    const markPlaying = () => {
      if (disposed) return;
      ampElement.setAttribute("data-playing", "true");
      ampElement.setAttribute("playing", "");
    };

    const markPaused = () => {
      ampElement.setAttribute("data-playing", "false");
      ampElement.removeAttribute("playing");
    };

    const doPlay = () => {
      const currentAttempt = ++playAttempt;

      video
        .play()
        .then(() => {
          if (currentAttempt === playAttempt) {
            markPlaying();
          }
        })
        .catch((error: unknown) => {
          if (
            disposed ||
            currentAttempt !== playAttempt ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            return;
          }
          console.warn("[AmbientVideo] Autoplay bị chặn:", error);
        });
    };

    const destroyMedia = () => {
      playAttempt++;
      video.pause();
      markPaused();

      const hls = hlsRef.current;
      hlsRef.current = null;
      hls?.destroy();

      if (nativeLoadedHandler) {
        video.removeEventListener("loadedmetadata", nativeLoadedHandler);
        nativeLoadedHandler = null;
      }

      video.removeAttribute("src");
      video.load();
    };

    const tryPlay = () => {
      if (videoManager.isActive(id)) {
        doPlay();
      }
    };

    const setupHls = () => {
      if (hlsRef.current) {
        hlsRef.current.startLoad(-1);
        return;
      }

      if (video.currentSrc) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          maxMaxBufferLength: 3,
          maxBufferLength: 2,
          enableWorker: true,
          autoStartLoad: true,
          startFragPrefetch: false,
          lowLatencyMode: true,
        });

        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            videoManager.release(id);
            destroyMedia();
          }
        });
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        nativeLoadedHandler = () => {
          nativeLoadedHandler = null;
          tryPlay();
        };
        video.src = src;
        video.addEventListener("loadedmetadata", nativeLoadedHandler, {
          once: true,
        });
      }
    };

    const requestPlayback = (interactionPriority = 0) => {
      if (isPageScrollingRef.current) return;

      const activated = videoManager.request(
        id,
        setupHls,
        destroyMedia,
        interactionPriority,
      );

      if (activated && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        tryPlay();
      }
    };

    const suspendPlayback = () => {
      playAttempt++;
      video.pause();
      markPaused();
      hlsRef.current?.stopLoad();

      if (hlsRef.current || video.currentSrc) {
        videoManager.suspend(id, destroyMedia);
      } else {
        videoManager.release(id);
      }
    };

    resumePlaybackRef.current = () => requestPlayback();
    suspendPlaybackRef.current = suspendPlayback;

    const handlePointerEnter = () => requestPlayback(1);
    const handlePointerLeave = () =>
      videoManager.updateInteractionPriority(id, 0);

    cardElement?.addEventListener("pointerenter", handlePointerEnter);
    cardElement?.addEventListener("pointerleave", handlePointerLeave);

    if (isNearViewportRef.current) {
      requestPlayback();
    }

    return () => {
      disposed = true;
      resumePlaybackRef.current = () => {};
      suspendPlaybackRef.current = () => {};
      cardElement?.removeEventListener("pointerenter", handlePointerEnter);
      cardElement?.removeEventListener("pointerleave", handlePointerLeave);
      videoManager.release(id);
      destroyMedia();
    };
  }, [shouldMountMedia, src]);

  return (
    <AmpAmbientVideoTag
      ref={ampElementRef}
      className="absolute w-full h-full rounded-[inherit] overflow-hidden z-(--z-default) data-[playing=true]:will-change-transform ddata-[playing=true]:mask-[radial-gradient(#fff,#000)] data-[playing=true]:[-webkit-mask-image:radial-gradient(#fff,#000)]"
      data-playing="false"
      aria-hidden="true"
      src={src}
      hydrated=""
    >
      {shouldMountMedia ? (
        <video
          ref={videoRef}
          className="absolute inset-[-9999px] m-auto h-(--editorialVideoHeight,100%) w-(--editorialVideoWidth,auto) object-cover z-1"
          preload="none"
          playsInline
          loop
          muted
          data-loop
          disableRemotePlayback
        />
      ) : null}
    </AmpAmbientVideoTag>
  );
}
