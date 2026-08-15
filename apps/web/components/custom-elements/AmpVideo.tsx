"use client";

import { useEffect, useRef, useState, type ElementType } from "react";
import type Hls from "hls.js";

// Home cards are decorative videos. Keeping too many decoders active competes
// with scrolling and image compositing, especially on integrated GPUs.
const MAX_CONCURRENT_VIDEOS = 4;
const MAX_WARM_VIDEOS = 4;
const WARM_RETENTION_MS = 1_500;
const SCROLL_IDLE_MS = 160;
const HERO_QUALITY_SAMPLE_COUNT = 2;

type PageScrollListener = (isScrolling: boolean) => void;

const pageScrollListeners = new Set<PageScrollListener>();
let isPageScrolling = false;
let scrollIdleTimer: ReturnType<typeof setTimeout> | undefined;
let scrollStateFrame: number | undefined;
let pageScrollTarget: HTMLElement | undefined;

function notifyPageScrollListeners(isScrolling: boolean) {
  pageScrollListeners.forEach((listener) => listener(isScrolling));
}

function handlePageScroll() {
  if (!isPageScrolling) {
    isPageScrolling = true;
    // Do not pause multiple HLS instances from the scroll event itself.
    // Let the browser commit the scroll first, then batch this work into one
    // animation frame.
    scrollStateFrame = requestAnimationFrame(() => {
      scrollStateFrame = undefined;
      if (isPageScrolling) notifyPageScrollListeners(true);
    });
  }

  if (scrollIdleTimer) clearTimeout(scrollIdleTimer);

  scrollIdleTimer = setTimeout(() => {
    scrollIdleTimer = undefined;
    isPageScrolling = false;
    notifyPageScrollListeners(false);
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

    if (scrollStateFrame !== undefined) {
      cancelAnimationFrame(scrollStateFrame);
      scrollStateFrame = undefined;
    }

    isPageScrolling = false;
  };
}

type WarmVideoEntry = {
  destroy: () => void;
  priority: number;
};

type VideoEntry = {
  evict: () => void;
  priority: number;
  interactionPriority: number;
};

const warmVideos = new Map<symbol, WarmVideoEntry>();
const activeVideos = new Map<symbol, VideoEntry>();

let prioritySequence = 0;

const videoManager = {
  request(
    id: symbol,
    activate: () => void,
    evict: () => void,
    interactionPriority = 0,
  ) {
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
        const [, videoEntry] = entry;

        if (
          !evictionCandidate ||
          videoEntry.interactionPriority <
            evictionCandidate[1].interactionPriority ||
          (videoEntry.interactionPriority ===
            evictionCandidate[1].interactionPriority &&
            videoEntry.priority < evictionCandidate[1].priority)
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

  suspend(id: symbol, destroy: () => void) {
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

    if (!oldestEntry) return;

    warmVideos.delete(oldestEntry[0]);
    oldestEntry[1].destroy();
  },

  release(id: symbol) {
    activeVideos.delete(id);
    warmVideos.delete(id);

    if (activeVideos.size === 0 && warmVideos.size === 0) {
      prioritySequence = 0;
    }
  },

  updateInteractionPriority(id: symbol, interactionPriority: number) {
    const entry = activeVideos.get(id);
    if (!entry) return;

    entry.interactionPriority = interactionPriority;
    entry.priority = ++prioritySequence;
  },

  isActive(id: symbol) {
    return activeVideos.has(id);
  },
};

type AmbientVideoVariant = "home" | "artist";

interface AmbientVideoProps {
  src: string;
  variant?: AmbientVideoVariant;

  /**
   * Dùng cho artist header hoặc các trang chỉ có 1 video HLS lớn.
   *
   * false:
   * - Phù hợp home/list nhiều video.
   * - Khi scroll/rời viewport sẽ pause/stopLoad/unmount để tiết kiệm tài nguyên.
   *
   * true:
   * - Phù hợp artist/detail hero.
   * - Không pause khi scroll.
   * - Không stopLoad khi scroll.
   * - Không unmount khi rời viewport.
   */
  keepAlive?: boolean;
}

const AmpAmbientVideoTag = "amp-ambient-video" as ElementType;

export default function AmbientVideo({
  src,
  variant = "home",
  keepAlive = false,
}: AmbientVideoProps) {
  const ampElementRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const idRef = useRef(Symbol());

  const isNearViewportRef = useRef(false);
  const isPageScrollingRef = useRef(false);

  const resumePlaybackRef = useRef<() => void>(() => {});
  const suspendPlaybackRef = useRef<() => void>(() => {});

  const [shouldMountMedia, setShouldMountMedia] = useState(false);
  const [readyMediaSrc, setReadyMediaSrc] = useState<string>();
  const shouldRenderMedia = keepAlive || shouldMountMedia;
  const isMediaReady = !keepAlive || readyMediaSrc === src;

  useEffect(() => {
    if (keepAlive) return;

    const scrollContainer = ampElementRef.current?.closest<HTMLElement>(
      "[data-app-scroll-container]",
    );

    if (!scrollContainer) return;

    return subscribeToPageScroll(scrollContainer, (scrolling) => {
      isPageScrollingRef.current = scrolling;

      if (scrolling) {
        suspendPlaybackRef.current();
        return;
      }

      if (isNearViewportRef.current) {
        resumePlaybackRef.current();
      }
    });
  }, [keepAlive]);

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

        if (keepAlive) return;

        suspendPlaybackRef.current();

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

      if (destroyTimer) {
        clearTimeout(destroyTimer);
      }

      isNearViewportRef.current = false;

      if (!keepAlive) {
        suspendPlaybackRef.current();
      }
    };
  }, [keepAlive]);

  useEffect(() => {
    if (!shouldRenderMedia) return;

    const video = videoRef.current;
    const ampElement = ampElementRef.current;

    if (!video || !ampElement) return;

    const id = idRef.current;
    const cardElement = ampElement.closest("li");

    let nativeCanPlayHandler: (() => void) | undefined;
    let playAttempt = 0;
    let disposed = false;

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

    const cleanupNativeHandler = () => {
      if (!nativeCanPlayHandler) return;

      video.removeEventListener("canplay", nativeCanPlayHandler);
      nativeCanPlayHandler = undefined;
    };

    const destroyMedia = () => {
      playAttempt++;

      video.pause();
      markPaused();

      hlsRef.current?.destroy();
      hlsRef.current = null;

      cleanupNativeHandler();

      video.removeAttribute("src");
      video.load();
    };

    const doPlay = () => {
      if (disposed) return;

      const currentAttempt = ++playAttempt;

      video
        .play()
        .then(() => {
          if (disposed || currentAttempt !== playAttempt) return;
          markPlaying();
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

    const tryPlay = () => {
      if (disposed) return;

      if (keepAlive || videoManager.isActive(id)) {
        doPlay();
      }
    };

    const replayKeepAliveVideo = () => {
      if (!keepAlive || disposed) return;

      // Reuse the existing media source and its buffered rendition. Native
      // video.loop restarts HLS adaptation from the lowest level on some
      // browsers, making every new loop visibly soften before recovering.
      video.currentTime = 0;
      tryPlay();
    };

    const setupNativeHls = () => {
      nativeCanPlayHandler = () => {
        if (disposed) return;

        setReadyMediaSrc(src);
        tryPlay();
      };

      video.addEventListener("canplay", nativeCanPlayHandler);
      video.src = src;
    };

    const setupHls = () => {
      if (disposed) return;

      if (hlsRef.current) {
        hlsRef.current.startLoad(-1);
        tryPlay();
        return;
      }

      if (video.currentSrc) {
        tryPlay();
        return;
      }

      // Lightweight cards keep Safari's native HLS path. A keep-alive hero
      // uses hls.js where MSE is available so its rendition survives loops.
      if (
        !keepAlive &&
        video.canPlayType("application/vnd.apple.mpegurl")
      ) {
        setupNativeHls();
        return;
      }

      // Import the HLS runtime only after this card is both rendered and
      // eligible to play. This keeps hls.js out of normal card/list routes.
      void import("hls.js").then(({ default: Hls }) => {
        if (disposed || hlsRef.current || video.currentSrc) return;

        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            setupNativeHls();
          }
          return;
        }

        const hls = new Hls({
          enableWorker: true,
          autoStartLoad: true,

          maxBufferLength: keepAlive ? 30 : 2,
          maxMaxBufferLength: keepAlive ? 60 : 3,

          startFragPrefetch: keepAlive,
          lowLatencyMode: !keepAlive,

          capLevelToPlayerSize: !keepAlive,
          abrEwmaDefaultEstimate: keepAlive ? 5_000_000 : 500_000,
        });

        hlsRef.current = hls;

        let bufferedFragments = 0;
        let qualityLocked = false;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          tryPlay();
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (disposed || !keepAlive || qualityLocked) return;

          bufferedFragments += 1;
          if (bufferedFragments < HERO_QUALITY_SAMPLE_COUNT) return;

          // Let ABR measure the real connection during startup, then preserve
          // that chosen rendition across every later loop of this hero video.
          const selectedLevel = hls.nextAutoLevel;
          if (selectedLevel < 0) return;

          qualityLocked = true;
          hls.loadLevel = selectedLevel;
          hls.nextLevel = selectedLevel;
          setReadyMediaSrc(src);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (disposed) return;

          if (!data.fatal) return;

          videoManager.release(id);
          destroyMedia();
        });

        hls.loadSource(src);
        hls.attachMedia(video);
      });
    };

    const requestPlayback = (interactionPriority = 0) => {
      if (disposed) return;

      if (keepAlive) {
        setupHls();
        return;
      }

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
      if (disposed) return;

      playAttempt++;

      video.pause();
      markPaused();

      if (keepAlive) return;

      hlsRef.current?.stopLoad();

      if (hlsRef.current || video.currentSrc) {
        videoManager.suspend(id, destroyMedia);
      } else {
        videoManager.release(id);
      }
    };

    const handlePointerEnter = () => {
      requestPlayback(1);
    };

    const handlePointerLeave = () => {
      videoManager.updateInteractionPriority(id, 0);
    };

    video.muted = true;
    video.defaultMuted = true;
    video.loop = !keepAlive;
    video.playsInline = true;

    if (keepAlive) {
      video.addEventListener("ended", replayKeepAliveVideo);
    }

    resumePlaybackRef.current = () => requestPlayback();
    suspendPlaybackRef.current = suspendPlayback;

    if (!keepAlive) {
      cardElement?.addEventListener("pointerenter", handlePointerEnter);
      cardElement?.addEventListener("pointerleave", handlePointerLeave);
    }

    if (keepAlive || isNearViewportRef.current) {
      requestPlayback();
    }

    return () => {
      disposed = true;

      resumePlaybackRef.current = () => {};
      suspendPlaybackRef.current = () => {};

      if (!keepAlive) {
        cardElement?.removeEventListener("pointerenter", handlePointerEnter);
        cardElement?.removeEventListener("pointerleave", handlePointerLeave);
      } else {
        video.removeEventListener("ended", replayKeepAliveVideo);
      }

      videoManager.release(id);
      destroyMedia();
    };
  }, [shouldRenderMedia, src, keepAlive]);

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
              : "absolute bottom-[-9999px] left-[-9999px] m-auto right-[-9999px] top-[-9999px] h-(--editorialVideoHeight,100%) w-(--editorialVideoWidth,auto)"
          } ${keepAlive && !isMediaReady ? "opacity-0" : "opacity-100"} transition-opacity duration-150`}
          preload={keepAlive ? "auto" : "none"}
          playsInline
          loop={!keepAlive}
          muted
          disableRemotePlayback
        />
      )}
    </AmpAmbientVideoTag>
  );
}
